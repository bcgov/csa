import { registerAs } from '@nestjs/config'

export const craConfig = registerAs('cra', () => {
  const deployEnv = process.env.DEPLOY_ENV || 'local'
  const isLocal = deployEnv === 'local'

  const craEnvironment = process.env.CRA_ENVIRONMENT || (isLocal ? 'test' : undefined)
  if (!craEnvironment) {
    throw new Error('CRA_ENVIRONMENT is required (set to "production" or "test")')
  }

  const craUserId = process.env.CRA_USER_ID || (isLocal ? 'TST0016' : undefined)
  if (!craUserId) {
    throw new Error('CRA_USER_ID is required')
  }

  const businessNum = process.env.CRA_BUSINESS_NUM || (isLocal ? 'TESTBN000000001' : undefined)
  if (!businessNum) {
    throw new Error('CRA_BUSINESS_NUM is required')
  }

  const lastSequenceNumber = process.env.CRA_LAST_SEQUENCE_NUMBER ?? (isLocal ? '0' : undefined)
  if (lastSequenceNumber === undefined) {
    throw new Error('CRA_LAST_SEQUENCE_NUMBER is required')
  }
  const parsedSequenceNumber = parseInt(lastSequenceNumber, 10)
  if (isNaN(parsedSequenceNumber) || parsedSequenceNumber < 0 || parsedSequenceNumber > 9999) {
    throw new Error('CRA_LAST_SEQUENCE_NUMBER must be an integer between 0 and 9999')
  }

  const isProduction = craEnvironment === 'production'

  return {
    enabled: process.env.CRA_INTEGRATION_ENABLED === 'true',
    transferMode: process.env.CRA_TRANSFER_MODE || 's3',
    s3Prefix: process.env.CRA_S3_PREFIX || '',
    environmentCode: isProduction ? 'PCSAIN' : 'ACSAIN',
    fileTypeCode: isProduction ? 'PAPL' : 'AAPL',
    fileNamePrefix: isProduction ? 'HT' : 'II',
    responseEnvFlag: isProduction ? 'P' : 'A',
    userId: craUserId,
    businessNum,
    lastSequenceNumber: parsedSequenceNumber,
  }
})
