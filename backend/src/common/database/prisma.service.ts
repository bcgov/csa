import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Injectable, Logger } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '@prisma/client'
import 'dotenv/config'
import { Pool } from 'pg'

import { databaseConfig } from 'src/config/database.config'

@Injectable()
class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query'>
  implements OnModuleInit, OnModuleDestroy
{
  private logger = new Logger('PRISMA')
  private static instance: PrismaService
  private pool: Pool
  constructor() {
    if (PrismaService.instance) {
      return PrismaService.instance
    }
    const pool = new Pool({
      connectionString: databaseConfig.url,
    })
    this.wrapPoolConnectWithSearchPath(pool)
    const adapter = new PrismaPg(pool)
    super({
      adapter,
      errorFormat: 'pretty',
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    })
    this.pool = pool
    PrismaService.instance = this
  }

  async onModuleInit() {
    await this.$connect()
    this.$on<any>('query', (e: Prisma.QueryEvent) => {
      // dont print the health check queries, which contains SELECT 1 or COMMIT , BEGIN, DEALLOCATE ALL
      // this is to avoid logging health check queries which are executed by the framework.
      const excludedPatterns = ['COMMIT', 'BEGIN', 'SELECT 1', 'DEALLOCATE ALL']
      if (excludedPatterns.some((pattern) => e?.query?.toUpperCase().includes(pattern))) {
        return
      }
      this.logger.log(`Query: ${e.query} - Params: ${e.params} - Duration: ${e.duration}ms`)
    })
  }

  /** Expose the underlying pg Pool for raw operations (e.g. COPY FROM STDIN). */
  getPool(): Pool {
    return this.pool
  }

  /**
   * Ensure every checked-out client has search_path set before first use.
   * We wrap pool.connect instead of using pool "connect" event to avoid issuing
   * a concurrent query on a client that may already be executing work.
   */
  private wrapPoolConnectWithSearchPath(pool: Pool): void {
    const originalConnect = pool.connect.bind(pool)

    pool.connect = async (...args: unknown[]) => {
      const client = await originalConnect(...args)
      await client.query(`SET search_path TO ${databaseConfig.schema}`)
      return client
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}

export { PrismaService }
