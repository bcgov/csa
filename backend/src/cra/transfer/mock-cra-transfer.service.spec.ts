import * as fs from 'fs'
import * as fsp from 'fs/promises'
import { MockCraTransferService } from './mock-cra-transfer.service'

vi.mock('fs')
vi.mock('fs/promises')

describe('MockCraTransferService', () => {
  const basePath = '/tmp/mock-cra'
  let service: MockCraTransferService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new MockCraTransferService(basePath)
  })

  describe('sendFile', () => {
    it('should write file to outbound directory', async () => {
      vi.mocked(fsp.mkdir).mockResolvedValue(undefined)
      vi.mocked(fsp.writeFile).mockResolvedValue(undefined)

      const result = await service.sendFile('test.dat', Buffer.from('file content'))

      expect(fsp.mkdir).toHaveBeenCalledWith('/tmp/mock-cra/outbound', { recursive: true })
      expect(fsp.writeFile).toHaveBeenCalledWith(
        '/tmp/mock-cra/outbound/test.dat',
        Buffer.from('file content'),
      )
      expect(result).toEqual({ success: true, fileName: 'test.dat' })
    })

    it('should throw when write fails', async () => {
      vi.mocked(fsp.mkdir).mockResolvedValue(undefined)
      vi.mocked(fsp.writeFile).mockRejectedValue(new Error('disk full'))

      await expect(service.sendFile('test.dat', Buffer.from('data'))).rejects.toThrow('disk full')
    })
  })

  describe('listInboundFiles', () => {
    it('should return file info for files in inbound directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fsp.readdir).mockResolvedValue([
        { name: 'response1.dat', isDirectory: () => false },
        { name: 'response2.dat', isDirectory: () => false },
      ] as any)
      vi.mocked(fsp.stat).mockResolvedValue({ size: 1024, mtime: new Date('2026-01-15') } as any)

      const result = await service.listInboundFiles()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        fileName: 'response1.dat',
        size: 1024,
        lastModifiedAt: new Date('2026-01-15'),
      })
    })

    it('should filter out directories', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fsp.readdir).mockResolvedValue([
        { name: 'response1.dat', isDirectory: () => false },
        { name: 'PROCESSED', isDirectory: () => true },
      ] as any)
      vi.mocked(fsp.stat).mockResolvedValue({ size: 512, mtime: new Date('2026-01-15') } as any)

      const result = await service.listInboundFiles()

      expect(result).toHaveLength(1)
      expect(result[0].fileName).toBe('response1.dat')
    })

    it('should return empty array when inbound directory does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await service.listInboundFiles()

      expect(result).toEqual([])
    })
  })

  describe('downloadInboundFile', () => {
    it('should read file from inbound directory', async () => {
      const fileContent = Buffer.from('response data')
      vi.mocked(fsp.readFile).mockResolvedValue(fileContent)

      const result = await service.downloadInboundFile('response1.dat')

      expect(fsp.readFile).toHaveBeenCalledWith('/tmp/mock-cra/inbound/response1.dat')
      expect(result).toEqual(fileContent)
    })

    it('should throw when file does not exist', async () => {
      vi.mocked(fsp.readFile).mockRejectedValue(new Error('ENOENT: no such file'))

      await expect(service.downloadInboundFile('missing.dat')).rejects.toThrow('ENOENT')
    })
  })

})
