import { JobType } from 'src/jobs/enums/job-type.enum'
import type { OpenshiftJobLauncher } from 'src/jobs/openshift-job-launcher.service'
import {
  JOB_STUCK_THRESHOLD_MINUTES,
  buildOpenshiftUserWarning,
  buildStuckRecoverySuffix,
  clearOpenshiftStatusCacheForTests,
  getJobRunWarning,
  minutesUntilStuckMark,
} from './job-openshift-advisory'

describe('job-openshift-advisory', () => {
  const createdAt = new Date('2026-06-01T12:00:00Z')

  afterEach(() => {
    clearOpenshiftStatusCacheForTests()
  })

  describe('minutesUntilStuckMark', () => {
    it('should use createdAt and 40 minute threshold', () => {
      const tenMinutesLater = createdAt.getTime() + 10 * 60 * 1000
      expect(minutesUntilStuckMark(createdAt, tenMinutesLater)).toBe(30)
    })

    it('should return 0 when past threshold', () => {
      const pastThreshold = createdAt.getTime() + JOB_STUCK_THRESHOLD_MINUTES * 60 * 1000 + 1
      expect(minutesUntilStuckMark(createdAt, pastThreshold)).toBe(0)
    })
  })

  describe('buildStuckRecoverySuffix', () => {
    it('should describe minutes remaining from createdAt', () => {
      const tenMinutesLater = createdAt.getTime() + 10 * 60 * 1000
      expect(buildStuckRecoverySuffix(createdAt, tenMinutesLater)).toContain('30 minutes')
    })

    it('should use routine cleanup wording when past threshold', () => {
      const pastThreshold = createdAt.getTime() + JOB_STUCK_THRESHOLD_MINUTES * 60 * 1000
      expect(buildStuckRecoverySuffix(createdAt, pastThreshold)).toContain('routine cleanup')
    })
  })

  describe('buildOpenshiftUserWarning', () => {
    it('should return a plain-language message for NOT_FOUND', () => {
      const warning = buildOpenshiftUserWarning('NOT_FOUND', createdAt, createdAt.getTime())
      expect(warning).toContain('does not appear to be running')
      expect(warning).toContain('administrator')
      expect(warning).not.toContain('OpenShift')
    })

    it('should return undefined for ACTIVE', () => {
      expect(buildOpenshiftUserWarning('ACTIVE', createdAt)).toBeUndefined()
    })
  })

  describe('getJobRunWarning', () => {
    const launcher = {
      isEnabled: vi.fn().mockReturnValue(true),
      hasCronJobMapping: vi.fn().mockReturnValue(true),
      getJobStatus: vi.fn(),
    } as unknown as OpenshiftJobLauncher

    beforeEach(() => {
      vi.mocked(launcher.isEnabled).mockReturnValue(true)
      vi.mocked(launcher.hasCronJobMapping).mockReturnValue(true)
      vi.mocked(launcher.getJobStatus).mockReset()
    })

    const runningJob = {
      id: 7,
      jobType: JobType.RUN_ELIGIBILITY,
      status: 'RUNNING',
      createdAt: new Date('2026-06-01T12:00:00Z'),
    }

    it('should not call OpenShift during grace period after createdAt', async () => {
      const twoMinutesLater = runningJob.createdAt.getTime() + 60 * 1000
      const warning = await getJobRunWarning(runningJob, launcher, twoMinutesLater)
      expect(warning).toBeUndefined()
      expect(launcher.getJobStatus).not.toHaveBeenCalled()
    })

    it('should return warning when OpenShift reports NOT_FOUND after grace', async () => {
      vi.mocked(launcher.getJobStatus).mockResolvedValue({
        state: 'NOT_FOUND',
        message: 'technical detail',
      })
      const tenMinutesLater = runningJob.createdAt.getTime() + 10 * 60 * 1000

      const warning = await getJobRunWarning(runningJob, launcher, tenMinutesLater)

      expect(warning).toContain('does not appear to be running')
      expect(warning).toContain('30 minutes')
      expect(launcher.getJobStatus).toHaveBeenCalledWith(JobType.RUN_ELIGIBILITY, 7)
    })

    it('should skip when OpenShift launcher is disabled', async () => {
      vi.mocked(launcher.isEnabled).mockReturnValue(false)
      const warning = await getJobRunWarning(
        runningJob,
        launcher,
        runningJob.createdAt.getTime() + 10 * 60 * 1000,
      )
      expect(warning).toBeUndefined()
    })
  })
})
