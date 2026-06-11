import type { RequestHandler } from 'express'
import * as prom from 'prom-client'
import promBundle from 'express-prom-bundle'

export const METRICS_PATH = '/metrics'
export const METRICS_ALIAS_PATH = '/prom-metrics'

const register = new prom.Registry()
prom.collectDefaultMetrics({ register })

const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  metricsPath: METRICS_PATH,
  promRegistry: register,
})

export const servePrometheusMetrics: RequestHandler = async (_req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
}

export { metricsMiddleware, register }
