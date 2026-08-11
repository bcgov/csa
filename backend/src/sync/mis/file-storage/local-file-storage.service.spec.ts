import { Readable } from 'stream'
import { text } from 'stream/consumers'
import * as fs from 'fs'
import { LocalFileStorageService } from './local-file-storage.service'

vi.mock('fs')

describe('LocalFileStorageService', () => {
  let service: LocalFileStorageService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new LocalFileStorageService('/storage/mis')
  })

  describe('download', () => {
    it('should return a readable stream from local file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.createReadStream).mockReturnValue(
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

    it('should throw when local file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await expect(service.download('csas3/nonexistent.csv')).rejects.toThrow('MIS file not found')
    })
  })

  describe('exists', () => {
    it('should return true when local file exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const result = await service.exists('csas3/test.csv')

      expect(result).toBe(true)
    })

    it('should return false when local file does not exist', async () => {
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
