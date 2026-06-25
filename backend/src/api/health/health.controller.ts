import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus'
import { PrismaClient } from '@prisma/client'
import { PrismaService } from 'src/common/database/prisma.service.js'

const DEFAULT_DB_HEALTH_TIMEOUT_MS = 5000

const getDbHealthTimeoutMs = (): number => {
  const parsed = Number.parseInt(process.env.HEALTH_DB_TIMEOUT_MS ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DB_HEALTH_TIMEOUT_MS
}

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prisma: PrismaHealthIndicator,
    private readonly prismaService: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    const timeout = getDbHealthTimeoutMs()
    return this.health.check([
      () =>
        this.prisma.pingCheck('database', this.prismaService as unknown as PrismaClient, {
          timeout,
        }),
    ])
  }

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([])
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    const timeout = getDbHealthTimeoutMs()
    return this.health.check([
      () =>
        this.prisma.pingCheck('database', this.prismaService as unknown as PrismaClient, {
          timeout,
        }),
    ])
  }
}
