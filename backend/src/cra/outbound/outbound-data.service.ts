import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { normalize, formatDatePacificCompact } from 'src/common/utils'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { CraMatchingSnapshot } from '../inbound/cra-matching-snapshot.interface'
import { CraDetail, CraHeader, CraTrailer } from './outbound.interface'

const { REQUEST_FILE } = CRA_DATA_HANDLING_CONSTANT
const { HEADER_TRAN_CODE, DETAIL_TRAN_CODE, TRAILER_TRAN_CODE, VERSION_NUM } = REQUEST_FILE

const TRAN_TYPE = { APPLICATION: 2, CANCELLATION: 1 } as const

export interface CraFileData {
  header: CraHeader
  details: CraDetail[]
  trailer: CraTrailer
}

export interface BatchDetailWithContact {
  id: number
  transactionType: string
  referenceNumber: string | null
  effectiveDate: Date | null
  cancelReasonCode: string | null
  contact: {
    id: number
    firstName: string
    middleName: string
    lastName: string
    akaFirstName: string
    akaLastName: string
    personIdIcm: string
    dateOfBirth: Date | null
    gender: string | null
    birthCity: string | null
    birthProvince: string | null
    birthCountry: string | null
    din: string | null
    legacyFileNumber: string | null
    prevRecipientFirstName: string | null
    prevRecipientLastName: string | null
  }
}

@Injectable()
export class OutboundDataService {
  private readonly businessNum: string

  constructor(private readonly configService: ConfigService) {
    this.businessNum = this.configService.get<string>('cra.businessNum')!
  }

  buildMatchingSnapshot(detail: CraDetail, middleName: string | null): CraMatchingSnapshot {
    return {
      childGivenName: detail.childGivenName.trim(),
      childMiddleName: middleName?.trim() ?? '',
      childSurName: detail.childSurName.trim(),
      childSex: detail.childSex.trim(),
      childBirthDate: detail.childBirthDate.trim(),
      childBirthCity: detail.childBirthCity.trim(),
      childBirthProv: detail.childBirthProv.trim(),
      childBirthCountry: detail.childBirthCountry.trim(),
      ccraDinNum: detail.ccraDinNum.trim(),
    }
  }

  buildCraFileData(batchDetails: BatchDetailWithContact[]): CraFileData {
    const processDate = formatDatePacificCompact(new Date())
    const details = batchDetails.map((batchDetail) => this.mapToDetail(batchDetail))

    return {
      header: {
        tranCode: HEADER_TRAN_CODE,
        versionNum: VERSION_NUM,
        processDate,
        businessNum: this.businessNum,
        recordCount: 0,
        filler: '',
      },
      details,
      trailer: {
        tranCode: TRAILER_TRAN_CODE,
        versionNum: VERSION_NUM,
        processDate,
        businessNum: this.businessNum,
        recordCount: details.length,
        filler: '',
      },
    }
  }

  private mapToDetail(batchDetail: BatchDetailWithContact): CraDetail {
    const { contact } = batchDetail
    const isApplication = batchDetail.transactionType === 'application'

    return {
      tranCode: DETAIL_TRAN_CODE,
      referenceNum: batchDetail.referenceNumber ?? '',
      businessNum: this.businessNum,
      tranType: isApplication ? TRAN_TYPE.APPLICATION : TRAN_TYPE.CANCELLATION,

      childGivenName: contact.firstName ?? '',
      childInitial: contact.middleName?.charAt(0) ?? '',
      childSurName: contact.lastName ?? '',

      childGivenNameAka: contact.akaFirstName ?? '',
      childSurNameAka: contact.akaLastName ?? '',

      childBirthDate: this.formatDate(contact.dateOfBirth),
      childSex: this.mapGender(contact.gender),
      childBirthCity: contact.birthCity ?? '',
      childBirthProv: contact.birthProvince ?? '',
      childBirthCountry: this.mapCountryCode(contact.birthCountry),

      prevRecipSin: '',
      filler1: '',
      prevRecipGivenName: contact.prevRecipientFirstName ?? '',
      prevRecipSurName: contact.prevRecipientLastName ?? '',

      appStartDate: isApplication ? this.formatDate(batchDetail.effectiveDate) : '',
      newBornCode: isApplication ? this.calculateNewBornCode(contact.dateOfBirth, contact.din) : '',
      filler2: '',

      cancelEndDate: isApplication ? '' : this.formatDate(batchDetail.effectiveDate),
      cancelReasonCode: isApplication ? '' : (batchDetail.cancelReasonCode ?? ''),

      ccraDinNum: contact.din ?? '',
      filler3: '',
    }
  }

  private mapCountryCode(country: string | null): string {
    if (!country || country.trim() === '') return 'CA'
    return normalize(country) === 'CANADA' ? 'CA' : 'EX'
  }

  private mapGender(gender: string | null): string {
    const normalized = normalize(gender)
    if (normalized === 'M' || normalized === 'F') return normalized
    if (normalized?.startsWith('MAN')) return 'M'
    if (normalized?.startsWith('WOMAN')) return 'F'
    return 'X'
  }

  private calculateNewBornCode(dateOfBirth: Date | null, din: string | null): string {
    if (!dateOfBirth || (din && din.trim() !== '')) return 'N'
    const ageInDays = Math.floor(
      (Date.now() - new Date(dateOfBirth).getTime()) / (1000 * 60 * 60 * 24),
    )
    return ageInDays < 365 ? 'Y' : 'N'
  }

  private formatDate(date: Date | string | null): string {
    if (!date) return ''
    const dateValue = typeof date === 'string' ? new Date(date) : date
    const year = dateValue.getUTCFullYear()
    const month = String(dateValue.getUTCMonth() + 1).padStart(2, '0')
    const day = String(dateValue.getUTCDate()).padStart(2, '0')
    return `${year}${month}${day}`
  }
}
