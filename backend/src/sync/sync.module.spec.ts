import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobRegistry } from 'src/jobs/job-registry.service'
import { JobsModule } from 'src/jobs/jobs.module'
import { AutoBatchHandler } from './handlers/auto-batch.handler'
import { BackfillIcmCaseCloseDatesHandler } from './handlers/backfill-icm-case-close-dates.handler'
import { BackfillOocAgreementLinesHandler } from './handlers/backfill-ooc-agreement-lines.handler'
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
    process.env.ICM_API_USERNAME = 'test-user'
    process.env.ICM_TOKEN_URL = 'http://test-keycloak/token'
    process.env.ICM_CLIENT_ID = 'test-client'
    process.env.ICM_CLIENT_SECRET = 'test-secret'

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

  it('should register all 8 sync handlers', () => {
    expect(registry.hasHandler(JobType.AUTO_BATCH)).toBe(true)
    expect(registry.hasHandler(JobType.BACKFILL_ICM_CASE_CLOSE_DATES)).toBe(true)
    expect(registry.hasHandler(JobType.BACKFILL_OOC_AGREEMENT_LINES)).toBe(true)
    expect(registry.hasHandler(JobType.INGEST_DATA)).toBe(true)
    expect(registry.hasHandler(JobType.INGEST_ICM)).toBe(true)
    expect(registry.hasHandler(JobType.INGEST_MIS)).toBe(true)
    expect(registry.hasHandler(JobType.RUN_ELIGIBILITY)).toBe(true)
    expect(registry.hasHandler(JobType.SYNC_ICM)).toBe(true)
  })

  it('should register handlers with correct types', () => {
    expect(registry.getHandler(JobType.AUTO_BATCH)).toBeInstanceOf(AutoBatchHandler)
    expect(registry.getHandler(JobType.BACKFILL_ICM_CASE_CLOSE_DATES)).toBeInstanceOf(
      BackfillIcmCaseCloseDatesHandler,
    )
    expect(registry.getHandler(JobType.BACKFILL_OOC_AGREEMENT_LINES)).toBeInstanceOf(
      BackfillOocAgreementLinesHandler,
    )
    expect(registry.getHandler(JobType.INGEST_DATA)).toBeInstanceOf(IngestDataHandler)
    expect(registry.getHandler(JobType.INGEST_ICM)).toBeInstanceOf(IngestIcmHandler)
    expect(registry.getHandler(JobType.INGEST_MIS)).toBeInstanceOf(IngestMisHandler)
    expect(registry.getHandler(JobType.RUN_ELIGIBILITY)).toBeInstanceOf(RunEligibilityHandler)
    expect(registry.getHandler(JobType.SYNC_ICM)).toBeInstanceOf(SyncIcmHandler)
  })

  it('should export all handler providers', () => {
    expect(module.get(AutoBatchHandler)).toBeDefined()
    expect(module.get(BackfillIcmCaseCloseDatesHandler)).toBeDefined()
    expect(module.get(BackfillOocAgreementLinesHandler)).toBeDefined()
    expect(module.get(IngestDataHandler)).toBeDefined()
    expect(module.get(IngestIcmHandler)).toBeDefined()
    expect(module.get(IngestMisHandler)).toBeDefined()
    expect(module.get(RunEligibilityHandler)).toBeDefined()
    expect(module.get(SyncIcmHandler)).toBeDefined()
  })
})
