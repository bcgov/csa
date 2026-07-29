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

  describe('warn() monitoring dual-write', () => {
    it('should persist a job activity when activityType is provided', async () => {
      await runWithJobExecutionScope(12, async () => {
        logger.warn('Manual add to batch: 2 contacts skipped (batch 5)', {
          activityType: JobActivityType.BATCH,
          related: '2 contacts skipped during add (batch 5)',
        })
      })

      expect(recordActivity).toHaveBeenCalledWith({
        jobRunId: 12,
        severity: JobActivitySeverity.WARNING,
        activityType: JobActivityType.BATCH,
        related: '2 contacts skipped during add (batch 5)',
      })
    })

    it('should not persist when warn is untagged', async () => {
      await runWithJobExecutionScope(12, async () => {
        logger.warn('Job already running, skipping')
      })

      expect(recordActivity).not.toHaveBeenCalled()
    })
  })

  describe('error() monitoring dual-write', () => {
    it('should persist a job activity when activityType is provided', async () => {
      await runWithJobExecutionScope(7, async () => {
        logger.error('Manual remove from batch failed for contact 3', {
          activityType: JobActivityType.BATCH,
          related: 'Manual remove from batch contact 3: invalid_transition',
        })
      })

      expect(recordActivity).toHaveBeenCalledWith({
        jobRunId: 7,
        severity: JobActivitySeverity.ERROR,
        activityType: JobActivityType.BATCH,
        related: 'Manual remove from batch contact 3: invalid_transition',
      })
    })
  })

  describe('crit() monitoring dual-write', () => {
    it('should not persist when crit is untagged', async () => {
      await runWithJobExecutionScope(5, async () => {
        logger.crit('Job failed after all retries')
      })

      expect(recordActivity).not.toHaveBeenCalled()
    })

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
