import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Request } from 'express'
import { UserProfile } from 'src/api/admin/constants/user-profile.constants'

/**
 * Extracts the user profile set by CSAGuard after ICM verification.
 * Returns the UserProfile type (DATA_QUALITY_STEWARD or CSA_STANDARD) or null.
 */
export const UserProfileDecorator = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserProfile | null => {
    const request = ctx.switchToHttp().getRequest<Request>()
    return (request as any).userProfile ?? null
  },
)
