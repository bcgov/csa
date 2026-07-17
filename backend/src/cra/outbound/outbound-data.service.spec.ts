import { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { OutboundDataService } from './outbound-data.service'

const { REQUEST_FILE } = CRA_DATA_HANDLING_CONSTANT
const { HEADER_TRAN_CODE, DETAIL_TRAN_CODE, TRAILER_TRAN_CODE, VERSION_NUM } = REQUEST_FILE

const TEST_BUSINESS_NUM = process.env.CRA_BUSINESS_NUM!

const mockConfigService = {
  get: vi.fn((key: string) => {
    if (key === 'cra.businessNum') return TEST_BUSINESS_NUM
    return undefined
  }),
} as unknown as ConfigService

const makeContact = (overrides = {}) => ({
  id: 1,
  firstName: 'EMILY',
  middleName: 'A',
  lastName: 'SMITH',
  akaFirstName: '',
  akaLastName: '',
  personIdIcm: 'ICM001',
  dateOfBirth: new Date(2015, 1, 15),
  gender: 'F',
  birthCity: 'TORONTO',
  birthProvince: 'ON',
  birthCountry: 'Canada',
  din: '987654321',
  effectiveDate: new Date(2024, 5, 1),
  legacyFileNumber: 'LFN001',
  csaStatusEffectiveDate: new Date(2024, 5, 1),
  prevRecipientFirstName: null,
  prevRecipientLastName: null,
  cancelReasonCode: null,
  careEndDate: null,
  ...overrides,
})

const makeDetail = (overrides = {}) => ({
  id: 100,
  contactId: 1,
  batchId: 1,
  transactionType: 'application',
  referenceNumber: 'LFN001-100',
  status: 'pending',
  effectiveDate: new Date(2024, 5, 1),
  cancelReasonCode: null,
  contact: makeContact(),
  ...overrides,
})

describe('OutboundDataService', () => {
  let service: OutboundDataService

  beforeEach(() => {
    service = new OutboundDataService(mockConfigService)
  })

  describe('buildCraFileData', () => {
    it('should return header, details, and trailer', () => {
      const batchDetails = [makeDetail()]
      const result = service.buildCraFileData(batchDetails)

      expect(result).toHaveProperty('header')
      expect(result).toHaveProperty('details')
      expect(result).toHaveProperty('trailer')
    })

    it('should set trailer recordCount equal to the number of details', () => {
      const batchDetails = [
        makeDetail({ id: 100 }),
        makeDetail({ id: 101 }),
        makeDetail({ id: 102 }),
      ]
      const result = service.buildCraFileData(batchDetails)

      expect(result.trailer.recordCount).toBe(3)
    })

    it('should set header recordCount to 0', () => {
      const batchDetails = [makeDetail()]
      const result = service.buildCraFileData(batchDetails)

      expect(result.header.recordCount).toBe(0)
    })

    it('should return empty details array when given no batch details', () => {
      const result = service.buildCraFileData([])

      expect(result.details).toEqual([])
      expect(result.trailer.recordCount).toBe(0)
    })

    it('should use correct tran codes', () => {
      const result = service.buildCraFileData([makeDetail()])

      expect(result.header.tranCode).toBe(HEADER_TRAN_CODE)
      expect(result.details[0].tranCode).toBe(DETAIL_TRAN_CODE)
      expect(result.trailer.tranCode).toBe(TRAILER_TRAN_CODE)
    })

    it('should use correct versionNum and businessNum', () => {
      const result = service.buildCraFileData([makeDetail()])

      expect(result.header.versionNum).toBe(VERSION_NUM)
      expect(result.header.businessNum).toBe(TEST_BUSINESS_NUM)
      expect(result.trailer.versionNum).toBe(VERSION_NUM)
      expect(result.trailer.businessNum).toBe(TEST_BUSINESS_NUM)
    })

    it('should set processDate on header and trailer as YYYYMMDD format', () => {
      const result = service.buildCraFileData([makeDetail()])

      expect(result.header.processDate).toMatch(/^\d{8}$/)
      expect(result.trailer.processDate).toMatch(/^\d{8}$/)
      expect(result.header.processDate).toBe(result.trailer.processDate)
    })
  })

  describe('Application detail mapping', () => {
    it('should set tranType to 2 for applications', () => {
      const batchDetails = [makeDetail({ transactionType: 'application' })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].tranType).toBe(2)
    })

    it('should set referenceNum from batch detail referenceNumber', () => {
      const batchDetails = [makeDetail({ referenceNumber: 'LFN001-42' })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].referenceNum).toBe('LFN001-42')
    })

    it('should map contact fields correctly', () => {
      const contact = makeContact({
        firstName: 'EMILY',
        middleName: 'Ann',
        lastName: 'SMITH',
        akaFirstName: 'EM',
        akaLastName: 'SMYTH',
        dateOfBirth: new Date(2015, 1, 15),
        gender: 'F',
        birthCity: 'TORONTO',
        birthProvince: 'ON',
        birthCountry: 'Canada',
        din: '987654321',
      })
      const batchDetails = [makeDetail({ contact })]
      const result = service.buildCraFileData(batchDetails)
      const detail = result.details[0]

      expect(detail.childGivenName).toBe('EMILY')
      expect(detail.childInitial).toBe('A')
      expect(detail.childSurName).toBe('SMITH')
      expect(detail.childGivenNameAka).toBe('EM')
      expect(detail.childSurNameAka).toBe('SMYTH')
      expect(detail.childBirthDate).toBe('20150215')
      expect(detail.childSex).toBe('F')
      expect(detail.childBirthCity).toBe('TORONTO')
      expect(detail.childBirthProv).toBe('ON')
      expect(detail.childBirthCountry).toBe('CA')
      expect(detail.ccraDinNum).toBe('987654321')
      expect(detail.businessNum).toBe(TEST_BUSINESS_NUM)
    })

    it('should map "Canada" to CA', () => {
      const contact = makeContact({ birthCountry: 'Canada' })
      const batchDetails = [makeDetail({ contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].childBirthCountry).toBe('CA')
    })

    it('should map "canada" (lowercase) to CA', () => {
      const contact = makeContact({ birthCountry: 'canada' })
      const batchDetails = [makeDetail({ contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].childBirthCountry).toBe('CA')
    })

    it('should map non-Canada country to EX', () => {
      const contact = makeContact({ birthCountry: 'Philippines' })
      const batchDetails = [makeDetail({ contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].childBirthCountry).toBe('EX')
    })

    it('should default null birthCountry to CA', () => {
      const contact = makeContact({ birthCountry: null })
      const batchDetails = [makeDetail({ contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].childBirthCountry).toBe('CA')
    })

    it('should default empty birthCountry to CA', () => {
      const contact = makeContact({ birthCountry: '' })
      const batchDetails = [makeDetail({ contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].childBirthCountry).toBe('CA')
    })

    it('should set appStartDate from contact.effectiveDate for applications', () => {
      const contact = makeContact({ effectiveDate: new Date(2024, 5, 1) })
      const batchDetails = [makeDetail({ transactionType: 'application', contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].appStartDate).toBe('20240601')
    })

    it('should leave cancelEndDate and cancelReasonCode empty for applications', () => {
      const batchDetails = [makeDetail({ transactionType: 'application' })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].cancelEndDate).toBe('')
      expect(result.details[0].cancelReasonCode).toBe('')
    })

    it('should map prevRecipient fields for applications', () => {
      const contact = makeContact({
        prevRecipientFirstName: 'JANE',
        prevRecipientLastName: 'DOE',
      })
      const batchDetails = [makeDetail({ transactionType: 'application', contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].prevRecipGivenName).toBe('JANE')
      expect(result.details[0].prevRecipSurName).toBe('DOE')
    })

    it('should handle null prevRecipient fields gracefully', () => {
      const contact = makeContact({
        prevRecipientFirstName: null,
        prevRecipientLastName: null,
      })
      const batchDetails = [makeDetail({ transactionType: 'application', contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].prevRecipGivenName).toBe('')
      expect(result.details[0].prevRecipSurName).toBe('')
    })
  })

  describe('Cancellation detail mapping', () => {
    it('should set tranType to 1 for cancellations', () => {
      const batchDetails = [makeDetail({ transactionType: 'cancellation' })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].tranType).toBe(1)
    })

    it('should set referenceNum from batch detail referenceNumber for cancellations', () => {
      const batchDetails = [
        makeDetail({ transactionType: 'cancellation', referenceNumber: 'LFN001-200' }),
      ]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].referenceNum).toBe('LFN001-200')
    })

    it('should set cancelEndDate from batch detail effectiveDate', () => {
      const contact = makeContact({ careEndDate: new Date(2025, 2, 15) })
      const batchDetails = [
        makeDetail({
          transactionType: 'cancellation',
          contact,
          effectiveDate: new Date(2025, 2, 15),
        }),
      ]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].cancelEndDate).toBe('20250315')
    })

    it('should set cancelReasonCode from batch detail cancelReasonCode', () => {
      const contact = makeContact({ cancelReasonCode: '03' })
      const batchDetails = [
        makeDetail({ transactionType: 'cancellation', contact, cancelReasonCode: '03' }),
      ]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].cancelReasonCode).toBe('03')
    })

    it('should leave appStartDate empty for cancellations', () => {
      const batchDetails = [makeDetail({ transactionType: 'cancellation' })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].appStartDate).toBe('')
    })

    it('should set newBornCode to empty string for cancellations', () => {
      const batchDetails = [makeDetail({ transactionType: 'cancellation' })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].newBornCode).toBe('')
    })
  })

  describe('Gender mapping', () => {
    it('should map M to M', () => {
      const contact = makeContact({ gender: 'M' })
      const batchDetails = [makeDetail({ contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].childSex).toBe('M')
    })

    it('should map F to F', () => {
      const contact = makeContact({ gender: 'F' })
      const batchDetails = [makeDetail({ contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].childSex).toBe('F')
    })

    it('should map Non-Binary to X', () => {
      const contact = makeContact({ gender: 'Non-Binary' })
      const batchDetails = [makeDetail({ contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].childSex).toBe('X')
    })

    it('should map Unknown to X', () => {
      const contact = makeContact({ gender: 'Unknown' })
      const batchDetails = [makeDetail({ contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].childSex).toBe('X')
    })

    it('should map null to X', () => {
      const contact = makeContact({ gender: null })
      const batchDetails = [makeDetail({ contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].childSex).toBe('X')
    })

    it('should map empty string to X', () => {
      const contact = makeContact({ gender: '' })
      const batchDetails = [makeDetail({ contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].childSex).toBe('X')
    })
  })

  describe('NewBorn code', () => {
    it('should return Y when child is less than 365 days old AND din is blank', () => {
      const recentBirthDate = new Date()
      recentBirthDate.setDate(recentBirthDate.getDate() - 100) // 100 days old

      const contact = makeContact({
        dateOfBirth: recentBirthDate,
        din: '',
      })
      const batchDetails = [makeDetail({ transactionType: 'application', contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].newBornCode).toBe('Y')
    })

    it('should return Y when child is less than 365 days old AND din is null', () => {
      const recentBirthDate = new Date()
      recentBirthDate.setDate(recentBirthDate.getDate() - 100)

      const contact = makeContact({
        dateOfBirth: recentBirthDate,
        din: null,
      })
      const batchDetails = [makeDetail({ transactionType: 'application', contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].newBornCode).toBe('Y')
    })

    it('should return N when child is 365 or more days old', () => {
      const olderBirthDate = new Date()
      olderBirthDate.setDate(olderBirthDate.getDate() - 400) // 400 days old

      const contact = makeContact({
        dateOfBirth: olderBirthDate,
        din: '',
      })
      const batchDetails = [makeDetail({ transactionType: 'application', contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].newBornCode).toBe('N')
    })

    it('should return N when child is young but has a din', () => {
      const recentBirthDate = new Date()
      recentBirthDate.setDate(recentBirthDate.getDate() - 100) // 100 days old

      const contact = makeContact({
        dateOfBirth: recentBirthDate,
        din: '123456789',
      })
      const batchDetails = [makeDetail({ transactionType: 'application', contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].newBornCode).toBe('N')
    })

    it('should return N when dateOfBirth is null', () => {
      const contact = makeContact({
        dateOfBirth: null,
        din: '',
      })
      const batchDetails = [makeDetail({ transactionType: 'application', contact })]
      const result = service.buildCraFileData(batchDetails)

      expect(result.details[0].newBornCode).toBe('N')
    })
  })

  describe('formatDate — DATE column edge cases', () => {
    it('should format Prisma DATE (midnight UTC) correctly', () => {
      const contact = makeContact({ dateOfBirth: new Date('2015-02-15T00:00:00.000Z') })
      const result = service.buildCraFileData([makeDetail({ contact })])

      expect(result.details[0].childBirthDate).toBe('20150215')
    })

    it('should not shift date when UTC midnight is previous day in Pacific', () => {
      const contact = makeContact({ dateOfBirth: new Date('2026-03-01T00:00:00.000Z') })
      const result = service.buildCraFileData([makeDetail({ contact })])

      expect(result.details[0].childBirthDate).toBe('20260301')
    })

    it('should handle effectiveDate at midnight UTC correctly', () => {
      const contact = makeContact({ effectiveDate: new Date('2024-06-01T00:00:00.000Z') })
      const result = service.buildCraFileData([
        makeDetail({
          transactionType: 'application',
          contact,
          effectiveDate: new Date('2024-06-01T00:00:00.000Z'),
        }),
      ])

      expect(result.details[0].appStartDate).toBe('20240601')
    })

    it('should handle careEndDate at midnight UTC correctly', () => {
      const contact = makeContact({ careEndDate: new Date('2025-12-31T00:00:00.000Z') })
      const result = service.buildCraFileData([
        makeDetail({
          transactionType: 'cancellation',
          contact,
          effectiveDate: new Date('2025-12-31T00:00:00.000Z'),
        }),
      ])

      expect(result.details[0].cancelEndDate).toBe('20251231')
    })

    it('should handle date with non-midnight UTC time correctly', () => {
      const contact = makeContact({ dateOfBirth: new Date('2015-02-15T23:59:59.000Z') })
      const result = service.buildCraFileData([makeDetail({ contact })])

      expect(result.details[0].childBirthDate).toBe('20150215')
    })

    it('should handle date crossing UTC day boundary', () => {
      const contact = makeContact({ dateOfBirth: new Date('2015-02-16T07:30:00.000Z') })
      const result = service.buildCraFileData([makeDetail({ contact })])

      expect(result.details[0].childBirthDate).toBe('20150216')
    })

    it('should handle leap year date (Feb 29)', () => {
      const contact = makeContact({ dateOfBirth: new Date('2024-02-29T00:00:00.000Z') })
      const result = service.buildCraFileData([makeDetail({ contact })])

      expect(result.details[0].childBirthDate).toBe('20240229')
    })

    it('should handle year boundary (Dec 31 → Jan 1)', () => {
      const contact = makeContact({ effectiveDate: new Date('2025-01-01T00:00:00.000Z') })
      const result = service.buildCraFileData([
        makeDetail({
          transactionType: 'application',
          contact,
          effectiveDate: new Date('2025-01-01T00:00:00.000Z'),
        }),
      ])

      expect(result.details[0].appStartDate).toBe('20250101')
    })

    it('should handle string date input', () => {
      const contact = makeContact({ dateOfBirth: '2015-02-15' })
      const result = service.buildCraFileData([makeDetail({ contact })])

      expect(result.details[0].childBirthDate).toBe('20150215')
    })
  })

  describe('Null/missing field handling', () => {
    it('should handle all nullable contact fields as empty strings', () => {
      const contact = makeContact({
        middleName: null,
        akaFirstName: null,
        akaLastName: null,
        dateOfBirth: null,
        gender: null,
        birthCity: null,
        birthProvince: null,
        birthCountry: null,
        din: null,
        effectiveDate: null,
        legacyFileNumber: null,
        prevRecipientFirstName: null,
        prevRecipientLastName: null,
        cancelReasonCode: null,
        careEndDate: null,
      })
      const batchDetails = [
        makeDetail({
          transactionType: 'application',
          contact,
          effectiveDate: null,
          cancelReasonCode: null,
        }),
      ]
      const result = service.buildCraFileData(batchDetails)
      const detail = result.details[0]

      expect(detail.childInitial).toBe('')
      expect(detail.childGivenNameAka).toBe('')
      expect(detail.childSurNameAka).toBe('')
      expect(detail.childBirthDate).toBe('')
      expect(detail.childSex).toBe('X')
      expect(detail.childBirthCity).toBe('')
      expect(detail.childBirthProv).toBe('')
      expect(detail.childBirthCountry).toBe('CA')
      expect(detail.ccraDinNum).toBe('')
      expect(detail.appStartDate).toBe('')
      expect(detail.prevRecipGivenName).toBe('')
      expect(detail.prevRecipSurName).toBe('')
    })
  })
})
