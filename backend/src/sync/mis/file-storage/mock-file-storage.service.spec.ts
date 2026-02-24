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

  describe('exists', () => {
    it('should return true when mock file exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const result = await service.exists('csas3/test.csv')

      expect(result).toBe(true)
    })

    it('should return false when mock file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await service.exists('csas3/nonexistent.csv')

      expect(result).toBe(false)
    })
  })

  describe('move', () => {
    it('should be a no-op', async () => {
      await expect(service.move('from', 'to')).resolves.toBeUndefined()
    })
  })
})
