import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { Readable } from 'stream'
import { S3CraTransferService } from './s3-cra-transfer.service'

const mockPutObject = vi.fn()
const mockGetObject = vi.fn()
const mockListObjectsV2 = vi.fn()

vi.mock('minio', () => {
  return {
    Client: class MockClient {
      putObject = mockPutObject
      getObject = mockGetObject
      listObjectsV2 = mockListObjectsV2
    },
  }
})

describe('S3CraTransferService', () => {
  const PREFIX = 'NONPROD/CRA/DEV'
  let service: S3CraTransferService

  beforeEach(async () => {
    vi.clearAllMocks()

    const configService = {
      get: vi.fn((key: string) => {
        const values: Record<string, unknown> = {
          'sync.s3Uri': 'http://minioadmin:minioadmin@localhost:9000',
          'sync.s3Bucket': 'test-bucket',
          'cra.s3Prefix': PREFIX,
        }
        return values[key]
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [S3CraTransferService, { provide: ConfigService, useValue: configService }],
    }).compile()

    service = module.get<S3CraTransferService>(S3CraTransferService)
  })

  describe('sendFile', () => {
    it('should upload file to OUTBOUND prefix and return success', async () => {
      mockPutObject.mockResolvedValue({ etag: 'abc123' })

      const result = await service.sendFile('ACSAIN.20260311.dat', Buffer.from('file data'))

      expect(mockPutObject).toHaveBeenCalledWith(
        'test-bucket',
        `${PREFIX}/OUTBOUND/ACSAIN.20260311.dat`,
        Buffer.from('file data'),
      )
      expect(result).toEqual({ success: true, fileName: 'ACSAIN.20260311.dat' })
    })

    it('should throw when putObject fails', async () => {
      mockPutObject.mockRejectedValue(new Error('upload failed'))

      await expect(service.sendFile('ACSAIN.20260311.dat', Buffer.from('data'))).rejects.toThrow(
        'upload failed',
      )
    })
  })

  describe('listInboundFiles', () => {
    function createMockListStream(
      objects: Array<{ name: string; size?: number; lastModified?: Date }>,
    ) {
      const stream = new Readable({ objectMode: true, read() {} })
      for (const obj of objects) {
        stream.push(obj)
      }
      stream.push(null)
      return stream
    }

    it('should list inbound files with prefix stripped', async () => {
      const mockDate = new Date('2026-03-10')
      mockListObjectsV2.mockReturnValue(
        createMockListStream([
          { name: `${PREFIX}/INBOUND/response1.dat`, size: 1024, lastModified: mockDate },
          { name: `${PREFIX}/INBOUND/response2.dat`, size: 2048, lastModified: mockDate },
        ]),
      )

      const result = await service.listInboundFiles()

      expect(mockListObjectsV2).toHaveBeenCalledWith('test-bucket', `${PREFIX}/INBOUND/`, true)
      expect(result).toEqual([
        { fileName: 'response1.dat', size: 1024, lastModifiedAt: mockDate },
        { fileName: 'response2.dat', size: 2048, lastModifiedAt: mockDate },
      ])
    })

    it('should return empty array when no objects exist', async () => {
      mockListObjectsV2.mockReturnValue(createMockListStream([]))

      const result = await service.listInboundFiles()

      expect(result).toEqual([])
    })

    it('should reject when the stream emits an error', async () => {
      const stream = new Readable({
        objectMode: true,
        read() {
          process.nextTick(() => this.destroy(new Error('network error')))
        },
      })
      mockListObjectsV2.mockReturnValue(stream)

      await expect(service.listInboundFiles()).rejects.toThrow('network error')
    })
  })

  describe('downloadInboundFile', () => {
    it('should download and return file contents as a Buffer', async () => {
      const stream = new Readable({
        read() {
          this.push(Buffer.from('chunk1'))
          this.push(Buffer.from('chunk2'))
          this.push(null)
        },
      })
      mockGetObject.mockResolvedValue(stream)

      const result = await service.downloadInboundFile('response1.dat')

      expect(mockGetObject).toHaveBeenCalledWith('test-bucket', `${PREFIX}/INBOUND/response1.dat`)
      expect(result).toEqual(Buffer.concat([Buffer.from('chunk1'), Buffer.from('chunk2')]))
    })

    it('should reject when getObject throws', async () => {
      mockGetObject.mockRejectedValue(new Error('Not Found'))

      await expect(service.downloadInboundFile('missing.dat')).rejects.toThrow('Not Found')
    })

    it('should reject when stream emits an error', async () => {
      const stream = new Readable({
        read() {
          this.destroy(new Error('stream error'))
        },
      })
      mockGetObject.mockResolvedValue(stream)

      await expect(service.downloadInboundFile('bad.dat')).rejects.toThrow('stream error')
    })
  })

})
