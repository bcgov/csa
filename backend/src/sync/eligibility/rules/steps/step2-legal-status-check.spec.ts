import { describe, expect, it } from 'vitest'
import { ContactProfile } from '../../eligibility.types'
import { makeContact as makeBaseContact } from '../../test-helpers'
import { EligibilityContext } from '../rule.interface'
import { step2_LegalStatusCheck } from './step2-legal-status-check'

const makeContact = (overrides: Partial<ContactProfile> = {}) =>
  makeBaseContact({ enrollForCsa: 'Yes', effectiveLegalStatus: 'Active', ...overrides })

const REF_DATE = new Date('2026-02-10')

const makeCtx = (overrides: Partial<ContactProfile> = {}): EligibilityContext => ({
  contact: makeContact(overrides),
  referenceDate: REF_DATE,
})

describe('step2_LegalStatusCheck', () => {
  it('should route to step 8 when MIS Legal Auth Code is OPC', () => {
    const ctx = makeCtx({ misLegalAuthCode: 'OPC' })
    const result = step2_LegalStatusCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should restore in_pay from not_eligible_in_pay when MIS Legal Auth Code is OPC', () => {
    const ctx = makeCtx({ misLegalAuthCode: 'OPC', csaStatus: 'not_eligible_in_pay' })
    const result = step2_LegalStatusCheck.evaluate(ctx)
    expect(result).toEqual({
      step: 8,
      newStatus: 'in_pay',
      cancelReasonCode: null,
      careEndDate: null,
    })
  })

  it('should restore in_pay from not_eligible_ip_tbd when MIS Legal Auth Code is OPO', () => {
    const ctx = makeCtx({ misLegalAuthCode: 'OPO', csaStatus: 'not_eligible_ip_tbd' })
    const result = step2_LegalStatusCheck.evaluate(ctx)
    expect(result!.newStatus).toBe('in_pay')
  })

  it('should route to step 8 when MIS Legal Auth Code is OPO', () => {
    const ctx = makeCtx({ misLegalAuthCode: 'OPO' })
    const result = step2_LegalStatusCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should route to step 8 when MIS Legal Auth Code is OPT', () => {
    const ctx = makeCtx({ misLegalAuthCode: 'OPT' })
    const result = step2_LegalStatusCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should handle variant casing and whitespace in legal auth code', () => {
    const ctx = makeCtx({ misLegalAuthCode: ' opc ' })
    const result = step2_LegalStatusCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should handle variant casing and whitespace in enrollForCsa', () => {
    const ctx = makeCtx({ enrollForCsa: ' yes ', legalExpiryDate: null })
    const result = step2_LegalStatusCheck.evaluate(ctx)
    expect(result).toBeNull()
  })

  describe('when legal authority not expired (expiry >= today or null)', () => {
    it('should return null (continue to step 3) when enrollForCsa is Yes', () => {
      const ctx = makeCtx({ enrollForCsa: 'Yes', legalExpiryDate: null })
      const result = step2_LegalStatusCheck.evaluate(ctx)
      expect(result).toBeNull()
    })

    it('should route to step 8 when enrollForCsa is TBD', () => {
      const ctx = makeCtx({ enrollForCsa: 'TBD', legalExpiryDate: null })
      const result = step2_LegalStatusCheck.evaluate(ctx)
      expect(result!.step).toBe(8)
    })

    it('should keep not_eligible_in_pay unchanged when enrollForCsa is TBD', () => {
      const ctx = makeCtx({
        enrollForCsa: 'TBD',
        legalExpiryDate: null,
        csaStatus: 'not_eligible_in_pay',
      })
      const result = step2_LegalStatusCheck.evaluate(ctx)
      expect(result!.newStatus).toBe('not_eligible_in_pay')
    })

    it('should route to step 9 when enrollForCsa is No', () => {
      const ctx = makeCtx({ enrollForCsa: 'No', legalExpiryDate: null })
      const result = step2_LegalStatusCheck.evaluate(ctx)
      expect(result!.step).toBe(9)
    })

    it('should route to step 9 when enrollForCsa is null', () => {
      const ctx = makeCtx({ enrollForCsa: null, legalExpiryDate: null })
      const result = step2_LegalStatusCheck.evaluate(ctx)
      expect(result!.step).toBe(9)
    })

    it('should treat future expiry date as not expired', () => {
      const ctx = makeCtx({
        enrollForCsa: 'Yes',
        legalExpiryDate: new Date('2027-01-01'),
      })
      const result = step2_LegalStatusCheck.evaluate(ctx)
      expect(result).toBeNull()
    })
  })

  describe('when legal authority is expired', () => {
    it('should route to step 9 when expiry date is in the past', () => {
      const ctx = makeCtx({
        enrollForCsa: 'Yes',
        legalExpiryDate: new Date('2025-12-31'),
      })
      const result = step2_LegalStatusCheck.evaluate(ctx)
      expect(result!.step).toBe(9)
    })
  })
})
