import { ConsoleLogger } from '@nestjs/common'

process.env.FILE_TRANSFER_SERVICE_URL = 'http://localhost:4000'
process.env.FILE_STORAGE_PATH = '/tmp'
process.env.USE_MOCK_DATA = 'true'
process.env.CRA_ENVIRONMENT = 'test'

// Silence all NestJS logger output in tests
ConsoleLogger.prototype.log = function () {}
ConsoleLogger.prototype.warn = function () {}
ConsoleLogger.prototype.error = function () {}
ConsoleLogger.prototype.debug = function () {}
ConsoleLogger.prototype.verbose = function () {}
