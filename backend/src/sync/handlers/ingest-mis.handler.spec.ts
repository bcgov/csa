import { Test, TestingModule } from '@nestjs/testing'
import { IngestMisHandler } from './ingest-mis.handler'
import { MisService } from '../mis/mis.service'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'

const mockContext: JobContext = {
  jobRunId: 2,
  jobType: JobType.INGEST_MIS,
  jobTrigger: JobTrigger.CRON,
  retryCount: 0,
}

describe('IngestMisHandler', () => {
  let handler: IngestMisHandler
  let mockMisService: { ingestAll: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockMisService = {
      ingestAll: vi.fn().mockResolvedValue([
        { name: 'payments', rows: 100 },
        { name: 'contracts', rows: 50 },
        { name: 'placements', rows: 75 },
      ]),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [IngestMisHandler, { provide: MisService, useValue: mockMisService }],
    }).compile()

    handler = module.get<IngestMisHandler>(IngestMisHandler)
  })

  it('should have jobType INGEST_MIS', () => {
    expect(handler.jobType).toBe(JobType.INGEST_MIS)
  })

  describe('execute', () => {
    it('should delegate to MisService', async () => {
      const result = await handler.execute(mockContext)

      expect(mockMisService.ingestAll).toHaveBeenCalledTimes(1)
      expect(result.success).toBe(true)
    })

    it('should aggregate total rows from all files', async () => {
      const result = await handler.execute(mockContext)

      expect(result.metadata?.totalRows).toBe(225)
      expect(result.message).toContain('225 rows')
      expect(result.message).toContain('3 files')
    })

    it('should propagate errors from MisService', async () => {
      mockMisService.ingestAll.mockRejectedValue(new Error('MIS files are stale: payments'))

      await expect(handler.execute(mockContext)).rejects.toThrow('MIS files are stale')
    })
  })
})
