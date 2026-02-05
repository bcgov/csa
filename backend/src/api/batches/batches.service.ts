import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'
import { BATCH_STATUS } from 'src/common/state-machine/constants'
import type { TransitionResult } from 'src/common/state-machine/interfaces'
import { StateMachineService } from 'src/common/state-machine/state-machine.service'
import { BULK_OPERATION_SKIP_REASONS, TRANSACTION_TYPES } from '../contacts/constants'
import { BulkOperationResponse } from '../contacts/interfaces'

export interface AddContactsResult extends BulkOperationResponse {
  batch: {
    id: number
    batchDate: Date | null
    status: string
    recordCount: number
    createdAt: Date
    systemComments: string | null
  }
}

export interface UpdateBatchStatusOptions {
  additionalData?: Record<string, unknown>
}

@Injectable()
export class BatchesService {
  private readonly logger = new Logger(BatchesService.name)

  constructor(
    private prisma: PrismaService,
    private stateMachine: StateMachineService,
  ) {}

  async findAll() {
    return this.prisma.batch.findMany({
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: number) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
    })
    if (!batch) {
      throw new NotFoundException(`Batch ${id} not found`)
    }
    return batch
  }

  // Update a batch's status using the state machine.
  async updateBatchStatus(
    batchId: number,
    event: string,
    options?: UpdateBatchStatusOptions,
  ): Promise<TransitionResult> {
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } })
    if (!batch) {
      return { success: false, reason: 'Batch not found' }
    }

    const currentState = batch.status

    // validate and get next state
    const result = this.stateMachine.transitionBatch(currentState, event)

    if (!result.success) {
      return result
    }

    const nextState = result.to!

    await this.prisma.batch.update({
      where: { id: batchId },
      data: {
        status: nextState,
        ...options?.additionalData,
      },
    })

    this.logger.log(`Batch ${batchId}: ${currentState} → ${nextState} [${event}]`)

    return { success: true, from: currentState, to: nextState }
  }

  // Update a batch detail's status using the state machine.
  async updateBatchDetailStatus(
    detailId: number,
    event: string,
    options?: UpdateBatchStatusOptions,
  ): Promise<TransitionResult> {
    const detail = await this.prisma.contactBatchDetail.findUnique({ where: { id: detailId } })
    if (!detail) {
      return { success: false, reason: 'BatchDetail not found' }
    }

    const currentState = detail.status ?? ''

    // Use state machine to validate and get next state
    const result = this.stateMachine.transitionBatchDetail(currentState, event)

    if (!result.success) {
      return result
    }

    const nextState = result.to!

    await this.prisma.contactBatchDetail.update({
      where: { id: detailId },
      data: {
        status: nextState,
        lastUpdatedAt: new Date(),
        lastUpdatedBy: 'SYSTEM',
        ...options?.additionalData,
      },
    })

    this.logger.log(`BatchDetail ${detailId}: ${currentState} → ${nextState} [${event}]`)

    return { success: true, from: currentState, to: nextState }
  }

  async findBatchContacts(batchId: number) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    })
    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`)
    }

    return this.prisma.contactBatchDetail.findMany({
      where: { batchId },
      include: {
        contact: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            din: true,
            csaStatus: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOrCreatePendingBatch() {
    let pendingBatch = await this.prisma.batch.findFirst({
      where: { status: BATCH_STATUS.PENDING },
    })

    if (!pendingBatch) {
      pendingBatch = await this.prisma.batch.create({
        data: {
          batchDate: null,
          status: BATCH_STATUS.PENDING,
          recordCount: 0,
          createdAt: new Date(),
        },
      })
    }

    return pendingBatch
  }

  async addContactsToPendingBatch(
    contactIds: number[],
    userId: string,
  ): Promise<AddContactsResult> {
    const pendingBatch = await this.findOrCreatePendingBatch()

    const result: AddContactsResult = {
      batch: pendingBatch,
      success: [],
      skipped: [],
    }

    const existingContacts = await this.prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true },
    })
    const existingContactIds = new Set(existingContacts.map((c) => c.id))

    const alreadyInBatch = await this.prisma.contactBatchDetail.findMany({
      where: {
        batchId: pendingBatch.id,
        contactId: { in: contactIds },
      },
      select: { contactId: true },
    })
    const alreadyInBatchIds = new Set(alreadyInBatch.map((c) => c.contactId))

    const now = new Date()
    for (const contactId of contactIds) {
      if (!existingContactIds.has(contactId)) {
        result.skipped.push({ id: contactId, reason: BULK_OPERATION_SKIP_REASONS.NOT_FOUND })
      } else if (alreadyInBatchIds.has(contactId)) {
        result.skipped.push({ id: contactId, reason: BULK_OPERATION_SKIP_REASONS.ALREADY_IN_BATCH })
      } else {
        await this.prisma.contactBatchDetail.create({
          data: {
            contactId,
            batchId: pendingBatch.id,
            transactionType: TRANSACTION_TYPES.APPLICATION,
            status: BATCH_STATUS.PENDING,
            createdAt: now,
            createdBy: userId,
            lastUpdatedAt: now,
            lastUpdatedBy: userId,
          },
        })
        result.success.push(contactId)
      }
    }

    result.batch = await this.prisma.batch.update({
      where: { id: pendingBatch.id },
      data: {
        recordCount: {
          increment: result.success.length,
        },
      },
    })

    return result
  }

  async removeContactFromPendingBatch(contactId: number): Promise<void> {
    const pendingBatch = await this.prisma.batch.findFirst({
      where: { status: BATCH_STATUS.PENDING },
    })

    if (!pendingBatch) {
      throw new NotFoundException('No pending batch exists')
    }

    const detail = await this.prisma.contactBatchDetail.findFirst({
      where: {
        batchId: pendingBatch.id,
        contactId,
      },
    })

    if (!detail) {
      throw new NotFoundException(`Contact ${contactId} not found in pending batch`)
    }

    // Delete the detail and update count
    await this.prisma.$transaction([
      this.prisma.contactBatchDetail.delete({
        where: { id: detail.id },
      }),
      this.prisma.batch.update({
        where: { id: pendingBatch.id },
        data: {
          recordCount: {
            decrement: 1,
          },
        },
      }),
    ])
  }
}
