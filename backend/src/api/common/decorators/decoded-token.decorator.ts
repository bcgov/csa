import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Request } from 'express'

// Extracts the decoded JWT payload set by CSAGuard after token verification.
export const DecodedToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Record<string, unknown> => {
    const request = ctx.switchToHttp().getRequest<Request>()
    return (request as any).user ?? {}
  },
)
