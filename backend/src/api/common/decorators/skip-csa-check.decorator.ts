import { SetMetadata } from '@nestjs/common'
import { SKIP_CSA_CHECK_KEY } from '../guards/csa.guard'

/**
 * Decorator to skip CSA access check for specific routes
 * Use this on routes that should only validate the token
 * but not require CSA Application responsibility (e.g., verify-csa-access itself)
 */
export const SkipCSACheck = () => SetMetadata(SKIP_CSA_CHECK_KEY, true)
