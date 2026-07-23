import { describe, expect, it } from 'vitest'
import { validateCraRequiredFields } from './cra-fields-validator'

const VALID_BASE = {
  firstName: 'Jane',
  lastName: 'Doe',
  gender: 'F',
  dateOfBirth: new Date('2010-01-01'),
  birthCity: 'Vancouver',
  birthCountry: 'Canada',
  birthProvince: 'BC',
  effectiveDate: new Date('2024-04-01'),
  careEndDate: null,
  cancelReasonCode: null,
}

describe('validateCraRequiredFields', () => {
  describe('Application records', () => {
    it('passes when all required fields are present', () => {
      const result = validateCraRequiredFields(VALID_BASE, 'application')
      expect(result.isValid).toBe(true)
      expect(result.missingFields).toHaveLength(0)
    })

    it('fails when gender is missing', () => {
      const result = validateCraRequiredFields({ ...VALID_BASE, gender: null }, 'application')
      expect(result.isValid).toBe(false)
      expect(result.missingFields).toContain('Gender')
    })

    it('fails when dateOfBirth is missing', () => {
      const result = validateCraRequiredFields({ ...VALID_BASE, dateOfBirth: null }, 'application')
      expect(result.isValid).toBe(false)
      expect(result.missingFields).toContain('Date of Birth')
    })

    it('fails when birthCity is missing', () => {
      const result = validateCraRequiredFields({ ...VALID_BASE, birthCity: null }, 'application')
      expect(result.isValid).toBe(false)
      expect(result.missingFields).toContain('City of Birth')
    })

    it('fails when birthCountry is missing', () => {
      const result = validateCraRequiredFields(
        { ...VALID_BASE, birthCountry: null, birthProvince: null },
        'application',
      )
      expect(result.isValid).toBe(false)
      expect(result.missingFields).toContain('Country of Birth')
    })

    it('fails when Application Start Date (effectiveDate) is missing', () => {
      const result = validateCraRequiredFields(
        { ...VALID_BASE, effectiveDate: null },
        'application',
      )
      expect(result.isValid).toBe(false)
      expect(result.missingFields).toContain('Application Start Date')
    })

    it('reports all missing fields at once', () => {
      const result = validateCraRequiredFields(
        {
          firstName: '',
          lastName: '',
          gender: null,
          dateOfBirth: null,
          birthCity: null,
          birthCountry: null,
          birthProvince: null,
          effectiveDate: null,
          careEndDate: null,
          cancelReasonCode: null,
        },
        'application',
      )
      expect(result.isValid).toBe(false)
      expect(result.missingFields).toEqual([
        'First Name',
        'Last Name',
        'Gender',
        'Date of Birth',
        'City of Birth',
        'Country of Birth',
        'Application Start Date',
      ])
    })
  })

  describe('Cancellation records', () => {
    const VALID_CANCELLATION = {
      ...VALID_BASE,
      effectiveDate: null,
      careEndDate: new Date('2024-03-31'),
      cancelReasonCode: '21',
    }

    it('passes when all cancellation fields are present', () => {
      const result = validateCraRequiredFields(VALID_CANCELLATION, 'cancellation')
      expect(result.isValid).toBe(true)
    })

    it('fails when careEndDate is missing', () => {
      const result = validateCraRequiredFields(
        { ...VALID_CANCELLATION, careEndDate: null },
        'cancellation',
      )
      expect(result.isValid).toBe(false)
      expect(result.missingFields).toContain('Cancellation End Date')
    })

    it('fails when cancelReasonCode is missing', () => {
      const result = validateCraRequiredFields(
        { ...VALID_CANCELLATION, cancelReasonCode: null },
        'cancellation',
      )
      expect(result.isValid).toBe(false)
      expect(result.missingFields).toContain('Cancellation Reason Code')
    })

    it('does NOT require effectiveDate for cancellation records', () => {
      const result = validateCraRequiredFields(VALID_CANCELLATION, 'cancellation')
      expect(result.missingFields).not.toContain('Application Start Date')
    })
  })

  describe('Province of Birth conditional', () => {
    it('requires birthProvince when country is Canada', () => {
      const result = validateCraRequiredFields(
        { ...VALID_BASE, birthProvince: null },
        'application',
      )
      expect(result.isValid).toBe(false)
      expect(result.missingFields).toContain('Province of Birth')
    })

    it('does NOT require birthProvince when country is not Canada', () => {
      const result = validateCraRequiredFields(
        { ...VALID_BASE, birthCountry: 'United States', birthProvince: null },
        'application',
      )
      expect(result.isValid).toBe(true)
    })

    it('is case-insensitive for Canada check (CANADA, canada, Canada)', () => {
      for (const country of ['CANADA', 'canada', 'Canada']) {
        const result = validateCraRequiredFields(
          { ...VALID_BASE, birthCountry: country, birthProvince: null },
          'application',
        )
        expect(result.missingFields).toContain('Province of Birth')
      }
    })
  })
})
