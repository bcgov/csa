import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobRegistry } from 'src/jobs/job-registry.service'
import { JobsModule } from 'src/jobs/jobs.module'
import { SyncIcmHandler } from 'src/sync/handlers/sync-icm.handler'
import { CraModule } from './cra.module'
import { PollCraResponseHandler } from './handlers/poll-cra-response.handler'
import { SendCraFileHandler } from './handlers/send-cra-file.handler'

describe('CraModule', () => {
  let module: TestingModule
  let registry: JobRegistry

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [JobsModule, CraModule],
    }).compile()

    registry = module.get<JobRegistry>(JobRegistry)
    await module.init() // Trigger onModuleInit
  })

  afterEach(async () => {
    await module.close()
  })

  it('should be defined', () => {
    const craModule = module.get(CraModule)
    expect(craModule).toBeDefined()
  })

  it('should register all CRA handlers including SYNC_ICM', () => {
    expect(registry.hasHandler(JobType.SEND_CRA_FILE)).toBe(true)
    expect(registry.hasHandler(JobType.POLL_CRA_RESPONSE)).toBe(true)
    expect(registry.hasHandler(JobType.SYNC_ICM)).toBe(true)
  })

  it('should register handlers with correct types', () => {
    const sendHandler = registry.getHandler(JobType.SEND_CRA_FILE)
    const pollHandler = registry.getHandler(JobType.POLL_CRA_RESPONSE)
    const syncHandler = registry.getHandler(JobType.SYNC_ICM)

    expect(sendHandler).toBeInstanceOf(SendCraFileHandler)
    expect(pollHandler).toBeInstanceOf(PollCraResponseHandler)
    expect(syncHandler).toBeInstanceOf(SyncIcmHandler)
  })

  it('should export all handler providers', () => {
    expect(module.get(SendCraFileHandler)).toBeDefined()
    expect(module.get(PollCraResponseHandler)).toBeDefined()
  })
})
