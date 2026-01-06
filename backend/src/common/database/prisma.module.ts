import { Module } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'

@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
