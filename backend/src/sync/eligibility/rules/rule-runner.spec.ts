import { describe, it, expect } from 'vitest'
import { runEligibility } from './rule-runner'
import { EligibilityRule, EligibilityContext } from './rule.interface'
import { ContactProfile, EligibilityResult } from '../eligibility.types'

const makeContact = (overrides: Partial<ContactProfile> = {}): ContactProfile => ({
  personIdIcm: 'ICM-1',
  personIdMis: 'MIS-1',
  firstName: 'John',
  lastName: 'Doe',
  middleName: '',
  dateOfBirth: new Date('2010-01-15'),
  age: 16,
  gender: 'M',
  caseNumber: 'CS-001',
  caseType: 'Child Services',
  caseStatus: 'Open',
  caseLoad: 'CL-1',
  legacyFileNumber: null,
  serviceOffice: null,
  assignedTo: null,
  csaStatus: null,
  existingContactId: null,
  din: null,
  csaSentDate: null,
  misLegalAuthCode: null,
  enrollForCsa: null,
  legalExpiryDate: null,
  effectiveLegalStatus: null,
  legalAuthorityCode: null,
  effectiveDate: null,
  birthCity: null,
  birthProvince: null,
  birthCountry: null,
  akaFirstName: null,
  akaLastName: null,
  isIneligible: false,
  deceased: null,
  placements: [],
  orders: [],
  agreements: [],
  ...overrides,
})

const REF_DATE = new Date('2026-02-10')

describe('runEligibility', () => {
  it('should return null when no rules match (all return null)', () => {
    const passThrough: EligibilityRule = {
      name: 'pass',
      evaluate: () => null,
    }

    const result = runEligibility(makeContact(), [passThrough], REF_DATE)
    expect(result).toBeNull()
  })

  it('should return result from first matching rule', () => {
    const expected: EligibilityResult = {
      step: 8,
      newStatus: 'eligible_tbd',
      cancelReasonCode: null,
      careEndDate: null,
    }

    const rule1: EligibilityRule = { name: 'skip', evaluate: () => null }
    const rule2: EligibilityRule = { name: 'match', evaluate: () => expected }
    const rule3: EligibilityRule = {
      name: 'never-reached',
      evaluate: () => {
        throw new Error('Should not be called')
      },
    }

    const result = runEligibility(makeContact(), [rule1, rule2, rule3], REF_DATE)
    expect(result).toEqual(expected)
  })

  it('should pass shared context between rules', () => {
    const enricher: EligibilityRule = {
      name: 'enricher',
      evaluate: (ctx: EligibilityContext) => {
        ctx.hasPlacement = true
        ctx.contractNumbers = ['C-100']
        return null
      },
    }

    const reader: EligibilityRule = {
      name: 'reader',
      evaluate: (ctx: EligibilityContext) => {
        expect(ctx.hasPlacement).toBe(true)
        expect(ctx.contractNumbers).toEqual(['C-100'])
        return { step: 7, newStatus: 'eligible', cancelReasonCode: null, careEndDate: null }
      },
    }

    runEligibility(makeContact(), [enricher, reader], REF_DATE)
  })
})
