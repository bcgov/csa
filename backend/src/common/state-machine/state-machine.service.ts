import { Injectable } from '@nestjs/common'
import {
  BATCH_DETAIL_STATUS_LABELS,
  BATCH_STATUS_LABELS,
  CSA_STATUS_LABELS,
  STATE_ACTOR_PERMISSIONS,
  SYSTEM_CSA_EVENTS,
  USER_CSA_EVENTS,
} from './constants'
import type { Actor, MachineType, TransitionResult } from './interfaces'
import {
  canTransitionBatchDetail,
  getNextBatchDetailState,
  getValidBatchDetailEvents,
} from './machines/batch-detail-status.machine'
import {
  canTransitionBatch,
  getNextBatchState,
  getValidBatchEvents,
} from './machines/batch-status.machine'
import { canTransitionCsa, getNextCsaState, getValidCsaEvents } from './machines/csa-status.machine'

@Injectable()
export class StateMachineService {
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

  getNextState(machine: MachineType, currentState: string, event: string): string | string[] {
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

  getValidEvents(machine: MachineType, currentState: string): string[] {
    switch (machine) {
      case 'csaStatus':
        return getValidCsaEvents(currentState)
      case 'batch':
        return getValidBatchEvents(currentState)
      case 'batchDetail':
        return getValidBatchDetailEvents(currentState)
      default:
        return []
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

  isActorAllowed(currentState: string, event: string, actor: Actor): boolean {
    // Check state-based permissions first
    const statePermissions = STATE_ACTOR_PERMISSIONS[currentState]
    if (statePermissions && event in statePermissions) {
      return statePermissions[event].includes(actor)
    }

    // Fall back to event-based permissions
    if (USER_CSA_EVENTS.has(event)) {
      return true // Both USER and SYSTEM can trigger user events
    }
    if (SYSTEM_CSA_EVENTS.has(event)) {
      return actor === 'SYSTEM'
    }

    return false
  }

  // Validate and compute next state for a contact CSA status transition.
  // For dynamic transitions (e.g., RESUME), caller must provide targetState.
  transitionContact(
    currentState: string,
    event: string,
    actor: Actor,
    targetState?: string,
  ): TransitionResult {
    if (!this.isActorAllowed(currentState, event, actor)) {
      return { success: false, reason: 'Event not allowed for this actor' }
    }

    if (!this.canTransition('csaStatus', currentState, event)) {
      return { success: false, reason: 'Invalid transition' }
    }

    const nextState = this.getNextState('csaStatus', currentState, event)

    // Handle dynamic transitions (array of valid targets)
    if (Array.isArray(nextState)) {
      if (!targetState) {
        return { success: false, reason: 'Target state required for dynamic transition' }
      }
      if (!nextState.includes(targetState)) {
        return { success: false, reason: 'Invalid target state for this transition' }
      }
      return { success: true, from: currentState, to: targetState }
    }

    return { success: true, from: currentState, to: nextState }
  }

  transitionBatch(currentState: string, event: string): TransitionResult {
    if (!this.canTransition('batch', currentState, event)) {
      return { success: false, reason: 'Invalid transition' }
    }

    // Batch machine has no dynamic transitions, always returns string
    const nextState = this.getNextState('batch', currentState, event) as string
    return { success: true, from: currentState, to: nextState }
  }

  transitionBatchDetail(currentState: string, event: string): TransitionResult {
    if (!this.canTransition('batchDetail', currentState, event)) {
      return { success: false, reason: 'Invalid transition' }
    }

    // BatchDetail machine has no dynamic transitions, always returns string
    const nextState = this.getNextState('batchDetail', currentState, event) as string
    return { success: true, from: currentState, to: nextState }
  }
}
