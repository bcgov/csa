import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobRegistry } from 'src/jobs/job-registry.service'
import { JobsModule } from 'src/jobs/jobs.module'
import { IngestDataHandler } from './handlers/ingest-data.handler'
import { IngestIcmHandler } from './handlers/ingest-icm.handler'
import { IngestMisHandler } from './handlers/ingest-mis.handler'
import { RunEligibilityHandler } from './handlers/run-eligibility.handler'
import { SyncIcmHandler } from './handlers/sync-icm.handler'
import { SyncModule } from './sync.module'

describe('SyncModule', () => {
  let module: TestingModule
  let registry: JobRegistry

  beforeEach(async () => {
    process.env.USE_MOCK_DATA = 'true'
    process.env.ICM_API_URL = 'http://test-icm'
    process.env.ICM_TRUSTED_USERNAME = 'test-user'
    process.env.KEYCLOAK_TOKEN_URL = 'http://test-keycloak/token'
    process.env.KEYCLOAK_CLIENT_ID = 'test-client'
    process.env.KEYCLOAK_CLIENT_SECRET = 'test-secret'

    module = await Test.createTestingModule({
      imports: [JobsModule, SyncModule],
    }).compile()

    registry = module.get<JobRegistry>(JobRegistry)
    await module.init() // Trigger onModuleInit
  })

  afterEach(async () => {
    await module.close()
  })

  it('should be defined', () => {
    const syncModule = module.get(SyncModule)
    expect(syncModule).toBeDefined()
  })

  it('should register all 5 sync handlers', () => {
    expect(registry.hasHandler(JobType.INGEST_DATA)).toBe(true)
    expect(registry.hasHandler(JobType.INGEST_ICM)).toBe(true)
    expect(registry.hasHandler(JobType.INGEST_MIS)).toBe(true)
    expect(registry.hasHandler(JobType.RUN_ELIGIBILITY)).toBe(true)
    expect(registry.hasHandler(JobType.SYNC_ICM)).toBe(true)
  })

  it('should register handlers with correct types', () => {
    const ingestDataHandler = registry.getHandler(JobType.INGEST_DATA)
    const ingestIcmHandler = registry.getHandler(JobType.INGEST_ICM)
    const ingestMisHandler = registry.getHandler(JobType.INGEST_MIS)
    const eligibilityHandler = registry.getHandler(JobType.RUN_ELIGIBILITY)
    const syncIcmHandler = registry.getHandler(JobType.SYNC_ICM)

    expect(ingestDataHandler).toBeInstanceOf(IngestDataHandler)
    expect(ingestIcmHandler).toBeInstanceOf(IngestIcmHandler)
    expect(ingestMisHandler).toBeInstanceOf(IngestMisHandler)
    expect(eligibilityHandler).toBeInstanceOf(RunEligibilityHandler)
    expect(syncIcmHandler).toBeInstanceOf(SyncIcmHandler)
  })

  it('should export all handler providers', () => {
    expect(module.get(IngestDataHandler)).toBeDefined()
    expect(module.get(IngestIcmHandler)).toBeDefined()
    expect(module.get(IngestMisHandler)).toBeDefined()
    expect(module.get(RunEligibilityHandler)).toBeDefined()
    expect(module.get(SyncIcmHandler)).toBeDefined()
  })
})
