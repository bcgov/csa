import { registerAs } from '@nestjs/config'

export const craConfig = registerAs('cra', () => {
  const craEnvironment = process.env.CRA_ENVIRONMENT
  if (!craEnvironment) {
    throw new Error('CRA_ENVIRONMENT is required (set to "production" or "test")')
  }

  const craUserId = process.env.CRA_USER_ID
  if (!craUserId) {
    throw new Error('CRA_USER_ID is required')
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
    lastSequenceNumber: isProduction ? null : 0,
  }
})
