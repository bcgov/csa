import { Logger } from '@nestjs/common'
import { JobMonitoringLogMeta, persistJobMonitoringLog } from 'src/jobs/job-monitoring-log'
import { winstonInstance } from './logger.config'

function asMonitoringMeta(value: unknown): JobMonitoringLogMeta | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return value as JobMonitoringLogMeta
}

/**
 * App logger with syslog levels and optional Monitoring dual-write.
 *
 * Convention:
 * - `log` / `debug` / `verbose` — engineering narrative (Splunk only)
 * - `warn` / `error` / `crit` — operator-relevant when tagged with `activityType` or `category`
 * - Untagged `warn` / `error` / `crit` — Splunk only (auth, integration failures, routine guards)
 * - Demote to `log` only mocks, config fallbacks, and internal engineering detail
 */
export class AppLogger extends Logger {
  alert(message: string, metadata?: Record<string, unknown>): void {
    winstonInstance.log('alert', message, { context: this.context, ...metadata })
  }

  crit(message: string, metadata?: Record<string, unknown>): void {
    winstonInstance.log('crit', message, { context: this.context, ...metadata })
    this.persistTaggedMonitoringLog('crit', message, metadata)
  }

  warn(message: string, ...optionalParams: unknown[]): void {
    super.warn(message, ...optionalParams)
    this.persistTaggedMonitoringLog('warn', message, optionalParams[0])
  }

  error(message: string, ...optionalParams: unknown[]): void {
    super.error(message, ...optionalParams)
    this.persistTaggedMonitoringLog('error', message, optionalParams[0])
  }

  private persistTaggedMonitoringLog(
    level: 'warn' | 'error' | 'crit',
    message: string,
    metadata: unknown,
  ): void {
    const meta = asMonitoringMeta(metadata)
    if (!meta?.activityType && !meta?.category) {
      return
    }

    const aggregateDefault = level === 'crit' && !!meta.category ? undefined : false

    void persistJobMonitoringLog(level, message, {
      ...meta,
      aggregate: meta.aggregate ?? aggregateDefault,
    })
  }
}
