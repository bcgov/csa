import { describe, expect, it } from 'vitest'
import { ContactProfile, PlacementRecord } from '../../eligibility.types'
import { EligibilityContext } from '../rule.interface'
import { step3_PlacementCheck } from './step3-placement-check'

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
  enrollForCsa: 'Yes',
  legalExpiryDate: null,
  effectiveLegalStatus: null,
  legalAuthorityCode: null,
  effectiveDate: null,
  birthCity: null,
  birthProvince: null,
  birthCountry: null,
  akaFirstName: null,
  akaLastName: null,
  isInEligible: false,
  deceased: null,
  placements: [],
  orders: [],
  agreements: [],
  ...overrides,
})

const makePlacement = (overrides: Partial<PlacementRecord> = {}): PlacementRecord => ({
  type: 'Placement',
  status: 'Active',
  startDate: new Date('2025-01-01'),
  endDate: null,
  contractNumber: 'C-100',
  agreementRowId: 'A-1',
  paidUnpaid: 'Paid',
  source: 'ICM',
  ...overrides,
})

const makeCtx = (overrides: Partial<ContactProfile> = {}): EligibilityContext => ({
  contact: makeContact(overrides),
})

describe('step3_PlacementCheck', () => {
  it('should route to step 8 when no placements at all', () => {
    const ctx = makeCtx({ placements: [] })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should return null (continue to step 4) when only Active Placement found', () => {
    const ctx = makeCtx({
      placements: [makePlacement({ type: 'Placement', status: 'Active' })],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result).toBeNull()
    expect(ctx.hasPlacement).toBe(true)
    expect(ctx.hasNonPlacement).toBe(false)
  })

  it('should return null (continue to step 4) when only Interrupted Placement found', () => {
    const ctx = makeCtx({
      placements: [makePlacement({ type: 'Placement', status: 'Interrupted' })],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result).toBeNull()
    expect(ctx.hasPlacement).toBe(true)
  })

  it('should route to step 8 when only Active Non-Placement Location found', () => {
    const ctx = makeCtx({
      placements: [makePlacement({ type: 'Non-Placement Location', status: 'Active' })],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should route to step 8 when only Interrupted Non-Placement Location found', () => {
    const ctx = makeCtx({
      placements: [makePlacement({ type: 'Non-Placement Location', status: 'Interrupted' })],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should return null when both Active and Interrupted Placement on case', () => {
    const ctx = makeCtx({
      placements: [
        makePlacement({ type: 'Placement', status: 'Active' }),
        makePlacement({ type: 'Placement', status: 'Interrupted' }),
      ],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result).toBeNull()
    expect(ctx.hasPlacement).toBe(true)
    expect(ctx.eligiblePlacements).toHaveLength(2)
  })

  it('should route to step 8 when both Active and Interrupted Non-Placement on case', () => {
    const ctx = makeCtx({
      placements: [
        makePlacement({ type: 'Non-Placement Location', status: 'Active' }),
        makePlacement({ type: 'Non-Placement Location', status: 'Interrupted' }),
      ],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should return null with hasNonPlacement=true when both Placement and Non-Placement found', () => {
    const ctx = makeCtx({
      placements: [
        makePlacement({ type: 'Placement', status: 'Active' }),
        makePlacement({ type: 'Non-Placement Location', status: 'Interrupted' }),
      ],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result).toBeNull()
    expect(ctx.hasPlacement).toBe(true)
    expect(ctx.hasNonPlacement).toBe(true)
    // Only placements (not non-placements) in eligiblePlacements
    expect(ctx.eligiblePlacements).toHaveLength(1)
    expect(ctx.eligiblePlacements![0].type).toBe('Placement')
  })

  it('should only consider Active/Interrupted placements, ignoring other statuses', () => {
    const ctx = makeCtx({
      placements: [makePlacement({ type: 'Placement', status: 'Ended' })],
    })
    const result = step3_PlacementCheck.evaluate(ctx)
    expect(result!.step).toBe(8) // no active/interrupted->step 8
  })
})
