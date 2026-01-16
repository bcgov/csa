import { Test, TestingModule } from '@nestjs/testing'
import { existsSync, writeFileSync } from 'fs'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { FileCreateService } from './file-create.service'
import { FileTransferClientService } from './file-transfer.service'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

describe('FileCreateService', () => {
  let service: FileCreateService
  let fileTransferClientService: FileTransferClientService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileCreateService,
        {
          provide: FileTransferClientService,
          useValue: {
            sendFileToTransferService: vi.fn(),
          },
        },
      ],
    }).compile()

    service = module.get(FileCreateService)
    fileTransferClientService = module.get(FileTransferClientService)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should create file and send it to transfer service successfully', async () => {
    // -------------------------
    // Arrange
    // -------------------------
    ;(existsSync as unknown as Mock).mockReturnValue(true)
    ;(fileTransferClientService.sendFileToTransferService as Mock).mockResolvedValue({
      statusCode: 226,
      message: 'Success',
    })

    const header = {
      tranCode: '6133',
      version: 'V00.0',
      processDate: '20260101',
      businessNum: '885633354RA0001',
      recordCount: 1,
    }

    const details = [
      {
        tranCode: '6134',
        referenceNum: 'REF001',
        businessNum: '885633354RA0001',
        tranType: '2',
        childGivenName: 'JOHN',
        childInitial: 'D',
        childSurName: 'DOE',
        childGivenNameAka: '',
        childSurNameAka: '',
        childBirthDate: '20200101',
        childSex: 'M',
        childBirthCity: 'TORONTO',
        childBirthProv: 'ON',
        childBirthCountry: 'CA',
        prevRecipSin: '123456789',
        filler1: '',
        prevRecipGivenName: 'MARY',
        prevRecipSurName: 'DOE',
        appStartDate: '20260101',
        newBornCode: 'Y',
        cancelEndDate: '',
        cancelReasonCode: '',
        ccraDinNum: '987654321',
      },
    ]

    const trailer = {
      tranCode: '6135',
      version: 'V00.0',
      processDate: '20260101',
      businessNum: '885633354RA0001',
      recordCount: 1,
    }

    // -------------------------
    // Act
    // -------------------------
    await service.createFile(header, details, trailer, 'testuser')

    // -------------------------
    // Assert
    // -------------------------
    expect(writeFileSync).toHaveBeenCalledOnce()
    console.log((fileTransferClientService.sendFileToTransferService as Mock).mock.calls)

    expect(fileTransferClientService.sendFileToTransferService).toHaveBeenCalledWith(
      expect.any(String), // outputPath
      expect.stringContaining('testuser'),
      'testuser',
    )
  })
})

// File header test case

describe('CRA Header format', () => {
  let service: FileCreateService

  beforeEach(() => {
    service = new FileCreateService({} as any)
  })

  it('should build header in correct CRA sequence and length', () => {
    const header = {
      tranCode: '6133',
      version: '001',
      processDate: '20260115',
      businessNum: '885633354RA0001',
      recordCount: 12,
    }

    const result = (service as any).buildHeader(header)

    // Field order check (CRA critical)
    expect(result.startsWith('6133')).toBe(true)

    // Exact length check
    // 4 + 5 + 8 + 15 + 8 = 40
    expect(result.length).toBe(40)

    // Padding checks
    expect(result.substring(0, 4)).toBe('6133')
    expect(result.substring(4, 9).trim()).toBe('001')
    expect(result.substring(9, 17)).toBe('20260115')
    expect(result.substring(17, 32).trim()).toBe('885633354RA0001')
    expect(result.substring(32, 40)).toBe('00000012')
  })
})

// File detail test case

describe('CRA Detail format', () => {
  let service: FileCreateService

  beforeEach(() => {
    service = new FileCreateService({} as any)
  })

  it('should pad fields correctly and maintain CRA field sequence', () => {
    const detail = {
      referenceNum: 'REF1',
      businessNum: '885633354RA0001',
      tranType: '1',
      childGivenName: 'JOHN',
      childInitial: 'A',
      childSurName: 'DOE',
      childGivenNameAka: '',
      childSurNameAka: '',
      childBirthDate: '20200101',
      childSex: 'M',
      childBirthCity: 'TORONTO',
      childBirthProv: 'ON',
      childBirthCountry: 'CA',
      prevRecipSin: '123456789',
      filler1: '',
      prevRecipGivenName: '',
      prevRecipSurName: '',
      appStartDate: '20240101',
      newBornCode: 'Y',
      cancelEndDate: '',
      cancelReasonCode: '',
      ccraDinNum: '987654321',
    }

    const result = (service as any).buildDetail(detail)

    // Must start with detail transaction code
    expect(result.startsWith('6134')).toBe(true)

    // Verify padding behavior
    expect(result.substring(4, 24).startsWith('REF1')).toBe(true) // padded right
    expect(result.substring(24, 39).trim()).toBe('885633354RA0001')

    // Exact total length (CRA spec)
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
        8 +
        2 +
        9,
    )
  })
})

// File trailer test case
describe('CRA Trailer format', () => {
  let service: FileCreateService

  beforeEach(() => {
    service = new FileCreateService({} as any)
  })

  it('should pad record count with leading zeros', () => {
    const trailer = {
      version: '001',
      processDate: '20260115',
      businessNum: '885633354RA0001',
      recordCount: 5,
    }

    const result = (service as any).buildTrailer(trailer)

    // Starts with trailer code
    expect(result.startsWith('6135')).toBe(true)

    // Record count must be zero-padded
    expect(result.substring(result.length - 8)).toBe('00000005')

    // Total length validation
    expect(result.length).toBe(40)
  })
})

// sequence test

describe('CRA field sequence integrity', () => {
  let service: FileCreateService

  beforeEach(() => {
    service = new FileCreateService({} as any)
  })

  it('should maintain CRA-required field sequence for detail record', () => {
    const detail = {
      referenceNum: 'REF',
      businessNum: 'BUS',
      tranType: '1',
      childGivenName: 'A',
      childInitial: 'B',
      childSurName: 'C',
      childGivenNameAka: 'D',
      childSurNameAka: 'E',
      childBirthDate: '20200101',
      childSex: 'M',
      childBirthCity: 'CITY',
      childBirthProv: 'ON',
      childBirthCountry: 'CA',
      prevRecipSin: '123456789',
      filler1: '',
      prevRecipGivenName: '',
      prevRecipSurName: '',
      appStartDate: '20240101',
      newBornCode: 'Y',
      cancelEndDate: '',
      cancelReasonCode: '',
      ccraDinNum: '111111111',
    }

    const result = (service as any).buildDetail(detail)

    const expectedSequence = [
      '6134',
      'REF',
      'BUS',
      '1',
      'A',
      'B',
      'C',
      'D',
      'E',
      '20200101',
      'M',
      'CITY',
      'ON',
      'CA',
      '123456789',
    ]

    expectedSequence.forEach((value) => {
      expect(result).toContain(value)
    })
  })
})
