import { Test, TestingModule } from '@nestjs/testing'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { IcmSyncBackService } from '../icm/icm-sync-back.service'
import { SyncIcmHandler } from './sync-icm.handler'

const mockContext: JobContext = {
  jobRunId: 1,
  jobType: JobType.SYNC_ICM,
  jobTrigger: JobTrigger.CRON,
  retryCount: 0,
}

describe('SyncIcmHandler', () => {
  let handler: SyncIcmHandler
  let mockSyncBackService: {
    hasFlaggedContacts: ReturnType<typeof vi.fn>
    syncFlaggedContacts: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    mockSyncBackService = {
      hasFlaggedContacts: vi.fn().mockResolvedValue(true),
      syncFlaggedContacts: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [SyncIcmHandler, { provide: IcmSyncBackService, useValue: mockSyncBackService }],
    }).compile()

    handler = module.get(SyncIcmHandler)
  })

  it('should have jobType SYNC_ICM', () => {
    expect(handler.jobType).toBe(JobType.SYNC_ICM)
  })

  it('should return success when all contacts synced', async () => {
    mockSyncBackService.syncFlaggedContacts.mockResolvedValue({
      totalFlagged: 10,
      synced: 10,
      failed: 0,
      chunks: 1,
    })

    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(result.message).toContain('10 synced')
    expect(result.metadata).toEqual({ totalFlagged: 10, synced: 10, failed: 0, chunks: 1 })
  })

  it('should return success with partial failure', async () => {
    mockSyncBackService.syncFlaggedContacts.mockResolvedValue({
      totalFlagged: 150,
      synced: 100,
      failed: 50,
      chunks: 2,
    })

    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(result.message).toContain('100 synced')
    expect(result.message).toContain('50 failed')
  })

  it('should return failure when all contacts failed', async () => {
    mockSyncBackService.syncFlaggedContacts.mockResolvedValue({
      totalFlagged: 10,
      synced: 0,
      failed: 10,
      chunks: 1,
    })

    const result = await handler.execute(mockContext)

    expect(result.success).toBe(false)
    expect(result.message).toContain('all 10 contacts failed')
  })

  it('should return success without calling syncFlaggedContacts when no contacts flagged', async () => {
    mockSyncBackService.hasFlaggedContacts.mockResolvedValue(false)

    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(result.message).toBe('No contacts flagged for ICM sync')
    expect(mockSyncBackService.syncFlaggedContacts).not.toHaveBeenCalled()
  })
})
