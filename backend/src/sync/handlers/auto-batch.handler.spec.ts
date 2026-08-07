import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { AutoBatchHandler } from './auto-batch.handler'
import { AutoBatchService } from '../eligibility/auto-batch.service'
import { IcmSyncBackService } from '../icm/icm-sync-back.service'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'

const mockContext: JobContext = {
  jobRunId: 1,
  jobType: JobType.AUTO_BATCH,
  jobTrigger: JobTrigger.CRON,
  retryCount: 0,
}

describe('AutoBatchHandler', () => {
  let handler: AutoBatchHandler
  let mockAutoBatchService: { run: ReturnType<typeof vi.fn> }
  let mockSyncBackService: { syncFlaggedWithRetry: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockAutoBatchService = {
      run: vi
        .fn()
        .mockResolvedValue({ application: 5, cancellation: 2, onHold: 0, incomplete: [] }),
    }
    mockSyncBackService = {
      syncFlaggedWithRetry: vi
        .fn()
        .mockResolvedValue({ totalFlagged: 7, synced: 7, failed: 0, chunks: 1 }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoBatchHandler,
        { provide: AutoBatchService, useValue: mockAutoBatchService },
        { provide: IcmSyncBackService, useValue: mockSyncBackService },
      ],
    }).compile()

    handler = module.get<AutoBatchHandler>(AutoBatchHandler)
  })

  it('should have jobType AUTO_BATCH', () => {
    expect(handler.jobType).toBe(JobType.AUTO_BATCH)
  })

  it('should delegate to AutoBatchService, run sync-back, and return counts', async () => {
    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(result.message).toBe('Auto-batch complete: 5 application, 2 cancellation')
    expect(mockAutoBatchService.run).toHaveBeenCalledOnce()
    expect(mockSyncBackService.syncFlaggedWithRetry).toHaveBeenCalledOnce()
  })

  it('should return zero counts when nothing to batch and skip sync-back', async () => {
    mockAutoBatchService.run.mockResolvedValue({
      application: 0,
      cancellation: 0,
      onHold: 0,
      incomplete: [],
    })

    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(result.message).toBe('Auto-batch complete: No eligible contacts found to batch')
    expect(mockSyncBackService.syncFlaggedWithRetry).not.toHaveBeenCalled()
  })

  it('should run sync-back when only one side has contacts', async () => {
    mockAutoBatchService.run.mockResolvedValue({
      application: 5,
      cancellation: 0,
      onHold: 0,
      incomplete: [],
    })

    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(result.message).toContain('5 application')
    expect(mockSyncBackService.syncFlaggedWithRetry).toHaveBeenCalledOnce()
  })

  it('should skip sync-back when only incomplete records were auto-held', async () => {
    mockAutoBatchService.run.mockResolvedValue({
      application: 0,
      cancellation: 0,
      onHold: 2,
      incomplete: [{ id: 11, missingFields: ['First Name'] }],
    })

    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(result.message).toContain('2 contacts auto-held due to missing CRA mandatory fields')
    expect(mockSyncBackService.syncFlaggedWithRetry).not.toHaveBeenCalled()
  })

  it('should succeed even if sync-back throws', async () => {
    mockSyncBackService.syncFlaggedWithRetry.mockRejectedValue(new Error('ICM API down'))

    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(mockAutoBatchService.run).toHaveBeenCalledOnce()
  })
})
