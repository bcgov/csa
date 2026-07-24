import { Logger } from '@nestjs/common'
import {
  JobMonitoringLogMeta,
  persistJobMonitoringLog,
} from 'src/jobs/job-monitoring-log'
import { winstonInstance } from './logger.config'

export class AppLogger extends Logger {
  alert(message: string, metadata?: Record<string, unknown>): void {
    winstonInstance.log('alert', message, { context: this.context, ...metadata })
  }

  crit(message: string, metadata?: Record<string, unknown>): void {
    winstonInstance.log('crit', message, { context: this.context, ...metadata })
    void persistJobMonitoringLog('crit', message, metadata as JobMonitoringLogMeta | undefined)
  }

  activityWarn(message: string, meta: JobMonitoringLogMeta): void {
    this.warn(message, meta as Record<string, unknown>)
    void persistJobMonitoringLog('warn', message, { ...meta, aggregate: meta.aggregate ?? false })
  }

  activityError(message: string, meta: JobMonitoringLogMeta): void {
    this.error(message, meta as Record<string, unknown>)
    void persistJobMonitoringLog('error', message, { ...meta, aggregate: meta.aggregate ?? false })
  }

  activityCrit(message: string, meta: JobMonitoringLogMeta): void {
    winstonInstance.log('crit', message, { context: this.context, ...meta })
    void persistJobMonitoringLog('crit', message, { ...meta, aggregate: meta.aggregate ?? false })
  }
}
