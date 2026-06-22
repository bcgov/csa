import { Test, TestingModule } from '@nestjs/testing'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { BackfillOocAgreementLinesHandler } from './backfill-ooc-agreement-lines.handler'
import { IcmService } from '../icm/icm.service'

const mockContext: JobContext = {
  jobRunId: 1,
  jobType: JobType.BACKFILL_OOC_AGREEMENT_LINES,
  jobTrigger: JobTrigger.END_USER,
  retryCount: 0,
}

describe('BackfillOocAgreementLinesHandler', () => {
  let handler: BackfillOocAgreementLinesHandler
  let mockIcmService: { ingestResource: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockIcmService = {
      ingestResource: vi.fn().mockResolvedValue({
        name: 'ooc_agreement_lines',
        fetched: 42,
        upserted: 42,
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackfillOocAgreementLinesHandler,
        { provide: IcmService, useValue: mockIcmService },
      ],
    }).compile()

    handler = module.get<BackfillOocAgreementLinesHandler>(BackfillOocAgreementLinesHandler)
  })

  it('should have jobType BACKFILL_OOC_AGREEMENT_LINES', () => {
    expect(handler.jobType).toBe(JobType.BACKFILL_OOC_AGREEMENT_LINES)
  })

  describe('execute', () => {
    it('should full-load ooc_agreement_lines without incremental cursor', async () => {
      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.metadata?.lastUpdated).toBeNull()
      expect(result.message).toContain('42 fetched')

      expect(mockIcmService.ingestResource).toHaveBeenCalledTimes(1)
      expect(mockIcmService.ingestResource).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'ooc_agreement_lines' }),
        undefined,
      )
    })
  })
})
