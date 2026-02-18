import { describe, expect, it } from 'vitest'
import { CSA_EVENT, CSA_STATUS } from '../constants'
import { canTransitionCsa, getNextCsaState } from './csa-status.machine'

describe('csaStatusMachine', () => {
  describe('getNextCsaState', () => {
    it('should transition from eligible to in_batch_application on ADD_TO_BATCH', () => {
      const nextState = getNextCsaState(CSA_STATUS.ELIGIBLE, CSA_EVENT.ADD_TO_BATCH)
      expect(nextState).toBe(CSA_STATUS.IN_BATCH_APPLICATION)
    })

    it('should transition from eligible to over_18 on AGE_OUT', () => {
      const nextState = getNextCsaState(CSA_STATUS.ELIGIBLE, CSA_EVENT.AGE_OUT)
      expect(nextState).toBe(CSA_STATUS.OVER_18)
    })

    it('should return current state for invalid transition', () => {
      const nextState = getNextCsaState(CSA_STATUS.ELIGIBLE, CSA_EVENT.CRA_ACCEPTED)
      expect(nextState).toBe(CSA_STATUS.ELIGIBLE)
    })
  })

  describe('canTransitionCsa', () => {
    it('should return true for valid transition', () => {
      const canTransition = canTransitionCsa(CSA_STATUS.ELIGIBLE, CSA_EVENT.ADD_TO_BATCH)
      expect(canTransition).toBe(true)
    })

    it('should return false for invalid transition', () => {
      const canTransition = canTransitionCsa(CSA_STATUS.ELIGIBLE, CSA_EVENT.CRA_ACCEPTED)
      expect(canTransition).toBe(false)
    })
  })

  describe('application flow', () => {
    it('should handle full application flow: eligible -> inBatch -> batchSent -> inPay', () => {
      let state = CSA_STATUS.ELIGIBLE as string

      state = getNextCsaState(state, CSA_EVENT.ADD_TO_BATCH) as string
      expect(state).toBe(CSA_STATUS.IN_BATCH_APPLICATION)

      state = getNextCsaState(state, CSA_EVENT.SEND_TO_CRA) as string
      expect(state).toBe(CSA_STATUS.BATCH_SENT_APPLICATION)

      state = getNextCsaState(state, CSA_EVENT.CRA_ACCEPTED) as string
      expect(state).toBe(CSA_STATUS.IN_PAY)
    })

    it('should handle CRA record-level rejection flow', () => {
      let state = CSA_STATUS.BATCH_SENT_APPLICATION as string

      state = getNextCsaState(state, CSA_EVENT.CRA_RECORD_REJECTED) as string
      expect(state).toBe(CSA_STATUS.APPLICATION_REFUSED_CRA)

      // Can retry by adding to batch again
      state = getNextCsaState(state, CSA_EVENT.ADD_TO_BATCH) as string
      expect(state).toBe(CSA_STATUS.IN_BATCH_APPLICATION)
    })
  })

  describe('hold flow', () => {
    it('should transition to on_hold from eligible_tbd', () => {
      const state = getNextCsaState(CSA_STATUS.ELIGIBLE_TBD, CSA_EVENT.HOLD)
      expect(state).toBe(CSA_STATUS.ON_HOLD)
    })

    it('should transition to on_hold from application_refused_cra', () => {
      const state = getNextCsaState(CSA_STATUS.APPLICATION_REFUSED_CRA, CSA_EVENT.HOLD)
      expect(state).toBe(CSA_STATUS.ON_HOLD)
    })

    it('should transition to on_hold from cancellation_refused_cra', () => {
      const state = getNextCsaState(CSA_STATUS.CANCELLATION_REFUSED_CRA, CSA_EVENT.HOLD)
      expect(state).toBe(CSA_STATUS.ON_HOLD)
    })
  })

  describe('resume flow', () => {
    it('should return array of valid targets for RESUME from on_hold', () => {
      const targets = getNextCsaState(CSA_STATUS.ON_HOLD, CSA_EVENT.RESUME)
      expect(Array.isArray(targets)).toBe(true)
      expect(targets).toContain(CSA_STATUS.ELIGIBLE_TBD)
      expect(targets).toContain(CSA_STATUS.APPLICATION_REFUSED_CRA)
      expect(targets).toContain(CSA_STATUS.NOT_ELIGIBLE_IP_TBD)
      expect(targets).toContain(CSA_STATUS.CANCELLATION_REFUSED_CRA)
    })

    it('should have valid resume targets matching holdable states', () => {
      // All states that can HOLD should be valid RESUME targets
      const resumeTargets = getNextCsaState(CSA_STATUS.ON_HOLD, CSA_EVENT.RESUME)
      expect(Array.isArray(resumeTargets)).toBe(true)

      // Verify each holdable state is in resume targets
      expect(resumeTargets).toContain(CSA_STATUS.ELIGIBLE_TBD)
      expect(resumeTargets).toContain(CSA_STATUS.APPLICATION_REFUSED_CRA)
      expect(resumeTargets).toContain(CSA_STATUS.NOT_ELIGIBLE_IP_TBD)
      expect(resumeTargets).toContain(CSA_STATUS.CANCELLATION_REFUSED_CRA)
    })
  })

  describe('cancellation flow', () => {
    it('should handle full cancellation flow', () => {
      let state = CSA_STATUS.NOT_ELIGIBLE_IN_PAY as string

      state = getNextCsaState(state, CSA_EVENT.ADD_TO_BATCH) as string
      expect(state).toBe(CSA_STATUS.IN_BATCH_CANCELLATION)

      state = getNextCsaState(state, CSA_EVENT.SEND_TO_CRA) as string
      expect(state).toBe(CSA_STATUS.BATCH_SENT_CANCELLATION)

      state = getNextCsaState(state, CSA_EVENT.CRA_ACCEPTED) as string
      expect(state).toBe(CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY)
    })
  })

  describe('file-level rejection flow', () => {
    it('should return array of valid targets for CRA_FILE_REJECTED from batch_sent_application', () => {
      const targets = getNextCsaState(
        CSA_STATUS.BATCH_SENT_APPLICATION,
        CSA_EVENT.CRA_FILE_REJECTED,
      )
      expect(Array.isArray(targets)).toBe(true)
      expect(targets).toContain(CSA_STATUS.ELIGIBLE)
      expect(targets).toContain(CSA_STATUS.ELIGIBLE_TBD)
    })

    it('should return array of valid targets for CRA_FILE_REJECTED from batch_sent_cancellation', () => {
      const targets = getNextCsaState(
        CSA_STATUS.BATCH_SENT_CANCELLATION,
        CSA_EVENT.CRA_FILE_REJECTED,
      )
      expect(Array.isArray(targets)).toBe(true)
      expect(targets).toContain(CSA_STATUS.NOT_ELIGIBLE_IN_PAY)
      expect(targets).toContain(CSA_STATUS.NOT_ELIGIBLE_IP_TBD)
    })
  })

  describe('remove from batch', () => {
    it('should remove from application batch to eligible_tbd', () => {
      const state = getNextCsaState(CSA_STATUS.IN_BATCH_APPLICATION, CSA_EVENT.REMOVE_FROM_BATCH)
      expect(state).toBe(CSA_STATUS.ELIGIBLE_TBD)
    })

    it('should remove from cancellation batch to not_eligible_ip_tbd', () => {
      const state = getNextCsaState(CSA_STATUS.IN_BATCH_CANCELLATION, CSA_EVENT.REMOVE_FROM_BATCH)
      expect(state).toBe(CSA_STATUS.NOT_ELIGIBLE_IP_TBD)
    })
  })
})
