import { ConsoleLogger } from '@nestjs/common'

process.env.FILE_TRANSFER_SERVICE_URL = 'http://localhost:4000'
process.env.FILE_STORAGE_PATH = '/tmp'
process.env.USE_MOCK_DATA = 'true'

// NestJS's TestingLogger silences log/warn/debug/verbose
// but passes error() through to ConsoleLogger.
// Silence errors in tests too.
ConsoleLogger.prototype.error = function () {}
