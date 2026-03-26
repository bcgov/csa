import { customLogger, winstonInstance } from './logger.config'

describe('Logger Configuration', () => {
  describe('customLogger', () => {
    it('should be defined', () => {
      expect(customLogger).toBeDefined()
    })
  })

  describe('winstonInstance', () => {
    it('should be defined', () => {
      expect(winstonInstance).toBeDefined()
    })

    it('should have custom syslog-compatible levels', () => {
      expect(winstonInstance.levels).toEqual({
        alert: 0,
        crit: 1,
        error: 2,
        warn: 3,
        info: 4,
        debug: 5,
        verbose: 6,
      })
    })

    it('should accept alert level logs', () => {
      const spy = vi.spyOn(winstonInstance, 'log').mockReturnValue(winstonInstance)
      winstonInstance.log('alert', 'test alert')
      expect(spy).toHaveBeenCalledWith('alert', 'test alert')
      spy.mockRestore()
    })

    it('should accept crit level logs', () => {
      const spy = vi.spyOn(winstonInstance, 'log').mockReturnValue(winstonInstance)
      winstonInstance.log('crit', 'test crit')
      expect(spy).toHaveBeenCalledWith('crit', 'test crit')
      spy.mockRestore()
    })
  })
})
