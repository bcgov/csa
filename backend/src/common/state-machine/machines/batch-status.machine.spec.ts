import { describe, expect, it } from 'vitest'
import { BATCH_EVENT, BATCH_STATUS } from '../constants'
import { canTransitionBatch, getNextBatchState } from './batch-status.machine'

describe('batchStatusMachine', () => {
  describe('getNextBatchState', () => {
    it('should transition from pending to in_progress on SEND_TO_CRA', () => {
      const nextState = getNextBatchState(BATCH_STATUS.PENDING, BATCH_EVENT.SEND_TO_CRA)
      expect(nextState).toBe(BATCH_STATUS.IN_PROGRESS)
    })

    it('should transition from in_progress to system_error on SEND_FAILED', () => {
      const nextState = getNextBatchState(BATCH_STATUS.IN_PROGRESS, BATCH_EVENT.SEND_FAILED)
      expect(nextState).toBe(BATCH_STATUS.SYSTEM_ERROR)
    })

    it('should transition from in_progress to processed on CRA_ACCEPTED', () => {
      const nextState = getNextBatchState(BATCH_STATUS.IN_PROGRESS, BATCH_EVENT.CRA_ACCEPTED)
      expect(nextState).toBe(BATCH_STATUS.PROCESSED)
    })

    it('should transition from system_error to in_progress on SEND_TO_CRA (retry)', () => {
      const nextState = getNextBatchState(BATCH_STATUS.SYSTEM_ERROR, BATCH_EVENT.SEND_TO_CRA)
      expect(nextState).toBe(BATCH_STATUS.IN_PROGRESS)
    })

    it('should return current state for invalid transition', () => {
      const nextState = getNextBatchState(BATCH_STATUS.PENDING, BATCH_EVENT.SEND_FAILED)
      expect(nextState).toBe(BATCH_STATUS.PENDING)
    })
  })

  describe('canTransitionBatch', () => {
    it('should return true for valid transition', () => {
      expect(canTransitionBatch(BATCH_STATUS.PENDING, BATCH_EVENT.SEND_TO_CRA)).toBe(true)
    })

    it('should return false for invalid transition', () => {
      expect(canTransitionBatch(BATCH_STATUS.PENDING, BATCH_EVENT.SEND_FAILED)).toBe(false)
    })

    it('should return false for final state', () => {
      expect(canTransitionBatch(BATCH_STATUS.PROCESSED, BATCH_EVENT.SEND_TO_CRA)).toBe(false)
    })
  })
})
