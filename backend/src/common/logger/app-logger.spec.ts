import { winstonInstance } from './logger.config'
import { AppLogger } from './app-logger'

describe('AppLogger', () => {
  let logger: AppLogger
  let spy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logger = new AppLogger('TestService')
    spy = vi.spyOn(winstonInstance, 'log').mockReturnValue(winstonInstance)
  })

  afterEach(() => {
    spy.mockRestore()
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
})
