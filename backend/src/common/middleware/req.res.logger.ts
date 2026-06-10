import type { Request, Response, NextFunction } from 'express'
import type { NestMiddleware } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { winstonInstance } from '../logger/logger.config'

@Injectable()
export class HTTPLoggerMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const { method, originalUrl } = request

    response.on('finish', () => {
      const { statusCode } = response
      winstonInstance.log('info', 'HTTP request', {
        context: 'HTTP',
        http: {
          method,
          path: originalUrl,
          statusCode,
          contentLength: response.get('content-length') ?? null,
          userAgent: request.get('user-agent') ?? null,
        },
      })
    })
    next()
  }
}
