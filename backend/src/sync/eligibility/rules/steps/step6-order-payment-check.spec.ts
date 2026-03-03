import { describe, expect, it } from 'vitest'
import { ContactProfile, OrderRecord } from '../../eligibility.types'
import { EligibilityContext } from '../rule.interface'
import { step6_OrderPaymentCheck } from './step6-order-payment-check'

const makeContact = (overrides: Partial<ContactProfile> = {}): ContactProfile => ({
  caseRowId: 'CASE-1',
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
  csaStatusEffectiveDate: null,
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
  isIneligible: false,
  deceased: null,
  cancelReasonCode: null,
  careEndDate: null,
  placements: [],
  orders: [],
  agreements: [],
  ...overrides,
})

const makeOrder = (overrides: Partial<OrderRecord> = {}): OrderRecord => ({
  orderType: 'Monthly Family Care Rate',
  orderStatus: 'Closed',
  effectiveStartDate: new Date('2026-01-15'), // previous month
  effectiveEndDate: null,
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
  referenceDate: REF_DATE,
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
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(7)
  })

  it('should route to step 8 when only order amount fails', () => {
    const ctx = makeCtx({
      orders: [makeOrder({ amount: 1000.0 })],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should route to step 8 when no orders found at all', () => {
    const ctx = makeCtx({ orders: [] })
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should route to step 9 when more than one criterion fails and no non-placement', () => {
    const ctx = makeCtx(
      { orders: [makeOrder({ amount: 1000.0, orderType: 'Invalid Type' })] },
      { hasNonPlacement: false },
    )
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(9)
  })

  it('should route to step 8 when more than one criterion fails but hasNonPlacement', () => {
    const ctx = makeCtx(
      { orders: [makeOrder({ amount: 1000.0, orderType: 'Invalid Type' })] },
      { hasNonPlacement: true },
    )
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should only consider orders matching contract numbers from placements', () => {
    const ctx = makeCtx({
      orders: [
        makeOrder({ contractNumber: 'C-999' }),
        makeOrder({ contractNumber: 'C-100', amount: 500 }),
      ],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should match ICM orders by agreementRowId when contractNumber is null', () => {
    const ctx = makeCtx(
      {
        orders: [makeOrder({ contractNumber: null, agreementRowId: 'A-1' })],
      },
      { contractNumbers: [], agreementRowIds: ['A-1'] },
    )
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(7)
  })

  it('should accept MIS order types (Fixed Rate, Variable Rate)', () => {
    const ctx = makeCtx({
      orders: [makeOrder({ orderType: 'Fixed Rate', source: 'MIS' })],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(7)
  })

  it('should handle variant casing and whitespace in order type and status', () => {
    const ctx = makeCtx({
      orders: [makeOrder({ orderType: ' monthly family care rate ', orderStatus: ' closed ' })],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(7)
  })

  it('should accept Processed status (MIS)', () => {
    const ctx = makeCtx({
      orders: [makeOrder({ orderStatus: 'Processed', source: 'MIS' })],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(7)
  })

  it('should check order effective start date is in previous month', () => {
    // REF_DATE is Feb 2026, so previous month is Jan 2026
    const ctx = makeCtx({
      orders: [makeOrder({ effectiveStartDate: new Date('2025-12-15') })],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(9)
  })

  it('should accept order amount exactly at threshold', () => {
    const ctx = makeCtx({
      orders: [makeOrder({ amount: 1549.2 })],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(7)
  })

  it('should route to step 7 if any previous-month order matches all 4 criteria', () => {
    const ctx = makeCtx({
      orders: [makeOrder({ amount: 500 }), makeOrder({ amount: 1600 })],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(7)
  })

  it('should route to step 7 even if highest-amount order fails type but another passes all 4', () => {
    const ctx = makeCtx({
      orders: [
        makeOrder({ amount: 2000, orderType: 'Invalid Type' }),
        makeOrder({ amount: 1600, orderType: 'Monthly Family Care Rate' }),
      ],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(7)
  })

  it('should ignore high-amount orders outside previous month', () => {
    const ctx = makeCtx({
      orders: [
        makeOrder({ amount: 5000, effectiveStartDate: new Date('2025-12-15') }),
        makeOrder({ amount: 1000 }),
      ],
    })
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })

  it('should route to step 8 when no previous-month orders but hasNonPlacement', () => {
    const ctx = makeCtx(
      { orders: [makeOrder({ effectiveStartDate: new Date('2025-12-15') })] },
      { hasNonPlacement: true },
    )
    const result = step6_OrderPaymentCheck.evaluate(ctx)
    expect(result!.step).toBe(8)
  })
})
