import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Request } from 'express'

// Falls back to 'SYSTEM' if no username is available.
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>()
  return (request as any).username ?? 'SYSTEM'
})
