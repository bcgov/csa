import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PollCraResponseHandler } from './poll-cra-response.handler'
import { of } from 'rxjs'
import fs from 'fs'
import * as fsPromises from 'fs/promises'

vi.mock('fs')
vi.mock('fs/promises')

describe('PollCraResponseHandler', () => {
  let handler: PollCraResponseHandler
  let prisma: any
  let httpService: any
  let responseFileService: any
  let stateMachine: any
  let configService: any

  beforeEach(() => {
    prisma = {
      transferFile: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
      },
      contactBatchDetail: {
        findUnique: vi.fn().mockResolvedValue({ status: 'PENDING' }),
        update: vi.fn().mockResolvedValue({
          id: 1,
          batchId: 10,
          contactId: 20,
        }),
      },
      contact: {
        update: vi.fn().mockResolvedValue({}),
      },
      batch: {
        findUnique: vi.fn().mockResolvedValue({ status: 'PENDING' }),
        update: vi.fn().mockResolvedValue({}),
      },
    }

    httpService = {
      get: vi
        .fn()
        // first call: list remote files
        .mockReturnValueOnce(
          of({
            data: {
              files: [{ fileName: 'craUserId.VRSP0001.txt' }],
            },
          }),
        )
        // second call: download file
        .mockReturnValueOnce(
          of({
            data: Buffer.from('dummy-file-content'),
          }),
        ),
    }

    responseFileService = {
      parseFile: vi.fn().mockReturnValue({
        header: {},
        trailer: {},
        details: [
          {
            referenceNum: '1',
            tranStatCd: '1',
            fileStatCd: '01',
          },
        ],
      }),
    }

    stateMachine = {
      getNextState: vi.fn().mockReturnValue('SUCCESS'),
    }

    configService = {
      get: vi.fn((key: string) => {
        if (key === 'app.fileStoragePath') return '/tmp'
        if (key === 'app.fileTransferServiceUrl') return 'http://file-transfer'
      }),
    }
    ;(fs.statSync as any).mockReturnValue({ size: 100 })
    ;(fs.existsSync as any).mockReturnValue(true)
    ;(fsPromises.writeFile as any).mockResolvedValue(undefined)

    handler = new PollCraResponseHandler(
      responseFileService,
      prisma,
      httpService,
      configService,
      stateMachine,
    )
  })

  it('should successfully process CRA response file', async () => {
    const result = await handler.execute({} as any)

    expect(result.success).toBe(true)
    expect(result.metadata.records_updated).toBe(1)

    expect(httpService.get).toHaveBeenCalledTimes(2)
    expect(responseFileService.parseFile).toHaveBeenCalled()

    expect(prisma.contactBatchDetail.update).toHaveBeenCalled()
    expect(prisma.contact.update).toHaveBeenCalled()
    expect(prisma.batch.update).toHaveBeenCalled()
    expect(prisma.transferFile.create).toHaveBeenCalled()

    expect(fsPromises.writeFile).toHaveBeenCalled()
  })
})
