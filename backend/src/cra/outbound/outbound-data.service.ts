import { Injectable } from '@nestjs/common'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { CraDetail, CraHeader, CraTrailer } from './outbound.interface'

const { REQUEST_FILE } = CRA_DATA_HANDLING_CONSTANT
const { HEADER_TRAN_CODE, DETAIL_TRAN_CODE, TRAILER_TRAN_CODE, BUSINESS_NUM, VERSION_NUM } =
  REQUEST_FILE

const TRAN_TYPE = { APPLICATION: 2, CANCELLATION: 1 } as const

export interface CraFileData {
  header: CraHeader
  details: CraDetail[]
  trailer: CraTrailer
}

export interface BatchDetailWithContact {
  id: number
  transactionType: string
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
    effectiveDate: Date | null
    legacyFileNumber: string | null
    prevRecipientFirstName: string | null
    prevRecipientLastName: string | null
    cancelReasonCode: string | null
    careEndDate: Date | null
  }
}

@Injectable()
export class OutboundDataService {
  buildCraFileData(batchDetails: BatchDetailWithContact[]): CraFileData {
    const processDate = this.formatDate(new Date())
    const details = batchDetails.map((bd) => this.mapToDetail(bd))

    return {
      header: {
        tranCode: HEADER_TRAN_CODE,
        versionNum: VERSION_NUM,
        processDate,
        businessNum: BUSINESS_NUM,
        recordCount: 0,
        filler: '',
      },
      details,
      trailer: {
        tranCode: TRAILER_TRAN_CODE,
        versionNum: VERSION_NUM,
        processDate,
        businessNum: BUSINESS_NUM,
        recordCount: details.length,
        filler: '',
      },
    }
  }

  private mapToDetail(bd: BatchDetailWithContact): CraDetail {
    const { contact } = bd
    const isApplication = bd.transactionType === 'application'

    return {
      tranCode: DETAIL_TRAN_CODE,
      referenceNum: isApplication ? String(bd.id) : (contact.legacyFileNumber ?? ''),
      businessNum: BUSINESS_NUM,
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
      childBirthCountry: contact.birthCountry ?? '',

      prevRecipSin: '',
      filler1: '',
      prevRecipGivenName: contact.prevRecipientFirstName ?? '',
      prevRecipSurName: contact.prevRecipientLastName ?? '',

      appStartDate: isApplication ? this.formatDate(contact.effectiveDate) : '',
      newBornCode: isApplication ? this.calculateNewBornCode(contact.dateOfBirth, contact.din) : '',
      filler2: '',

      cancelEndDate: isApplication ? '' : this.formatDate(contact.careEndDate),
      cancelReasonCode: isApplication ? '' : (contact.cancelReasonCode ?? ''),

      ccraDinNum: contact.din ?? '',
      filler3: '',
    }
  }

  private mapGender(gender: string | null): string {
    if (gender === 'M' || gender === 'F') return gender
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
    const d = typeof date === 'string' ? new Date(date) : date
    const year = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${year}${month}${day}`
  }
}
