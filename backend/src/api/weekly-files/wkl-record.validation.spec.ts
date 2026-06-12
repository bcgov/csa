import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { CRA_DATA_HANDLING_CONSTANT } from 'src/cra/cra.constant'
import type { DetailRecord04 } from 'src/cra/inbound/inbound-weekly.interface'
import {
  assertCanAssociate,
  assertCanDissociate,
  assertCanReprocess,
  isManualReviewCraStatus,
  isWklElectronic,
} from './wkl-record.validation'

const { WKL_MATCH_STATUS } = CRA_DATA_HANDLING_CONSTANT

const electronicCompleted = {
  receiveMode: 'E',
  status: 'completed',
} as DetailRecord04

describe('wkl-record.validation', () => {
  it('detects electronic records', () => {
    expect(isWklElectronic({ receiveMode: 'E' } as DetailRecord04)).toBe(true)
    expect(isWklElectronic({ receiveMode: ' ' } as DetailRecord04)).toBe(false)
  })

  it('detects manual-review CRA statuses per FDD', () => {
    expect(isManualReviewCraStatus('completed')).toBe(true)
    expect(isManualReviewCraStatus('abandoned')).toBe(true)
    expect(isManualReviewCraStatus('updated')).toBe(false)
    expect(isManualReviewCraStatus('in-progress')).toBe(false)
  })

  it('allows associate for unmatched electronic completed records', () => {
    expect(() =>
      assertCanAssociate(
        {
          matchStatus: WKL_MATCH_STATUS.UNMATCHED,
          contactId: null,
          processedAt: null,
          batchDetailId: null,
        },
        electronicCompleted,
      ),
    ).not.toThrow()
  })

  it('rejects associate when CRA status is in-progress', () => {
    expect(() =>
      assertCanAssociate(
        {
          matchStatus: WKL_MATCH_STATUS.UNMATCHED,
          contactId: null,
          processedAt: null,
          batchDetailId: null,
        },
        { receiveMode: 'E', status: 'in-progress' } as DetailRecord04,
      ),
    ).toThrow(BadRequestException)
  })

  it('rejects associate when contact is already linked', () => {
    expect(() =>
      assertCanAssociate(
        {
          matchStatus: WKL_MATCH_STATUS.UNMATCHED,
          contactId: 99,
          processedAt: null,
          batchDetailId: null,
        },
        electronicCompleted,
      ),
    ).toThrow('Record is already associated with a contact')
  })

  it('allows dissociate for associated records ready to undo', () => {
    expect(() =>
      assertCanDissociate(
        {
          matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
          contactId: 99,
          processedAt: null,
          batchDetailId: null,
        },
        electronicCompleted,
      ),
    ).not.toThrow()
  })

  it('rejects dissociate after confirm', () => {
    expect(() =>
      assertCanDissociate(
        {
          matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
          contactId: 99,
          processedAt: new Date(),
          batchDetailId: 10,
        },
        electronicCompleted,
      ),
    ).toThrow('Cannot dissociate a record that has already been confirmed')
  })

  it('allows reprocess for associated records ready to confirm', () => {
    expect(() =>
      assertCanReprocess(
        {
          matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
          contactId: 99,
          processedAt: null,
          batchDetailId: null,
        },
        electronicCompleted,
      ),
    ).not.toThrow()
  })

  it('rejects reprocess when record is already reprocessed', () => {
    expect(() =>
      assertCanReprocess(
        {
          matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
          contactId: 99,
          processedAt: new Date(),
          batchDetailId: 10,
        },
        electronicCompleted,
      ),
    ).toThrow('Record has already been reprocessed')
  })
})
