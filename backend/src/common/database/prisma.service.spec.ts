import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { databaseConfig } from 'src/config/database.config'
import { PrismaService } from './prisma.service'

describe('PrismaService', () => {
  let service: PrismaService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile()

    service = module.get<PrismaService>(PrismaService)
  })

  afterEach(async () => {
    await service.$disconnect()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('configures pool onConnect to set search_path for all acquisition paths', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], fields: [] })
    const onConnect = service.getPool().options.onConnect

    expect(onConnect).toBeDefined()
    await onConnect!({ query } as never)

    expect(query).toHaveBeenCalledWith(`SET search_path TO ${databaseConfig.schema}`)
  })
})
