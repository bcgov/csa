import { ConfigService } from '@nestjs/config'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { AdminService } from 'src/api/admin/admin.service'
import { JwtVerificationService } from 'src/common/auth/jwt-verification.service'
import { beforeEach, describe, expect, it } from 'vitest'
import { CSA_STATUS } from './constants'
import { StateMachineController } from './state-machine.controller'

describe('StateMachineController', () => {
  let controller: StateMachineController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StateMachineController],
      providers: [
        { provide: AdminService, useValue: {} },
        { provide: JwtVerificationService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile()

    controller = module.get<StateMachineController>(StateMachineController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('getCsaConfig', () => {
    it('should return statuses and transitions', () => {
      const result = controller.getCsaConfig()

      expect(result).toHaveProperty('statuses')
      expect(result).toHaveProperty('transitions')
    })

    it('should include all status labels', () => {
      const result = controller.getCsaConfig()

      expect(result.statuses[CSA_STATUS.ELIGIBLE]).toBe('Eligible')
      expect(result.statuses[CSA_STATUS.IN_BATCH_APPLICATION]).toBe('In Batch - Application')
      expect(result.statuses[CSA_STATUS.ON_HOLD]).toBe('On Hold')
    })

    it('should include user transitions for eligible status', () => {
      const result = controller.getCsaConfig()

      expect(result.transitions[CSA_STATUS.ELIGIBLE]).toBeDefined()
      const eligibleTransitions = result.transitions[CSA_STATUS.ELIGIBLE]
      expect(eligibleTransitions.some((t) => t.event === 'ADD_TO_BATCH')).toBe(true)
    })

    it('should include user transitions for eligible_tbd status', () => {
      const result = controller.getCsaConfig()

      const transitions = result.transitions[CSA_STATUS.ELIGIBLE_TBD]
      expect(transitions).toBeDefined()
      expect(transitions.some((t) => t.event === 'ADD_TO_BATCH')).toBe(true)
      expect(transitions.some((t) => t.event === 'HOLD')).toBe(true)
    })

    it('should not include system-only events in transitions', () => {
      const result = controller.getCsaConfig()

      // Check that no transition contains SEND_TO_CRA (system event)
      for (const [, transitions] of Object.entries(result.transitions)) {
        expect(transitions.some((t) => t.event === 'SEND_TO_CRA')).toBe(false)
      }
    })

    it('should not include transitions for final state (over_18)', () => {
      const result = controller.getCsaConfig()

      expect(result.transitions[CSA_STATUS.OVER_18]).toBeUndefined()
    })
  })
})
