import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  BATCH_DETAIL_EVENT,
  BATCH_DETAIL_STATUS,
  BATCH_EVENT,
  BATCH_STATUS,
  CSA_EVENT,
  CSA_STATUS,
} from './constants'
import { StateMachineService } from './state-machine.service'

describe('StateMachineService', () => {
  let service: StateMachineService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StateMachineService],
    }).compile()

    service = module.get<StateMachineService>(StateMachineService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('canTransition', () => {
    it('should return true for valid CSA transition', () => {
      expect(service.canTransition('csaStatus', CSA_STATUS.ELIGIBLE, CSA_EVENT.ADD_TO_BATCH)).toBe(
        true,
      )
    })

    it('should return false for invalid CSA transition', () => {
      expect(
        service.canTransition('csaStatus', CSA_STATUS.ELIGIBLE, CSA_EVENT.CRA_RSP_REJECTED),
      ).toBe(false)
    })

    it('should return true for valid Batch transition', () => {
      expect(service.canTransition('batch', BATCH_STATUS.PENDING, BATCH_EVENT.SEND_TO_CRA)).toBe(
        true,
      )
    })

    it('should return true for valid BatchDetail transition', () => {
      expect(
        service.canTransition(
          'batchDetail',
          BATCH_DETAIL_STATUS.PENDING,
          BATCH_DETAIL_EVENT.SEND_TO_CRA,
        ),
      ).toBe(true)
    })

    it('should return false for unknown machine type', () => {
      expect(service.canTransition('unknown' as any, 'pending', 'event')).toBe(false)
    })
  })

  describe('getNextState', () => {
    it('should return next state for valid CSA transition', () => {
      expect(service.getNextState('csaStatus', CSA_STATUS.ELIGIBLE, CSA_EVENT.ADD_TO_BATCH)).toBe(
        CSA_STATUS.IN_BATCH_APPLICATION,
      )
    })

    it('should return current state for invalid transition', () => {
      expect(
        service.getNextState('csaStatus', CSA_STATUS.ELIGIBLE, CSA_EVENT.CRA_RSP_REJECTED),
      ).toBe(CSA_STATUS.ELIGIBLE)
    })

    it('should return next state for valid Batch transition', () => {
      expect(service.getNextState('batch', BATCH_STATUS.PENDING, BATCH_EVENT.SEND_TO_CRA)).toBe(
        BATCH_STATUS.IN_PROGRESS,
      )
    })

    it('should return next state for valid BatchDetail transition', () => {
      expect(
        service.getNextState(
          'batchDetail',
          BATCH_DETAIL_STATUS.PENDING,
          BATCH_DETAIL_EVENT.SEND_TO_CRA,
        ),
      ).toBe(BATCH_DETAIL_STATUS.IN_PROGRESS)
    })
  })

  describe('getValidEvents', () => {
    it('should return valid events for CSA status', () => {
      const events = service.getValidEvents('csaStatus', CSA_STATUS.ELIGIBLE)
      expect(events).toContain(CSA_EVENT.ADD_TO_BATCH)
      expect(events).toContain(CSA_EVENT.SET_NOT_ELIGIBLE)
    })

    it('should return empty array for final state', () => {
      const events = service.getValidEvents('csaStatus', CSA_STATUS.OVER_18)
      expect(events).toHaveLength(0)
    })

    it('should return valid events for Batch status', () => {
      const events = service.getValidEvents('batch', BATCH_STATUS.PENDING)
      expect(events).toContain(BATCH_EVENT.SEND_TO_CRA)
    })

    it('should return empty array for unknown machine type', () => {
      const events = service.getValidEvents('unknown' as any, 'pending')
      expect(events).toHaveLength(0)
    })
  })

  describe('getStatusLabel', () => {
    it('should return display label for CSA status', () => {
      expect(service.getStatusLabel('csaStatus', CSA_STATUS.IN_BATCH_APPLICATION)).toBe(
        'In Batch - Application',
      )
    })

    it('should return display label for Batch status', () => {
      expect(service.getStatusLabel('batch', BATCH_STATUS.IN_PROGRESS)).toBe('In Progress')
    })

    it('should return display label for BatchDetail status', () => {
      expect(service.getStatusLabel('batchDetail', BATCH_DETAIL_STATUS.APPROVED)).toBe('Approved')
    })

    it('should return raw value if label not found', () => {
      expect(service.getStatusLabel('csaStatus', 'unknown_status')).toBe('unknown_status')
    })
  })

  describe('isActorAllowed', () => {
    it('should allow USER to trigger user events', () => {
      expect(service.isActorAllowed(CSA_STATUS.ELIGIBLE, CSA_EVENT.ADD_TO_BATCH, 'USER')).toBe(true)
    })

    it('should allow SYSTEM to trigger user events', () => {
      expect(service.isActorAllowed(CSA_STATUS.ELIGIBLE, CSA_EVENT.ADD_TO_BATCH, 'SYSTEM')).toBe(
        true,
      )
    })

    it('should allow SYSTEM to trigger system events', () => {
      expect(
        service.isActorAllowed(CSA_STATUS.IN_BATCH_APPLICATION, CSA_EVENT.SEND_TO_CRA, 'SYSTEM'),
      ).toBe(true)
    })

    it('should reject USER triggering system events', () => {
      expect(
        service.isActorAllowed(CSA_STATUS.IN_BATCH_APPLICATION, CSA_EVENT.SEND_TO_CRA, 'USER'),
      ).toBe(false)
    })
  })

  describe('transitionContact (pure)', () => {
    it('should return success for valid USER event', () => {
      const result = service.transitionContact(CSA_STATUS.ELIGIBLE, CSA_EVENT.ADD_TO_BATCH, 'USER')

      expect(result.success).toBe(true)
      expect(result.from).toBe(CSA_STATUS.ELIGIBLE)
      expect(result.to).toBe(CSA_STATUS.IN_BATCH_APPLICATION)
    })

    it('should reject USER attempting SYSTEM event', () => {
      const result = service.transitionContact(
        CSA_STATUS.IN_BATCH_APPLICATION,
        CSA_EVENT.SEND_TO_CRA,
        'USER',
      )

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Event not allowed for this actor')
    })

    it('should allow SYSTEM to trigger SYSTEM event', () => {
      const result = service.transitionContact(
        CSA_STATUS.IN_BATCH_APPLICATION,
        CSA_EVENT.SEND_TO_CRA,
        'SYSTEM',
      )

      expect(result.success).toBe(true)
      expect(result.to).toBe(CSA_STATUS.BATCH_SENT_APPLICATION)
    })

    it('should reject invalid transition', () => {
      // RESUME is not valid from ELIGIBLE state
      const result = service.transitionContact(CSA_STATUS.ELIGIBLE, CSA_EVENT.RESUME, 'USER')

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Invalid transition')
    })

    it('should handle HOLD event from ELIGIBLE', () => {
      const result = service.transitionContact(CSA_STATUS.ELIGIBLE, CSA_EVENT.HOLD, 'USER')

      expect(result.success).toBe(true)
      expect(result.from).toBe(CSA_STATUS.ELIGIBLE)
      expect(result.to).toBe(CSA_STATUS.ON_HOLD)
    })

    it('should handle HOLD event from ELIGIBLE_TBD', () => {
      const result = service.transitionContact(CSA_STATUS.ELIGIBLE_TBD, CSA_EVENT.HOLD, 'USER')

      expect(result.success).toBe(true)
      expect(result.from).toBe(CSA_STATUS.ELIGIBLE_TBD)
      expect(result.to).toBe(CSA_STATUS.ON_HOLD)
    })

    it('should require targetState for RESUME event (dynamic transition)', () => {
      const result = service.transitionContact(CSA_STATUS.ON_HOLD, CSA_EVENT.RESUME, 'USER')

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Target state required for dynamic transition')
    })

    it('should succeed for RESUME with valid targetState', () => {
      const result = service.transitionContact(
        CSA_STATUS.ON_HOLD,
        CSA_EVENT.RESUME,
        'USER',
        CSA_STATUS.ELIGIBLE_TBD,
      )

      expect(result.success).toBe(true)
      expect(result.from).toBe(CSA_STATUS.ON_HOLD)
      expect(result.to).toBe(CSA_STATUS.ELIGIBLE_TBD)
    })

    it('should reject RESUME with invalid targetState', () => {
      const result = service.transitionContact(
        CSA_STATUS.ON_HOLD,
        CSA_EVENT.RESUME,
        'USER',
        CSA_STATUS.IN_PAY, // not a valid target for RESUME from ON_HOLD
      )

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Invalid target state for this transition')
    })

    it('should require targetState for REMOVE_FROM_BATCH (dynamic transition)', () => {
      const result = service.transitionContact(
        CSA_STATUS.IN_BATCH_APPLICATION,
        CSA_EVENT.REMOVE_FROM_BATCH,
        'USER',
      )

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Target state required for dynamic transition')
    })

    it('should succeed for REMOVE_FROM_BATCH with valid targetState', () => {
      const result = service.transitionContact(
        CSA_STATUS.IN_BATCH_APPLICATION,
        CSA_EVENT.REMOVE_FROM_BATCH,
        'USER',
        CSA_STATUS.ELIGIBLE_TBD,
      )

      expect(result.success).toBe(true)
      expect(result.from).toBe(CSA_STATUS.IN_BATCH_APPLICATION)
      expect(result.to).toBe(CSA_STATUS.ELIGIBLE_TBD)
    })

    it('should reject REMOVE_FROM_BATCH with invalid targetState', () => {
      const result = service.transitionContact(
        CSA_STATUS.IN_BATCH_APPLICATION,
        CSA_EVENT.REMOVE_FROM_BATCH,
        'USER',
        CSA_STATUS.IN_PAY,
      )

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Invalid target state for this transition')
    })
  })

  describe('transitionBatch (pure)', () => {
    it('should return success for valid transition', () => {
      const result = service.transitionBatch(BATCH_STATUS.PENDING, BATCH_EVENT.SEND_TO_CRA)

      expect(result.success).toBe(true)
      expect(result.from).toBe(BATCH_STATUS.PENDING)
      expect(result.to).toBe(BATCH_STATUS.IN_PROGRESS)
    })

    it('should return error for invalid transition', () => {
      const result = service.transitionBatch(BATCH_STATUS.PENDING, BATCH_EVENT.SEND_FAILED)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Invalid transition')
    })

    it('should transition from system_error to in_progress on retry', () => {
      const result = service.transitionBatch(BATCH_STATUS.SYSTEM_ERROR, BATCH_EVENT.SEND_TO_CRA)

      expect(result.success).toBe(true)
      expect(result.to).toBe(BATCH_STATUS.IN_PROGRESS)
    })
  })

  describe('transitionBatchDetail (pure)', () => {
    it('should return success for valid transition', () => {
      const result = service.transitionBatchDetail(
        BATCH_DETAIL_STATUS.PENDING,
        BATCH_DETAIL_EVENT.SEND_TO_CRA,
      )

      expect(result.success).toBe(true)
      expect(result.from).toBe(BATCH_DETAIL_STATUS.PENDING)
      expect(result.to).toBe(BATCH_DETAIL_STATUS.IN_PROGRESS)
    })

    it('should return error for invalid transition', () => {
      const result = service.transitionBatchDetail(
        BATCH_DETAIL_STATUS.PENDING,
        BATCH_DETAIL_EVENT.CRA_RSP_REJECTED,
      )

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Invalid transition')
    })
  })
})
