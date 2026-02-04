import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'
import {
  BATCH_DETAIL_STATUS_LABELS,
  BATCH_STATUS_LABELS,
  CSA_EVENT,
  CSA_STATUS_LABELS,
  STATE_ACTOR_PERMISSIONS,
  SYSTEM_CSA_EVENTS,
  USER_CSA_EVENTS,
} from './constants'
import type { Actor, BulkTransitionResult, MachineType, TransitionResult } from './interfaces'
import {
  canTransitionBatchDetail,
  getNextBatchDetailState,
} from './machines/batch-detail-status.machine'
import { canTransitionBatch, getNextBatchState } from './machines/batch-status.machine'
import { canTransitionCsa, getNextCsaState } from './machines/csa-status.machine'

@Injectable()
export class StateMachineService {
  private readonly logger = new Logger(StateMachineService.name)

  constructor(private readonly prisma: PrismaService) {}

  canTransition(machine: MachineType, currentState: string, event: string): boolean {
    switch (machine) {
      case 'csaStatus':
        return canTransitionCsa(currentState, event)
      case 'batch':
        return canTransitionBatch(currentState, event)
      case 'batchDetail':
        return canTransitionBatchDetail(currentState, event)
      default:
        return false
    }
  }

  getNextState(machine: MachineType, currentState: string, event: string): string {
    switch (machine) {
      case 'csaStatus':
        return getNextCsaState(currentState, event)
      case 'batch':
        return getNextBatchState(currentState, event)
      case 'batchDetail':
        return getNextBatchDetailState(currentState, event)
      default:
        return currentState
    }
  }

  getStatusLabel(machine: MachineType, status: string): string {
    switch (machine) {
      case 'csaStatus':
        return CSA_STATUS_LABELS[status] ?? status
      case 'batch':
        return BATCH_STATUS_LABELS[status] ?? status
      case 'batchDetail':
        return BATCH_DETAIL_STATUS_LABELS[status] ?? status
      default:
        return status
    }
  }

  // Check if an actor is allowed to trigger an event from a given state
  private isActorAllowed(currentState: string, event: string, actor: Actor): boolean {
    const statePermissions = STATE_ACTOR_PERMISSIONS[currentState]
    if (statePermissions && event in statePermissions) {
      return statePermissions[event].includes(actor)
    }

    if (USER_CSA_EVENTS.has(event)) {
      return true // Both USER and SYSTEM can trigger user events
    }
    if (SYSTEM_CSA_EVENTS.has(event)) {
      return actor === 'SYSTEM'
    }

    return false
  }

  async transitionContact(
    contactId: number,
    event: string,
    actor: Actor,
    userId?: string,
  ): Promise<TransitionResult> {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } })
    if (!contact) {
      return { success: false, reason: 'Contact not found' }
    }

    const currentState = contact.csaStatus ?? ''

    // Check actor permissions (state-based or event-based)
    if (!this.isActorAllowed(currentState, event, actor)) {
      this.logger.warn(`Actor ${actor} not allowed to trigger ${event} from state ${currentState}`)
      return { success: false, reason: 'Event not allowed for users' }
    }

    // Handle RESUME specially - use resume_status field
    let nextState: string
    if (event === CSA_EVENT.RESUME) {
      if (!contact.resumeStatus) {
        return { success: false, reason: 'No resume status available' }
      }
      nextState = contact.resumeStatus
    } else {
      if (!this.canTransition('csaStatus', currentState, event)) {
        return { success: false, reason: 'Invalid transition' }
      }
      nextState = this.getNextState('csaStatus', currentState, event)
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      csaStatus: nextState,
      csaStatusEffectiveDate: new Date(),
      lastUpdatedBy: userId ?? 'SYSTEM',
      lastUpdatedAt: new Date(),
    }

    // Handle HOLD - save current state to resume_status
    if (event === CSA_EVENT.HOLD) {
      updateData.resumeStatus = currentState
      updateData.holdBy = userId
    }

    // Handle RESUME - clear resume fields
    if (event === CSA_EVENT.RESUME) {
      updateData.resumeStatus = null
      updateData.holdBy = null
    }

    await this.prisma.contact.update({
      where: { id: contactId },
      data: updateData,
    })

    this.logger.log(`Contact ${contactId}: ${currentState} → ${nextState} [${event}] by ${actor}`)

    return { success: true, from: currentState, to: nextState }
  }

  async transitionContacts(
    contactIds: number[],
    event: string,
    actor: Actor,
    userId?: string,
  ): Promise<BulkTransitionResult> {
    const result: BulkTransitionResult = { succeeded: [], failed: [] }

    for (const contactId of contactIds) {
      const transitionResult = await this.transitionContact(contactId, event, actor, userId)
      if (transitionResult.success) {
        result.succeeded.push(contactId)
      } else {
        result.failed.push({ id: contactId, reason: transitionResult.reason ?? 'Unknown error' })
      }
    }

    return result
  }

  async transitionBatch(
    batchId: number,
    event: string,
    actor: Actor = 'SYSTEM',
  ): Promise<TransitionResult> {
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } })
    if (!batch) {
      return { success: false, reason: 'Batch not found' }
    }

    const currentState = batch.status

    if (!this.canTransition('batch', currentState, event)) {
      return { success: false, reason: 'Invalid transition' }
    }

    const nextState = this.getNextState('batch', currentState, event)

    await this.prisma.batch.update({
      where: { id: batchId },
      data: { status: nextState },
    })

    this.logger.log(`Batch ${batchId}: ${currentState} → ${nextState} [${event}] by ${actor}`)

    return { success: true, from: currentState, to: nextState }
  }

  async transitionBatchDetail(
    detailId: number,
    event: string,
    actor: Actor = 'SYSTEM',
  ): Promise<TransitionResult> {
    const detail = await this.prisma.contactBatchDetail.findUnique({ where: { id: detailId } })
    if (!detail) {
      return { success: false, reason: 'BatchDetail not found' }
    }

    const currentState = detail.status ?? ''

    if (!this.canTransition('batchDetail', currentState, event)) {
      return { success: false, reason: 'Invalid transition' }
    }

    const nextState = this.getNextState('batchDetail', currentState, event)

    await this.prisma.contactBatchDetail.update({
      where: { id: detailId },
      data: {
        status: nextState,
        lastUpdatedAt: new Date(),
        lastUpdatedBy: 'SYSTEM',
      },
    })

    this.logger.log(
      `BatchDetail ${detailId}: ${currentState} → ${nextState} [${event}] by ${actor}`,
    )

    return { success: true, from: currentState, to: nextState }
  }

  async transitionBatchDetails(
    detailIds: number[],
    event: string,
    actor: Actor = 'SYSTEM',
  ): Promise<BulkTransitionResult> {
    const result: BulkTransitionResult = { succeeded: [], failed: [] }

    for (const detailId of detailIds) {
      const transitionResult = await this.transitionBatchDetail(detailId, event, actor)
      if (transitionResult.success) {
        result.succeeded.push(detailId)
      } else {
        result.failed.push({ id: detailId, reason: transitionResult.reason ?? 'Unknown error' })
      }
    }

    return result
  }
}
