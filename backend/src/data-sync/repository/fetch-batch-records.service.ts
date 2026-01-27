import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'

@Injectable()
export class FetchBatchRecordsService {
  private readonly logger = new Logger(FetchBatchRecordsService.name)

  constructor(private readonly prismaService: PrismaService) {}

  async fetchBatchRecords() {
    this.logger.log('Fetching batch records from master_table')

    const dbResult = await this.prismaService.master_table.findMany({
      orderBy: { id: 'asc' },
    })

    console.log(dbResult[0]);

    this.logger.log(`Fetched ${dbResult.length} records`, JSON.stringify(dbResult[0], null, 2))
    return dbResult
  }
}

const batchInstance = new FetchBatchRecordsService(new PrismaService())
batchInstance.fetchBatchRecords().then(() => {
  console.log('Batch records fetch completed.')
})
