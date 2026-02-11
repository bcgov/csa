import { describe, expect, it } from 'vitest'
import { ContactProfile, OrderRecord } from '../../eligibility.types'
import { EligibilityContext } from '../rule.interface'
import { step6_OrderPaymentCheck } from './step6-order-payment-check'

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
  placements: [],
  orders: [],
  agreements: [],
  ...overrides,
})

const makeOrder = (overrides: Partial<OrderRecord> = {}): OrderRecord => ({
  orderType: 'Monthly Family Care Rate',
  orderStatus: 'Closed',
  effectiveStartDate: new Date('2026-01-15'), // previous month
  amount: 1600.0,
  contractNumber: 'C-100',
  source: 'ICM',
  ...overrides,
})

const REF_DATE = new Date('2026-02-10')

const makeCtx = (
  contactOverrides: Partial<ContactProfile> = {},
  ctxOverrides: Partial<EligibilityContext> = {},
): EligibilityContext => ({
  contact: makeContact(contactOverrides),
  hasPlacement: true,
  hasNonPlacement: false,
  contractNumbers: ['C-100'],
  ...ctxOverrides,
})

describe('step6_OrderPaymentCheck', () => {
  it('should route to step 7 when all 4 criteria are met', () => {
    const ctx = makeCtx({
      orders: [makeOrder()],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx, REF_DATE)
    expect(result!.step).toBe(7)
  })

  it('should route to step 8 when only order amount fails', () => {
    const ctx = makeCtx({
      orders: [makeOrder({ amount: 1000.0 })],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx, REF_DATE)
    expect(result!.step).toBe(8)
  })

  it('should route to step 8 when no orders found at all', () => {
    const ctx = makeCtx({ orders: [] })
    const result = step6_OrderPaymentCheck.evaluate(ctx, REF_DATE)
    expect(result!.step).toBe(8)
  })

  it('should route to step 9 when more than one criterion fails and no non-placement', () => {
    const ctx = makeCtx(
      { orders: [makeOrder({ amount: 1000.0, orderType: 'Invalid Type' })] },
      { hasNonPlacement: false },
    )
    const result = step6_OrderPaymentCheck.evaluate(ctx, REF_DATE)
    expect(result!.step).toBe(9)
  })

  it('should route to step 8 when more than one criterion fails but hasNonPlacement', () => {
    const ctx = makeCtx(
      { orders: [makeOrder({ amount: 1000.0, orderType: 'Invalid Type' })] },
      { hasNonPlacement: true },
    )
    const result = step6_OrderPaymentCheck.evaluate(ctx, REF_DATE)
    expect(result!.step).toBe(8)
  })

  it('should only consider orders matching contract numbers from placements', () => {
    const ctx = makeCtx({
      orders: [
        makeOrder({ contractNumber: 'C-999' }), // wrong contract
        makeOrder({ contractNumber: 'C-100', amount: 500 }), // right contract, low amount
      ],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx, REF_DATE)
    expect(result!.step).toBe(8) // only amount failed on matching order
  })

  it('should accept MIS order types (Fixed Rate, Variable Rate)', () => {
    const ctx = makeCtx({
      orders: [makeOrder({ orderType: 'Fixed Rate', source: 'MIS' })],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx, REF_DATE)
    expect(result!.step).toBe(7)
  })

  it('should accept Processed status (MIS)', () => {
    const ctx = makeCtx({
      orders: [makeOrder({ orderStatus: 'Processed', source: 'MIS' })],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx, REF_DATE)
    expect(result!.step).toBe(7)
  })

  it('should check order effective start date is in previous month', () => {
    // REF_DATE is Feb 2026, so previous month is Jan 2026
    const ctx = makeCtx({
      orders: [makeOrder({ effectiveStartDate: new Date('2025-12-15') })], // Dec 2025, not prev month
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx, REF_DATE)
    // Order date is wrong → more than amount failed → step 9 (no non-placement)
    expect(result!.step).toBe(9)
  })

  it('should accept order amount exactly at threshold', () => {
    const ctx = makeCtx({
      orders: [makeOrder({ amount: 1549.2 })],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx, REF_DATE)
    expect(result!.step).toBe(7)
  })
})
