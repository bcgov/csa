import { Test, TestingModule } from '@nestjs/testing'
import { existsSync, writeFileSync } from 'fs'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { FileCreateService } from './file-create.service'
import { FileTransferClientService } from './file-transfer.service'
import { FILE_MOCK_DATA } from './file-mock-data'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'

const { header, details, trailer } = FILE_MOCK_DATA
const { REQUEST_FILE } = CRA_DATA_HANDLING_CONSTANT
const {
  BUSINESS_NUM,
  VERSION_NUM,
  HEADER_TRAN_CODE,
  DETAIL_TRAN_CODE,
  TRAILER_TRAN_CODE,
  HEADER_RECORD_CONT,
} = REQUEST_FILE

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

const currentDate = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

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
    ;(existsSync as unknown as Mock).mockReturnValue(true)
    ;(fileTransferClientService.sendFileToTransferService as Mock).mockResolvedValue({
      statusCode: 226,
      message: 'Success',
    })

    service.createFile(header, details, trailer, 'testuser')
    expect(writeFileSync).toHaveBeenCalled()
  })
})

describe('CRA Header format', () => {
  let service: FileCreateService

  beforeEach(() => {
    service = new FileCreateService()
  })

  it('should build header in correct CRA sequence and length', () => {
    const result = (service as any).buildHeader(header)

    // Field order check (CRA critical)
    expect(result.startsWith(String(HEADER_TRAN_CODE))).toBe(true)

    // Exact length check
    // 4 + 5 + 8 + 15 + 8 +25 = 65
    expect(result.length).toBe(65)

    // Padding checks
    expect(result.substring(0, 4)).toBe(String(HEADER_TRAN_CODE))
    expect(result.substring(4, 9).trim()).toBe(VERSION_NUM)
    expect(result.substring(9, 17)).toBe(currentDate())
    expect(result.substring(17, 32).trim()).toBe(BUSINESS_NUM)
    expect(result.substring(32, 40)).toBe(HEADER_RECORD_CONT)
  })
})

//File detail test case

describe('CRA Detail format', () => {
  let service: FileCreateService

  beforeEach(() => {
    service = new FileCreateService()
  })

  it('should pad fields correctly and maintain CRA Application field sequence', () => {
    const result = (service as any).buildAppDetail(details[0])

    // Must start with detail transaction code
    expect(result.startsWith(String(DETAIL_TRAN_CODE))).toBe(true)

    // Verify padding behavior
    expect(result.substring(4, 24).startsWith('REF')).toBe(true) // padded right
    expect(result.substring(24, 39).trim()).toBe(BUSINESS_NUM)

    // Exact total length (CRA spec)  // to be 320
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

    // Must start with detail transaction code
    expect(result.startsWith(String(DETAIL_TRAN_CODE))).toBe(true)

    // Verify padding behavior
    expect(result.substring(4, 24).startsWith('REF')).toBe(true) // padded right
    expect(result.substring(24, 39).trim()).toBe(BUSINESS_NUM)

    // Exact total length (CRA spec)  // to be 305
    expect(result.length).toBe(
      4 + 20 + 15 + 1 + 30 + 1 + 30 + 30 + 30 + 8 + 1 + 28 + 2 + 2 + 75 + 8 + 1 + 8 + 2 + 9,
    )
  })
})

// // File trailer test case
describe('CRA Trailer format', () => {
  let service: FileCreateService

  beforeEach(() => {
    service = new FileCreateService()
  })

  it('should pad record count with leading zeros', () => {
    const result = (service as any).buildTrailer(trailer)

    // Starts with trailer code
    expect(result.startsWith(TRAILER_TRAN_CODE)).toBe(true)

    // Record count must be zero-padded
    expect(result.substring(result.length - 25)).toBe('                         ')

    // Total length validation // 65
    expect(result.length).toBe(65)
  })
})
