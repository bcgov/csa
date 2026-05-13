import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/common/database/prisma.service'
import { BATCH_DETAIL_STATUS } from 'src/common/state-machine/constants/batch-detail-status.constants'
import { BATCH_STATUS } from 'src/common/state-machine/constants/batch-status.constants'
import { AppLogger } from 'src/common/logger/app-logger'
import { parseWklDate } from 'src/common/utils'
import { CraMatchingSnapshot } from './cra-matching-snapshot.interface'
import { DetailRecord04 } from './inbound-weekly.interface'

const ACTIVE_BATCH_STATUSES = [BATCH_STATUS.IN_PROGRESS, BATCH_STATUS.PARTIALLY_PROCESSED]

interface WklChildDetails {
  childDin: string
  childGivenName: string
  childSurName: string
  childSex: string
  childBirthDate: string
  childBirthCity: string
  childBirthProv: string
  childBirthCountry: string
}

export interface MatchedBatchDetail {
  id: number
  contactId: number
  batchId: number
  transactionType: string
  systemComments: string | null
  contact: { din: string | null }
}

export interface MatchedContact {
  id: number
  din: string | null
  csaStatus: string | null
  caseNumber: string | null
}

@Injectable()
export class WeeklyContactMatcherService {
  private readonly logger = new AppLogger(WeeklyContactMatcherService.name)
  private candidates: Awaited<ReturnType<WeeklyContactMatcherService['fetchCandidates']>> = []

  constructor(private readonly prisma: PrismaService) {}

  async loadCandidates(): Promise<void> {
    this.candidates = await this.fetchCandidates()
    this.logger.log(`Loaded ${this.candidates.length} candidate batch details for WKL matching`)
  }

  private fetchCandidates() {
    return this.prisma.contactBatchDetail.findMany({
      where: {
        status: BATCH_DETAIL_STATUS.IN_PROGRESS,
        batch: { status: { in: ACTIVE_BATCH_STATUSES } },
        craMatchingSnapshot: { not: Prisma.DbNull },
      },
      select: {
        id: true,
        contactId: true,
        batchId: true,
        transactionType: true,
        systemComments: true,
        craMatchingSnapshot: true,
        contact: { select: { din: true } },
      },
    })
  }

  async findMatchingBatchDetail(wklDetail: WklChildDetails): Promise<MatchedBatchDetail | null> {
    const din = wklDetail.childDin?.trim()

    // Step 1: DIN match
    if (din) {
      const match = this.candidates.find(
        (d) => (d.craMatchingSnapshot as unknown as CraMatchingSnapshot).ccraDinNum === din,
      )
      if (match) return this.toResult(match)
      this.logger.log(`DIN ${din} not matched in snapshots, falling back to child details`)
    }

    // Step 2: Child details match
    const matches = this.candidates.filter((d) => {
      const snap = d.craMatchingSnapshot as unknown as CraMatchingSnapshot
      return (
        snap.childGivenName === wklDetail.childGivenName.trim() &&
        snap.childSurName === wklDetail.childSurName.trim() &&
        snap.childSex === wklDetail.childSex.trim() &&
        snap.childBirthDate === wklDetail.childBirthDate.trim() &&
        snap.childBirthCity === wklDetail.childBirthCity.trim() &&
        snap.childBirthProv === wklDetail.childBirthProv.trim() &&
        snap.childBirthCountry === wklDetail.childBirthCountry.trim()
      )
    })

    if (matches.length === 1) return this.toResult(matches[0])

    if (matches.length > 1) {
      this.logger.warn(
        `WKL: multiple batch detail matches (${matches.length}) for ` +
          `${wklDetail.childGivenName.trim()} ${wklDetail.childSurName.trim()}, skipping`,
      )
      return null
    }

    return null
  }

  private toResult(detail: {
    id: number
    contactId: number
    batchId: number
    transactionType: string
    systemComments: string | null
    contact: { din: string | null }
  }): MatchedBatchDetail {
    return {
      id: detail.id,
      contactId: detail.contactId,
      batchId: detail.batchId,
      transactionType: detail.transactionType,
      systemComments: detail.systemComments,
      contact: detail.contact,
    }
  }

  async findMatchingContact(wklDetail: WklChildDetails): Promise<MatchedContact | null> {
    const din = wklDetail.childDin?.trim()

    // Step 1: DIN match
    if (din) {
      this.logger.log(`Weekly Unmatched Records: Attempting DIN match for ${din}`)
      const dinMatches = await this.prisma.contact.findMany({
        where: { din },
        select: { id: true, din: true, csaStatus: true, caseNumber: true },
      })
      if (dinMatches.length === 1) return dinMatches[0]
      if (dinMatches.length > 1) {
        this.logger.warn(`WKL contact match: multiple contacts with DIN ${din}, skipping`)
        return null
      }
    }
    this.logger.log(`WKL contact match: DIN ${din} not found, falling back to child details`)

    // Step 2: Child details match against contacts table
    const birthCountry = wklDetail.childBirthCountry.trim()
    const detailMatches = await this.prisma.contact.findMany({
      where: {
        firstName: wklDetail.childGivenName.trim(),
        lastName: wklDetail.childSurName.trim(),
        gender: this.mapWeeklyFileGender(wklDetail.childSex.trim()),
        dateOfBirth: parseWklDate(wklDetail.childBirthDate.trim()),
        ...(wklDetail.childBirthCity.trim() && {
          birthCity: wklDetail.childBirthCity.trim(),
        }),
        ...(wklDetail.childBirthProv.trim() && {
          birthProvince: wklDetail.childBirthProv.trim(),
        }),
        ...(birthCountry === 'CA'
          ? {
              OR: [{ birthCountry: 'CA' }, { birthCountry: '' }, { birthCountry: null }],
            }
          : {
              birthCountry,
            }),
      },
      select: { id: true, din: true, csaStatus: true, caseNumber: true },
    })

    if (detailMatches.length === 1) return detailMatches[0]

    if (detailMatches.length > 1) {
      this.logger.warn(
        `WKL contact match: multiple contacts (${detailMatches.length}) for ` +
          `${wklDetail.childGivenName.trim()} ${wklDetail.childSurName.trim()}, skipping`,
      )
      return null
    }

    return null
  }

  buildWklMatchingSnapshot(detail: DetailRecord04): CraMatchingSnapshot {
    return {
      childGivenName: detail.childGivenName.trim(),
      childSurName: detail.childSurName.trim(),
      childSex: detail.childSex.trim(),
      childBirthDate: detail.childBirthDate.trim(),
      childBirthCity: detail.childBirthCity.trim(),
      childBirthProv: detail.childBirthProv.trim(),
      childBirthCountry: detail.childBirthCountry.trim(),
      ccraDinNum: detail.childDin?.trim(),
    }
  }

  mapWeeklyFileGender(wklGender: string): string {
    switch (wklGender.trim()) {
      case 'M':
        return 'Man/Boy'
      case 'F':
        return 'Woman/Girl'
      default:
        return 'Man/Boy'
    }
  }
}
