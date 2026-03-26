import { Logger } from '@nestjs/common'
import { winstonInstance } from './logger.config'

export class AppLogger extends Logger {
  alert(message: string, metadata?: Record<string, unknown>): void {
    winstonInstance.log('alert', message, { context: this.context, ...metadata })
  }

  crit(message: string, metadata?: Record<string, unknown>): void {
    winstonInstance.log('crit', message, { context: this.context, ...metadata })
  }
}
