import { BATCH_EVENT, BATCH_STATUS } from '../constants'
import { canTransition, getNextState, getValidEvents } from './machine.utils'

// { [fromState]: { [event]: toState } }
export const BATCH_TRANSITIONS: Record<string, Record<string, string>> = {
  [BATCH_STATUS.PENDING]: {
    [BATCH_EVENT.SEND_TO_CRA]: BATCH_STATUS.IN_PROGRESS,
  },
  [BATCH_STATUS.IN_PROGRESS]: {
    [BATCH_EVENT.SEND_FAILED]: BATCH_STATUS.SYSTEM_ERROR,
    [BATCH_EVENT.CRA_ALL_REJECTED]: BATCH_STATUS.ERROR,
    [BATCH_EVENT.CRA_ACCEPTED]: BATCH_STATUS.PROCESSED,
    [BATCH_EVENT.CRA_PARTIAL_REJECTED]: BATCH_STATUS.PROCESSED_WITH_ERRORS,
  },
  [BATCH_STATUS.PROCESSED]: {},
  [BATCH_STATUS.PROCESSED_WITH_ERRORS]: {},
  [BATCH_STATUS.ERROR]: {},
  [BATCH_STATUS.SYSTEM_ERROR]: {
    [BATCH_EVENT.SEND_TO_CRA]: BATCH_STATUS.IN_PROGRESS,
  },
}

export const getNextBatchState = (currentState: string, event: string): string =>
  getNextState(BATCH_TRANSITIONS, currentState, event)

export const canTransitionBatch = (currentState: string, event: string): boolean =>
  canTransition(BATCH_TRANSITIONS, currentState, event)

export const getValidBatchEvents = (currentState: string): string[] =>
  getValidEvents(BATCH_TRANSITIONS, currentState)
