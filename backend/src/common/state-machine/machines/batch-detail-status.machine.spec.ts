import { describe, expect, it } from 'vitest'
import { BATCH_DETAIL_EVENT, BATCH_DETAIL_STATUS } from '../constants'
import { canTransitionBatchDetail, getNextBatchDetailState } from './batch-detail-status.machine'

describe('batchDetailStatusMachine', () => {
  describe('getNextBatchDetailState', () => {
    it('should transition from pending to in_progress on SEND_TO_CRA', () => {
      const nextState = getNextBatchDetailState(
        BATCH_DETAIL_STATUS.PENDING,
        BATCH_DETAIL_EVENT.SEND_TO_CRA,
      )
      expect(nextState).toBe(BATCH_DETAIL_STATUS.IN_PROGRESS)
    })

    it('should transition from in_progress to error on CRA_RSP_REJECTED', () => {
      const nextState = getNextBatchDetailState(
        BATCH_DETAIL_STATUS.IN_PROGRESS,
        BATCH_DETAIL_EVENT.CRA_RSP_REJECTED,
      )
      expect(nextState).toBe(BATCH_DETAIL_STATUS.ERROR)
    })

    it('should transition from in_progress to error on CRA_FILE_REJECTED', () => {
      const nextState = getNextBatchDetailState(
        BATCH_DETAIL_STATUS.IN_PROGRESS,
        BATCH_DETAIL_EVENT.CRA_FILE_REJECTED,
      )
      expect(nextState).toBe(BATCH_DETAIL_STATUS.ERROR)
    })

    it('should transition from in_progress to approved on CRA_WKL_APPROVED', () => {
      const nextState = getNextBatchDetailState(
        BATCH_DETAIL_STATUS.IN_PROGRESS,
        BATCH_DETAIL_EVENT.CRA_WKL_APPROVED,
      )
      expect(nextState).toBe(BATCH_DETAIL_STATUS.APPROVED)
    })

    it('should transition from in_progress to refused on CRA_WKL_REFUSED', () => {
      const nextState = getNextBatchDetailState(
        BATCH_DETAIL_STATUS.IN_PROGRESS,
        BATCH_DETAIL_EVENT.CRA_WKL_REFUSED,
      )
      expect(nextState).toBe(BATCH_DETAIL_STATUS.REFUSED)
    })

    it('should return current state for invalid transition', () => {
      const nextState = getNextBatchDetailState(
        BATCH_DETAIL_STATUS.PENDING,
        BATCH_DETAIL_EVENT.CRA_RSP_REJECTED,
      )
      expect(nextState).toBe(BATCH_DETAIL_STATUS.PENDING)
    })
  })

  describe('canTransitionBatchDetail', () => {
    it('should return true for valid transition', () => {
      expect(
        canTransitionBatchDetail(BATCH_DETAIL_STATUS.PENDING, BATCH_DETAIL_EVENT.SEND_TO_CRA),
      ).toBe(true)
    })

    it('should return false for invalid transition', () => {
      expect(
        canTransitionBatchDetail(BATCH_DETAIL_STATUS.PENDING, BATCH_DETAIL_EVENT.CRA_RSP_REJECTED),
      ).toBe(false)
    })

    it('should return false for approved (terminal state)', () => {
      expect(
        canTransitionBatchDetail(BATCH_DETAIL_STATUS.APPROVED, BATCH_DETAIL_EVENT.SEND_TO_CRA),
      ).toBe(false)
    })

    it('should return false for refused (terminal state)', () => {
      expect(
        canTransitionBatchDetail(BATCH_DETAIL_STATUS.REFUSED, BATCH_DETAIL_EVENT.SEND_TO_CRA),
      ).toBe(false)
    })
  })
})
