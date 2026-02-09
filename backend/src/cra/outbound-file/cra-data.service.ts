import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'
import { CRA_DATA_HANDLING_CONSTANT } from '../common/constants/cra.constant'
import { CraDetail, CraHeader, CraTrailer } from '../interfaces/file-create.interface'
import { FILE_MOCK_DATA } from './file-mock-data'

const { REQUEST_FILE } = CRA_DATA_HANDLING_CONSTANT
const { HEADER_TRAN_CODE, DETAIL_TRAN_CODE, TRAILER_TRAN_CODE, BUSINESS_NUM, VERSION_NUM } =
  REQUEST_FILE

export interface CraFileData {
  header: CraHeader
  details: CraDetail[]
  trailer: CraTrailer
}

@Injectable()
export class CraDataService {
  private readonly logger = new Logger(CraDataService.name)

  constructor(private readonly prisma: PrismaService) {}

  // Builds CRA file data from pending batch contacts
  async buildCraFileData(): Promise<CraFileData> {
    // TODO: Remove mock data override when DB queries are ready
    const mock_data = true

    if (mock_data) return FILE_MOCK_DATA

    // TODO: Query Batch and ContactBatchDetail tables for pending batch data
    const contacts = await this.prisma.contact.findMany({
      where: {
        csaStatus: 'PENDING',
      },
    })

    this.logger.log(`Found ${contacts.length} contacts in pending batch`)

    const processDate = this.formatDate(new Date())
    const details = contacts.map((contact) => this.transformToDetail(contact))

    // Record count = header(1) + details(n) + trailer(1)
    const recordCount = details.length + 2

    return {
      header: this.buildHeader(processDate, recordCount),
      details,
      trailer: this.buildTrailer(processDate, recordCount),
    }
  }

  private buildHeader(processDate: string, recordCount: number): CraHeader {
    return {
      tranCode: HEADER_TRAN_CODE,
      versionNum: VERSION_NUM,
      processDate,
      businessNum: BUSINESS_NUM,
      recordCount,
      filler: ''.padEnd(25, ' '),
    }
  }

  private buildTrailer(processDate: string, recordCount: number): CraTrailer {
    return {
      tranCode: TRAILER_TRAN_CODE,
      versionNum: VERSION_NUM,
      processDate,
      businessNum: BUSINESS_NUM,
      recordCount,
      filler: ''.padEnd(25, ' '),
    }
  }

  /*
   * Transforms a Contact entity to CRA detail format
   * TODO: Verify field mappings match actual Contact Batch schema
   */
  private transformToDetail(contact: any): CraDetail {
    return {
      tranCode: DETAIL_TRAN_CODE,
      referenceNum: contact.personIdIcm ?? '',
      businessNum: BUSINESS_NUM,
      tranType: 2, // TODO: determine from contact data (1=Cancel, 2=Application)

      childGivenName: contact.firstName ?? '',
      childInitial: contact.middleName ?? '',
      childSurName: contact.lastName ?? '',

      childGivenNameAka: contact.akaFirstName ?? '',
      childSurNameAka: contact.akaLastName ?? '',

      childBirthDate: contact.dateOfBirth ? this.formatDate(contact.dateOfBirth) : '',
      childSex: contact.gender ?? '',
      childBirthCity: contact.birthCity ?? '',
      childBirthProv: contact.birthProvince ?? '',
      childBirthCountry: contact.birthCountry ?? 'CA',

      prevRecipSin: '',
      filler1: ''.padEnd(6, ' '),
      prevRecipGivenName: '',
      prevRecipSurName: '',

      appStartDate: contact.csaStatusEffectiveDate
        ? this.formatDate(contact.csaStatusEffectiveDate)
        : '',
      newBornCode: 'N',
      filler2: ''.padEnd(10, ' '),

      cancelEndDate: '',
      cancelReasonCode: '',

      ccraDinNum: contact.din ?? '',
      filler3: ''.padEnd(15, ' '),
    }
  }

  private formatDate(date: Date | string | null): string {
    if (!date) return ''
    const d = typeof date === 'string' ? new Date(date) : date
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}${month}${day}`
  }
}
