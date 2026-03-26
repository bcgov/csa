import type { LoggerService } from '@nestjs/common'
import { utilities, WinstonModule } from 'nest-winston'
import * as winston from 'winston'

/**
 * Custom log levels following syslog convention.
 * Lower number = higher priority. Winston logs everything at or above the configured level.
 * Includes `warn` (not `warning`) and `verbose` for NestJS Logger compatibility.
 */
const customLevels: winston.config.AbstractConfigSet = {
  levels: {
    alert: 0,
    crit: 1,
    error: 2,
    warn: 3,
    info: 4,
    debug: 5,
    verbose: 6,
  },
  colors: {
    alert: 'bold red',
    crit: 'red',
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
    verbose: 'cyan',
  },
}

winston.addColors(customLevels.colors)

const isProduction = process.env.NODE_ENV === 'production'

const logLevel = process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug')

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
)

const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  utilities.format.nestLike('Backend', {
    colors: true,
    prettyPrint: true,
  }),
)

export const winstonInstance = winston.createLogger({
  levels: customLevels.levels,
  level: logLevel,
  format: isProduction ? jsonFormat : devFormat,
  transports: [new winston.transports.Console()],
  exitOnError: false,
})

export const customLogger: LoggerService = WinstonModule.createLogger({
  instance: winstonInstance,
})
