import { BATCH_DETAIL_EVENT, BATCH_DETAIL_STATUS } from '../constants'
import {
  canTransition,
  getNextState,
  getValidEvents,
  type TransitionMap,
  type TransitionTarget,
} from './machine.utils'

// { [fromState]: { [event]: toState } }
export const BATCH_DETAIL_TRANSITIONS: TransitionMap = {
  [BATCH_DETAIL_STATUS.PENDING]: {
    [BATCH_DETAIL_EVENT.SEND_TO_CRA]: BATCH_DETAIL_STATUS.IN_PROGRESS,
  },
  [BATCH_DETAIL_STATUS.IN_PROGRESS]: {
    [BATCH_DETAIL_EVENT.CRA_REJECTED]: BATCH_DETAIL_STATUS.ERROR,
    [BATCH_DETAIL_EVENT.CRA_ACCEPTED]: BATCH_DETAIL_STATUS.PROCESSED,
  },
  [BATCH_DETAIL_STATUS.PROCESSED]: {},
  [BATCH_DETAIL_STATUS.ERROR]: {},
}

export const getNextBatchDetailState = (currentState: string, event: string): TransitionTarget =>
  getNextState(BATCH_DETAIL_TRANSITIONS, currentState, event)

export const canTransitionBatchDetail = (currentState: string, event: string): boolean =>
  canTransition(BATCH_DETAIL_TRANSITIONS, currentState, event)

export const getValidBatchDetailEvents = (currentState: string): string[] =>
  getValidEvents(BATCH_DETAIL_TRANSITIONS, currentState)
