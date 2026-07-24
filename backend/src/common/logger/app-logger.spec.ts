import { winstonInstance } from './logger.config'
import { AppLogger } from './app-logger'
import { JobActivityType } from 'src/jobs/enums/job-activity-type.enum'
import { JobActivitySeverity } from 'src/jobs/enums/job-activity-severity.enum'
import {
  registerJobActivityRecorder,
  resetJobActivityRecorder,
  runWithJobExecutionScope,
} from 'src/jobs/job-monitoring-log'

describe('AppLogger', () => {
  let logger: AppLogger
  let spy: ReturnType<typeof vi.spyOn>
  const recordActivity = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    logger = new AppLogger('TestService')
    spy = vi.spyOn(winstonInstance, 'log').mockReturnValue(winstonInstance)
    recordActivity.mockClear()
    registerJobActivityRecorder(recordActivity)
  })

  afterEach(() => {
    spy.mockRestore()
    resetJobActivityRecorder()
  })

  describe('alert()', () => {
    it('should log at alert level with context', () => {
      logger.alert('System is down')
      expect(spy).toHaveBeenCalledWith('alert', 'System is down', {
        context: 'TestService',
      })
    })

    it('should include metadata when provided', () => {
      logger.alert('DB connection lost', { host: 'db-primary' })
      expect(spy).toHaveBeenCalledWith('alert', 'DB connection lost', {
        context: 'TestService',
        host: 'db-primary',
      })
    })
  })

  describe('crit()', () => {
    it('should log at crit level with context', () => {
      logger.crit('Job failed after all retries')
      expect(spy).toHaveBeenCalledWith('crit', 'Job failed after all retries', {
        context: 'TestService',
      })
    })

    it('should include metadata when provided', () => {
      logger.crit('Job failed', { jobRunId: 42, jobType: 'INGEST_ICM' })
      expect(spy).toHaveBeenCalledWith('crit', 'Job failed', {
        context: 'TestService',
        jobRunId: 42,
        jobType: 'INGEST_ICM',
      })
    })
  })

  describe('activityWarn()', () => {
    it('should log to Winston and persist a job activity when scope is active', async () => {
      await runWithJobExecutionScope(99, async () => {
        logger.activityWarn('ICM sync-back failed: timeout', {
          activityType: JobActivityType.ICM,
          related: 'ICM sync-back failed: timeout',
        })
      })

      expect(recordActivity).toHaveBeenCalledWith({
        jobRunId: 99,
        severity: JobActivitySeverity.WARNING,
        activityType: JobActivityType.ICM,
        related: 'ICM sync-back failed: timeout',
      })
    })
  })

  describe('crit() monitoring dual-write', () => {
    it('should aggregate DATA_QUALITY crit logs tagged by category', async () => {
      await runWithJobExecutionScope(5, async () => {
        logger.crit('Skipping contact: empty/null in required fields [dob]', {
          category: 'DATA_QUALITY',
        })
      })

      expect(recordActivity).toHaveBeenCalledWith({
        jobRunId: 5,
        severity: JobActivitySeverity.CRITICAL,
        activityType: JobActivityType.DATA_QUALITY,
        related: 'Skipping contact: empty/null in required fields [dob]',
      })
    })
  })
})
