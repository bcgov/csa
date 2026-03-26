import { ConsoleLogger } from '@nestjs/common'

process.env.FILE_TRANSFER_SERVICE_URL = 'http://localhost:4000'
process.env.FILE_STORAGE_PATH = '/tmp'
process.env.USE_MOCK_DATA = 'true'
process.env.CRA_ENVIRONMENT = 'test'
process.env.CRA_USER_ID = 'TST0016'
process.env.CRA_BUSINESS_NUM = 'TESTBN000000001'
process.env.CRA_LAST_SEQUENCE_NUMBER = '0'
process.env.CRA_INTEGRATION_ENABLED = 'false'
process.env.ICM_API_URL = 'http://mock-icm-api'
process.env.ICM_API_USERNAME = 'test-user'
process.env.ICM_TRUSTED_USERNAME = 'test-user'
process.env.ICM_TOKEN_URL = 'http://mock-keycloak/token'
process.env.ICM_CLIENT_ID = 'test-client'
process.env.ICM_CLIENT_SECRET = 'test-secret'
process.env.SSO_KEYCLOAK_URL = 'http://mock-sso-keycloak'
process.env.SSO_KEYCLOAK_REALM = 'test-realm'

// Silence all NestJS logger output in tests
ConsoleLogger.prototype.log = function () {}
ConsoleLogger.prototype.warn = function () {}
ConsoleLogger.prototype.error = function () {}
ConsoleLogger.prototype.debug = function () {}
ConsoleLogger.prototype.verbose = function () {}
