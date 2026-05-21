import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { existsSync, writeFileSync } from 'fs'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { formatDatePacificCompact } from 'src/common/utils'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { OutboundDataService } from './outbound-data.service'
import { OutboundFileService } from './outbound-file.service'
import { FILE_MOCK_DATA } from './outbound-mock-data'

const { header, details, trailer } = FILE_MOCK_DATA
const { REQUEST_FILE } = CRA_DATA_HANDLING_CONSTANT
const { VERSION_NUM, HEADER_TRAN_CODE, DETAIL_TRAN_CODE, TRAILER_TRAN_CODE, HEADER_RECORD_CONT } =
  REQUEST_FILE

const TEST_BUSINESS_NUM = process.env.CRA_BUSINESS_NUM!

const mockConfigService = {
  get: vi.fn((key: string) => {
    const config: Record<string, string> = {
      'app.fileStoragePath': './temp/',
      'cra.businessNum': TEST_BUSINESS_NUM,
      'cra.environmentCode': 'ACSAIN',
      'cra.fileTypeCode': 'AAPL',
      'cra.fileNamePrefix': 'II',
      'cra.userId': 'TST0001',
    }
    return config[key]
  }),
}

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    createReadStream: vi.fn(() => ({
      on: vi.fn(),
      pipe: vi.fn(),
    })),
  }
})

const currentDate = (): string => formatDatePacificCompact(new Date())

describe('OutboundFileService', () => {
  let service: OutboundFileService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboundFileService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile()

    service = module.get(OutboundFileService)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should create file successfully', () => {
    ;(existsSync as unknown as Mock).mockReturnValue(true)

    service.createFile(header, details, trailer, 'test-destination', 1)
    expect(writeFileSync).toHaveBeenCalled()
  })
})

describe('CRA Header format', () => {
  let service: OutboundFileService

  beforeEach(() => {
    service = new OutboundFileService(mockConfigService as unknown as ConfigService)
  })

  it('should build header in correct CRA sequence and length', () => {
    const result = (service as any).buildHeader(header)

    expect(result.startsWith(String(HEADER_TRAN_CODE))).toBe(true)
    expect(result.length).toBe(65) // 4 + 5 + 8 + 15 + 8 + 25
    expect(result.substring(0, 4)).toBe(String(HEADER_TRAN_CODE))
    expect(result.substring(4, 9).trim()).toBe(VERSION_NUM)
    expect(result.substring(9, 17)).toBe(currentDate())
    expect(result.substring(17, 32).trim()).toBe(TEST_BUSINESS_NUM)
    expect(result.substring(32, 40)).toBe(HEADER_RECORD_CONT)
  })
})

describe('CRA Detail format', () => {
  let service: OutboundFileService

  beforeEach(() => {
    service = new OutboundFileService(mockConfigService as unknown as ConfigService)
  })

  it('should pad fields correctly and maintain CRA Application field sequence', () => {
    const result = (service as any).buildAppDetail(details[0])

    expect(result.startsWith(String(DETAIL_TRAN_CODE))).toBe(true)
    expect(result.substring(4, 24).startsWith('REF')).toBe(true)
    expect(result.substring(24, 39).trim()).toBe(TEST_BUSINESS_NUM)

    expect(result.length).toBe(
      4 +
        20 +
        15 +
        1 +
        30 +
        1 +
        30 +
        30 +
        30 +
        8 +
        1 +
        28 +
        2 +
        2 +
        9 +
        6 +
        30 +
        30 +
        8 +
        1 +
        10 +
        9 +
        15,
    )
  })
  it('should pad fields correctly and maintain CRA Cancelation field sequence', () => {
    const result = (service as any).buildCanDetail(details[1])

    expect(result.startsWith(String(DETAIL_TRAN_CODE))).toBe(true)
    expect(result.substring(4, 24).startsWith('REF')).toBe(true)
    expect(result.substring(24, 39).trim()).toBe(TEST_BUSINESS_NUM)

    expect(result.length).toBe(
      4 + 20 + 15 + 1 + 30 + 1 + 30 + 30 + 30 + 8 + 1 + 28 + 2 + 2 + 75 + 8 + 1 + 8 + 2 + 9 + 15,
    )
  })
})

describe('OutboundDataService->OutboundFileService integration', () => {
  let fileCreateService: OutboundFileService
  let craDataService: OutboundDataService

  beforeEach(() => {
    fileCreateService = new OutboundFileService(mockConfigService as unknown as ConfigService)
    craDataService = new OutboundDataService(mockConfigService as unknown as ConfigService)
  })

  const makeContact = (overrides = {}) => ({
    id: 1,
    firstName: 'EMILY',
    middleName: 'Anne',
    lastName: 'SMITH',
    akaFirstName: '',
    akaLastName: '',
    personIdIcm: 'ICM001',
    dateOfBirth: new Date('2015-02-15'),
    gender: 'F',
    birthCity: 'TORONTO',
    birthProvince: 'ON',
    birthCountry: 'Canada',
    din: '987654321',
    effectiveDate: new Date('2024-06-01'),
    legacyFileNumber: 'LFN001',
    prevRecipientFirstName: 'MARY',
    prevRecipientLastName: 'DOE',
    cancelReasonCode: '21',
    careEndDate: new Date('2024-06-10'),
    ...overrides,
  })

  it('should produce valid application record with correct field positions', () => {
    const batchDetails = [
      {
        id: 100,
        transactionType: 'application',
        referenceNumber: 'LFN001-100',
        contact: makeContact(),
      },
    ]

    const { details } = craDataService.buildCraFileData(batchDetails as any)
    const line = (fileCreateService as any).buildAppDetail(details[0])

    // Total length = 320 (CRA spec)
    expect(line.length).toBe(320)

    // Field positions (cumulative offsets)
    expect(line.substring(0, 4)).toBe('6134') // tranCode
    expect(line.substring(4, 24).trim()).toBe('LFN001-100') // referenceNum
    expect(line.substring(24, 39).trim()).toBe(TEST_BUSINESS_NUM) // businessNum
    expect(line.substring(39, 40)).toBe('2') // tranType = application
    expect(line.substring(40, 70).trim()).toBe('EMILY') // childGivenName
    expect(line.substring(70, 71)).toBe('A') // childInitial (first char of middleName)
    expect(line.substring(71, 101).trim()).toBe('SMITH') // childSurName
    expect(line.substring(101, 131).trim()).toBe('') // childGivenNameAka
    expect(line.substring(131, 161).trim()).toBe('') // childSurNameAka
    expect(line.substring(161, 169)).toBe('20150215') // childBirthDate
    expect(line.substring(169, 170)).toBe('F') // childSex
    expect(line.substring(170, 198).trim()).toBe('TORONTO') // childBirthCity
    expect(line.substring(198, 200)).toBe('ON') // childBirthProv
    expect(['CA', 'EX']).toContain(line.substring(200, 202)) // childBirthCountry
    expect(line.substring(202, 211).trim()).toBe('') // prevRecipSin (blank)
    expect(line.substring(211, 217).trim()).toBe('') // filler1
    expect(line.substring(217, 247).trim()).toBe('MARY') // prevRecipGivenName
    expect(line.substring(247, 277).trim()).toBe('DOE') // prevRecipSurName
    expect(line.substring(277, 285)).toBe('20240601') // appStartDate
    expect(line.substring(285, 286)).toBe('N') // newBornCode (child > 365 days)
    expect(line.substring(286, 296).trim()).toBe('') // filler2
    expect(line.substring(296, 305).trim()).toBe('987654321') // ccraDinNum
    expect(line.substring(305, 320).trim()).toBe('') // filler3
  })

  it('should produce valid cancellation record with correct field positions', () => {
    const batchDetails = [
      {
        id: 200,
        transactionType: 'cancellation',
        referenceNumber: 'LFN001-200',
        contact: makeContact(),
      },
    ]

    const { details } = craDataService.buildCraFileData(batchDetails as any)
    const line = (fileCreateService as any).buildCanDetail(details[0])

    // Total length = 320 (CRA spec)
    expect(line.length).toBe(320)

    expect(line.substring(0, 4)).toBe('6134') // tranCode
    expect(line.substring(4, 24).trim()).toBe('LFN001-200') // referenceNum
    expect(line.substring(39, 40)).toBe('1') // tranType = cancellation
    expect(line.substring(40, 70).trim()).toBe('EMILY') // childGivenName
    expect(line.substring(202, 277).trim()).toBe('') // 75-char filler (preceding recipient block)
    expect(line.substring(277, 285).trim()).toBe('') // 8-char filler (replaces appStartDate)
    expect(line.substring(285, 286).trim()).toBe('') // 1-char filler (replaces newBornCode)
    expect(line.substring(286, 294)).toBe('20240610') // cancelEndDate
    expect(line.substring(294, 296)).toBe('21') // cancelReasonCode
    expect(line.substring(296, 305).trim()).toBe('987654321') // ccraDinNum
  })

  it('should map gender Non-Binary to X in file output', () => {
    const batchDetails = [
      {
        id: 100,
        transactionType: 'application',
        referenceNumber: 'LFN001-100',
        contact: makeContact({ gender: 'Non-Binary' }),
      },
    ]

    const { details } = craDataService.buildCraFileData(batchDetails as any)
    const line = (fileCreateService as any).buildAppDetail(details[0])

    expect(line.substring(169, 170)).toBe('X')
  })
})

describe('CRA Trailer format', () => {
  let service: OutboundFileService

  beforeEach(() => {
    service = new OutboundFileService(mockConfigService as unknown as ConfigService)
  })

  it('should pad record count with leading zeros', () => {
    const result = (service as any).buildTrailer(trailer)

    expect(result.startsWith(TRAILER_TRAN_CODE)).toBe(true)
    expect(result.substring(result.length - 25)).toBe('                         ')
    expect(result.length).toBe(65)
  })
})
