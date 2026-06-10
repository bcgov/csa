import type { Response } from 'express'
import { vi } from 'vitest'
import {
  METRICS_ALIAS_PATH,
  METRICS_PATH,
  servePrometheusMetrics,
} from './prom'

vi.mock('prom-client', () => ({
  Registry: vi.fn().mockImplementation(() => ({
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
    metrics: vi.fn().mockResolvedValue('http_requests_total 1'),
  })),
  collectDefaultMetrics: vi.fn(),
}))

vi.mock('express-prom-bundle', () => ({
  default: vi.fn().mockReturnValue((_req: unknown, _res: unknown, next: () => void) => next()),
}))

describe('prom metrics', () => {
  it('should expose canonical and alias paths', () => {
    expect(METRICS_PATH).toBe('/metrics')
    expect(METRICS_ALIAS_PATH).toBe('/prom-metrics')
  })

  it('should serve prometheus metrics from the shared registry', async () => {
    const { register } = await import('./prom')
    const res = {
      set: vi.fn(),
      end: vi.fn(),
    } as unknown as Response

    await servePrometheusMetrics({} as never, res, vi.fn())

    expect(res.set).toHaveBeenCalledWith('Content-Type', register.contentType)
    expect(register.metrics).toHaveBeenCalledTimes(1)
    expect(res.end).toHaveBeenCalledWith('http_requests_total 1')
  })
})
