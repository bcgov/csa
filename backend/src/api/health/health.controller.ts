import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus'
import { PrismaClient } from '@prisma/client'
import { PrismaService } from 'src/common/database/prisma.service.js'

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
      () => this.prisma.pingCheck('database', this.prismaService as unknown as PrismaClient),
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
      () => this.prisma.pingCheck('database', this.prismaService as unknown as PrismaClient),
    ])
  }
}
