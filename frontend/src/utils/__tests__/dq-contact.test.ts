import { describe, expect, it } from 'vitest'
import {
  DQ_DELETE_CONFIRM_MESSAGE,
  DQ_INVALID_DIN_MESSAGE,
  buildDqUpdatePayload,
  canDqModifyRecord,
  getApiErrorMessage,
  getDqDinHelperText,
  isDqDinValid,
  isDqProtectedStatus,
} from '../dq-contact'

describe('dq-contact', () => {
  describe('isDqProtectedStatus', () => {
    it('treats BL-35 protected statuses as protected', () => {
      expect(isDqProtectedStatus('on_hold')).toBe(true)
      expect(isDqProtectedStatus('in_batch_application')).toBe(true)
      expect(isDqProtectedStatus('cra_error_cancellation')).toBe(true)
    })

    it('does not treat over_18 or eligible as protected', () => {
      expect(isDqProtectedStatus('over_18')).toBe(false)
      expect(isDqProtectedStatus('eligible')).toBe(false)
      expect(isDqProtectedStatus('in_pay')).toBe(false)
    })
  })

  describe('canDqModifyRecord', () => {
    it('allows modify for DQ steward with one non-protected selection', () => {
      expect(canDqModifyRecord(true, 1, 'eligible')).toBe(true)
    })

    it('blocks when user is not DQ steward', () => {
      expect(canDqModifyRecord(false, 1, 'eligible')).toBe(false)
    })

    it('blocks when more than one record is selected', () => {
      expect(canDqModifyRecord(true, 2, 'eligible')).toBe(false)
    })

    it('blocks when current status is protected', () => {
      expect(canDqModifyRecord(true, 1, 'on_hold')).toBe(false)
    })

    it('blocks when selection cache status is missing', () => {
      expect(canDqModifyRecord(true, 1, undefined)).toBe(false)
    })
  })

  describe('isDqDinValid', () => {
    it('allows save when DIN was not edited', () => {
      expect(isDqDinValid('', '')).toBe(true)
      expect(isDqDinValid('123456789', '123456789')).toBe(true)
    })

    it('requires exactly 9 digits when DIN was edited', () => {
      expect(isDqDinValid('', '12345678')).toBe(false)
      expect(isDqDinValid('', '123456789')).toBe(true)
      expect(isDqDinValid('111111111', '222222222')).toBe(true)
    })
  })

  describe('getDqDinHelperText', () => {
    it('returns FDD message for invalid edited DIN', () => {
      expect(getDqDinHelperText('', '12345')).toBe(DQ_INVALID_DIN_MESSAGE)
    })

    it('returns empty string for valid or untouched DIN', () => {
      expect(getDqDinHelperText('', '')).toBe('')
      expect(getDqDinHelperText('', '123456789')).toBe('')
    })
  })

  describe('buildDqUpdatePayload', () => {
    it('includes only changed fields in the API payload', () => {
      expect(
        buildDqUpdatePayload(
          { din: '111111111', csaStatusRaw: 'eligible', statusEffective: '2026-01-01' },
          { din: '222222222', csaStatusRaw: 'eligible', statusEffective: '2026-02-01' },
        ),
      ).toEqual({
        din: '222222222',
        csaStatusEffectiveDate: '2026-02-01',
      })
    })
  })

  describe('getApiErrorMessage', () => {
    it('returns string API messages', () => {
      expect(
        getApiErrorMessage(
          {
            response: {
              data: { message: 'The DIN entered is already assigned to another child record.' },
            },
          },
          'fallback',
        ),
      ).toBe('The DIN entered is already assigned to another child record.')
    })

    it('joins validation array messages', () => {
      expect(
        getApiErrorMessage(
          { response: { data: { message: ['Invalid DIN.', 'Bad date.'] } } },
          'fallback',
        ),
      ).toBe('Invalid DIN., Bad date.')
    })

    it('falls back when no API message is present', () => {
      expect(getApiErrorMessage(new Error('network'), 'Failed to update record.')).toBe('network')
      expect(getApiErrorMessage({}, 'Failed to update record.')).toBe('Failed to update record.')
    })
  })

  describe('FDD copy constants', () => {
    it('uses BL-37 delete confirmation wording', () => {
      expect(DQ_DELETE_CONFIRM_MESSAGE).toContain('permanently delete the child record')
      expect(DQ_DELETE_CONFIRM_MESSAGE).toContain('Do you wish to continue?')
    })
  })
})
