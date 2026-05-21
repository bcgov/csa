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

    it('should transition from in_progress to processed on CRA_ALL_PROCESSED', () => {
      const nextState = getNextBatchState(BATCH_STATUS.IN_PROGRESS, BATCH_EVENT.CRA_ALL_PROCESSED)
      expect(nextState).toBe(BATCH_STATUS.PROCESSED)
    })

    it('should transition from in_progress to partially_processed on CRA_PARTIALLY_PROCESSED', () => {
      const nextState = getNextBatchState(
        BATCH_STATUS.IN_PROGRESS,
        BATCH_EVENT.CRA_PARTIALLY_PROCESSED,
      )
      expect(nextState).toBe(BATCH_STATUS.PARTIALLY_PROCESSED)
    })

    it('should transition from in_progress to error on CRA_ALL_REJECTED', () => {
      const nextState = getNextBatchState(BATCH_STATUS.IN_PROGRESS, BATCH_EVENT.CRA_ALL_REJECTED)
      expect(nextState).toBe(BATCH_STATUS.ERROR)
    })

    it('should transition from partially_processed to processed on CRA_ALL_PROCESSED', () => {
      const nextState = getNextBatchState(
        BATCH_STATUS.PARTIALLY_PROCESSED,
        BATCH_EVENT.CRA_ALL_PROCESSED,
      )
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

    it('should not transition from processed (terminal)', () => {
      const nextState = getNextBatchState(BATCH_STATUS.PROCESSED, BATCH_EVENT.SEND_TO_CRA)
      expect(nextState).toBe(BATCH_STATUS.PROCESSED)
    })

    it('should not transition from error (terminal)', () => {
      const nextState = getNextBatchState(BATCH_STATUS.ERROR, BATCH_EVENT.SEND_TO_CRA)
      expect(nextState).toBe(BATCH_STATUS.ERROR)
    })
  })

  describe('canTransitionBatch', () => {
    it('should return true for valid transition', () => {
      expect(canTransitionBatch(BATCH_STATUS.PENDING, BATCH_EVENT.SEND_TO_CRA)).toBe(true)
    })

    it('should return false for invalid transition', () => {
      expect(canTransitionBatch(BATCH_STATUS.PENDING, BATCH_EVENT.SEND_FAILED)).toBe(false)
    })

    it('should return false for terminal processed state', () => {
      expect(canTransitionBatch(BATCH_STATUS.PROCESSED, BATCH_EVENT.SEND_TO_CRA)).toBe(false)
    })

    it('should return false for terminal error state', () => {
      expect(canTransitionBatch(BATCH_STATUS.ERROR, BATCH_EVENT.SEND_TO_CRA)).toBe(false)
    })

    it('should return true for partially_processed to CRA_ALL_PROCESSED', () => {
      expect(
        canTransitionBatch(BATCH_STATUS.PARTIALLY_PROCESSED, BATCH_EVENT.CRA_ALL_PROCESSED),
      ).toBe(true)
    })

    it('should return false for partially_processed with invalid event', () => {
      expect(canTransitionBatch(BATCH_STATUS.PARTIALLY_PROCESSED, BATCH_EVENT.SEND_TO_CRA)).toBe(
        false,
      )
    })
  })
})
