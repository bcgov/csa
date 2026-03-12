import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { of } from 'rxjs'
import { HttpCraTransferService } from './http-cra-transfer.service'

describe('HttpCraTransferService', () => {
  let service: HttpCraTransferService
  let httpService: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }
  let configService: { get: ReturnType<typeof vi.fn> }

  const baseUrl = 'http://file-transfer:3000'

  function createService(craEnabled = true) {
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'app.fileTransferServiceUrl') return baseUrl
        if (key === 'cra.enabled') return craEnabled
        return undefined
      }),
    }
    httpService = { get: vi.fn(), post: vi.fn() }
    return new HttpCraTransferService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    service = createService(true)
  })

  describe('sendFile', () => {
    it('should POST file via FormData when CRA is enabled', async () => {
      httpService.post.mockReturnValue(of({ data: { success: true, fileName: 'test.dat' } }))

      const result = await service.sendFile('test.dat', Buffer.from('file content'))

      expect(result).toEqual({ success: true, fileName: 'test.dat' })
      expect(httpService.post).toHaveBeenCalledTimes(1)

      const [url, body, options] = httpService.post.mock.calls[0]
      expect(url).toBe(`${baseUrl}/api/destinations/cra/transfers`)
      expect(options.headers).toBeDefined()
      expect(body).toBeDefined()
    })

    it('should skip HTTP call and return success when CRA is disabled', async () => {
      service = createService(false)

      const result = await service.sendFile('test.dat', Buffer.from('file content'))

      expect(result).toEqual({ success: true, fileName: 'test.dat' })
      expect(httpService.post).not.toHaveBeenCalled()
    })
  })

  describe('listInboundFiles', () => {
    it('should return files from the file transfer service', async () => {
      const remoteFiles = [
        { fileName: 'response1.dat', size: 1024, lastModifiedAt: '2026-01-15T00:00:00Z' },
        { fileName: 'response2.dat', size: 2048 },
      ]
      httpService.get.mockReturnValue(of({ data: { files: remoteFiles } }))

      const result = await service.listInboundFiles()

      expect(result).toEqual(remoteFiles)
      expect(httpService.get).toHaveBeenCalledWith(
        `${baseUrl}/api/destinations/cra/transfers/inbound`,
        { headers: { 'Content-Type': 'application/json' } },
      )
    })

    it('should return empty array when response has no files', async () => {
      httpService.get.mockReturnValue(of({ data: {} }))

      const result = await service.listInboundFiles()

      expect(result).toEqual([])
    })

    it('should return empty array when CRA is disabled', async () => {
      service = createService(false)

      const result = await service.listInboundFiles()

      expect(result).toEqual([])
      expect(httpService.get).not.toHaveBeenCalled()
    })
  })

  describe('downloadInboundFile', () => {
    it('should download file as buffer', async () => {
      const fileContent = Buffer.from('response data')
      httpService.get.mockReturnValue(of({ data: fileContent }))

      const result = await service.downloadInboundFile('response1.dat')

      expect(result).toEqual(fileContent)
      expect(httpService.get).toHaveBeenCalledWith(
        `${baseUrl}/api/destinations/cra/transfers/response1.dat`,
        { headers: { 'Content-Type': 'text/plain' }, responseType: 'arraybuffer' },
      )
    })

    it('should convert non-Buffer response data to Buffer', async () => {
      const arrayData = new Uint8Array([72, 101, 108, 108, 111])
      httpService.get.mockReturnValue(of({ data: arrayData }))

      const result = await service.downloadInboundFile('response1.dat')

      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result.toString()).toBe('Hello')
    })
  })

})
