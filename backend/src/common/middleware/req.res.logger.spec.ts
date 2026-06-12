import { HTTPLoggerMiddleware } from './req.res.logger'
import type { Request, Response } from 'express'
import { winstonInstance } from '../logger/logger.config'

describe('HTTPLoggerMiddleware', () => {
  let middleware: HTTPLoggerMiddleware

  beforeEach(() => {
    middleware = new HTTPLoggerMiddleware()
  })

  it('should log structured HTTP request metadata', () => {
    const request: Request = {
      method: 'GET',
      originalUrl: '/test',
      get: () => 'Test User Agent',
    } as unknown as Request

    const response: Response = {
      statusCode: 200,
      get: () => '100',
      on: (event: string, cb: () => void) => {
        if (event === 'finish') {
          cb()
        }
      },
    } as unknown as Response

    const loggerSpy = vi.spyOn(winstonInstance, 'log')

    middleware.use(request, response, () => {})

    expect(loggerSpy).toHaveBeenCalledWith('info', 'HTTP request', {
      context: 'HTTP',
      http: {
        method: 'GET',
        path: '/test',
        statusCode: 200,
        contentLength: '100',
        userAgent: 'Test User Agent',
      },
    })
  })
})
