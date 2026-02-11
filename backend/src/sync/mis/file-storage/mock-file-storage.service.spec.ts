import { Test, TestingModule } from '@nestjs/testing'
import { MockFileStorageService } from './mock-file-storage.service'
import { Readable } from 'stream'
import { text } from 'stream/consumers'
import * as fs from 'fs'

vi.mock('fs')

describe('MockFileStorageService', () => {
  let service: MockFileStorageService

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [MockFileStorageService],
    }).compile()

    service = module.get<MockFileStorageService>(MockFileStorageService)
  })

  describe('download', () => {
    it('should return a readable stream from mock file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.createReadStream).mockReturnValue(
        // Simulate a readable stream with mock data
        new Readable({
          read() {
            this.push('header\nrow1\nrow2')
            this.push(null)
          },
        }),
      )

      const stream = await service.download('csas3/test.csv')
      const content = await text(stream)

      expect(content).toBe('header\nrow1\nrow2')
      expect(fs.existsSync).toHaveBeenCalled()
      expect(fs.createReadStream).toHaveBeenCalled()
    })

    it('should throw when mock file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await expect(service.download('csas3/nonexistent.csv')).rejects.toThrow('Mock file not found')
    })
  })

  describe('isStale', () => {
    it('should always return false', async () => {
      const result = await service.isStale('any-key')
      expect(result).toBe(false)
    })
  })

  describe('getFileInfo', () => {
    it('should return current date as lastModified', async () => {
      const before = Date.now()
      const info = await service.getFileInfo('test.csv')
      const after = Date.now()

      expect(info.key).toBe('test.csv')
      expect(info.lastModified.getTime()).toBeGreaterThanOrEqual(before)
      expect(info.lastModified.getTime()).toBeLessThanOrEqual(after)
    })
  })
})
