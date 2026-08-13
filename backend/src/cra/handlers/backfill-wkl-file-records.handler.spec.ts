import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { BackfillWklFileRecordsHandler } from './backfill-wkl-file-records.handler'

const mockContext: JobContext = {
  jobRunId: 1,
  jobType: JobType.BACKFILL_WKL_FILE_RECORDS,
  jobTrigger: JobTrigger.END_USER,
  retryCount: 0,
}

describe('BackfillWklFileRecordsHandler', () => {
  let handler: BackfillWklFileRecordsHandler
  let mockBackfillService: any

  beforeEach(() => {
    mockBackfillService = {
      backfillAll: vi.fn().mockResolvedValue({
        filesProcessed: 2,
        filesSkipped: 1,
        recordsUpserted: 40,
        fileResults: [],
      }),
    }

    handler = new BackfillWklFileRecordsHandler(mockBackfillService)
  })

  it('should have jobType BACKFILL_WKL_FILE_RECORDS', () => {
    expect(handler.jobType).toBe(JobType.BACKFILL_WKL_FILE_RECORDS)
  })

  it('runs the backfill service and returns summary metadata', async () => {
    const result = await handler.execute(mockContext)

    expect(mockBackfillService.backfillAll).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      success: true,
      message:
        'WKL file records backfill complete: 2 file(s) processed, 1 skipped, 40 record(s) upserted',
      metadata: {
        filesProcessed: 2,
        filesSkipped: 1,
        recordsUpserted: 40,
        fileResults: [],
      },
    })
  })
})
