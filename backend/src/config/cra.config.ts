import { registerAs } from '@nestjs/config'

export const craConfig = registerAs('cra', () => {
  const craEnvironment = process.env.CRA_ENVIRONMENT
  if (!craEnvironment) {
    throw new Error('CRA_ENVIRONMENT is required (set to "production" or "test")')
  }

  const isProduction = craEnvironment === 'production'

  return {
    environmentCode: isProduction ? 'PCSAIN' : 'ACSAIN',
    fileTypeCode: isProduction ? 'PAPL' : 'AAPL',
  }
})
