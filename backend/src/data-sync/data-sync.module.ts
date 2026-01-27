import { Module } from '@nestjs/common'
import { FetchBatchRecordsService } from './repository/fetch-batch-records.service'
import { PrismaService } from 'src/common/database/prisma.service'

@Module({
  providers: [FetchBatchRecordsService, PrismaService],
  exports: [FetchBatchRecordsService],
})
export class DataSyncModule {}
