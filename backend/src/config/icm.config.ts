import { registerAs } from '@nestjs/config'

export const icmConfig = registerAs('icm', () => ({
  workspace: process.env.ICM_WORKSPACE || 'int_release_5.4',
}))
