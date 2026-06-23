import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus'
import { PrismaClient } from '@prisma/client'
import { PrismaService } from 'src/common/database/prisma.service.js'

const HEALTH_DB_TIMEOUT_MS = 5000

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
    return this.health.check([
      () =>
        this.prisma.pingCheck('database', this.prismaService as unknown as PrismaClient, {
          timeout: HEALTH_DB_TIMEOUT_MS,
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
    return this.health.check([
      () =>
        this.prisma.pingCheck('database', this.prismaService as unknown as PrismaClient, {
          timeout: HEALTH_DB_TIMEOUT_MS,
        }),
    ])
  }
}
