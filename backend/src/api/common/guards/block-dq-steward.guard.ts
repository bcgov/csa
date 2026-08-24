import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Request } from 'express'
import { USER_PROFILE } from '../../admin/constants/user-profile.constants'

/**
 * BL-34: Data Quality Stewards only have access to the Eligibility Tab (search, PDQ, update,
 * delete). Batch Requests, Weekly File Processing, and Job Monitoring are hidden in the UI, but
 * must also be denied at the API layer — must run after CSAGuard so request.userProfile is set.
 */
@Injectable()
export class BlockDqStewardGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const userProfile = (request as any).userProfile

    if (userProfile === USER_PROFILE.DATA_QUALITY_STEWARD) {
      throw new ForbiddenException('Data Quality Stewards do not have access to this resource')
    }

    return true
  }
}
