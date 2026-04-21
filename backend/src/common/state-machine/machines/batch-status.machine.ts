import { BATCH_EVENT, BATCH_STATUS } from '../constants'
import {
  canTransition,
  getNextState,
  getValidEvents,
  type TransitionMap,
  type TransitionTarget,
} from './machine.utils'

// { [fromState]: { [event]: toState } }
export const BATCH_TRANSITIONS: TransitionMap = {
  [BATCH_STATUS.PENDING]: {
    [BATCH_EVENT.SEND_TO_CRA]: BATCH_STATUS.IN_PROGRESS,
  },
  [BATCH_STATUS.IN_PROGRESS]: {
    [BATCH_EVENT.SEND_FAILED]: BATCH_STATUS.SYSTEM_ERROR,
    [BATCH_EVENT.CRA_ALL_REJECTED]: BATCH_STATUS.ERROR,
    [BATCH_EVENT.CRA_ALL_PROCESSED]: BATCH_STATUS.PROCESSED,
    [BATCH_EVENT.CRA_PARTIALLY_PROCESSED]: BATCH_STATUS.PARTIALLY_PROCESSED,
  },
  [BATCH_STATUS.PROCESSED]: {},
  [BATCH_STATUS.PARTIALLY_PROCESSED]: {
    [BATCH_EVENT.CRA_ALL_PROCESSED]: BATCH_STATUS.PROCESSED,
  },
  [BATCH_STATUS.ERROR]: {},
  [BATCH_STATUS.SYSTEM_ERROR]: {
    [BATCH_EVENT.SEND_TO_CRA]: BATCH_STATUS.IN_PROGRESS,
  },
}

export const getNextBatchState = (currentState: string, event: string): TransitionTarget =>
  getNextState(BATCH_TRANSITIONS, currentState, event)

export const canTransitionBatch = (currentState: string, event: string): boolean =>
  canTransition(BATCH_TRANSITIONS, currentState, event)

export const getValidBatchEvents = (currentState: string): string[] =>
  getValidEvents(BATCH_TRANSITIONS, currentState)
