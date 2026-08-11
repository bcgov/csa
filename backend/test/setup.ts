import { ConsoleLogger } from '@nestjs/common'
import { winstonInstance } from 'src/common/logger/logger.config'

process.env.DEPLOY_ENV = 'local'
process.env.FILE_TRANSFER_SERVICE_URL = 'http://localhost:4000'
process.env.FILE_STORAGE_PATH = '/tmp'
process.env.CRA_ENVIRONMENT = 'test'
process.env.CRA_USER_ID = 'TESTUSERID1'
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
process.env.ICM_CURSOR_LOOKBACK_DAYS = '2'
process.env.ELIGIBILITY_LOOKBACK_DAYS = '2'
process.env.ICM_REQUEST_TIMEOUT_MS = '30000'
process.env.MIS_S3_PREFIX = 'csas3/'

// Silence all NestJS logger output in tests
ConsoleLogger.prototype.log = function () {}
ConsoleLogger.prototype.warn = function () {}
ConsoleLogger.prototype.error = function () {}
ConsoleLogger.prototype.debug = function () {}
ConsoleLogger.prototype.verbose = function () {}

// Silence direct Winston calls (alert/crit) in tests
winstonInstance.silent = true
