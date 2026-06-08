import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/common/database/prisma.service'
import { BATCH_DETAIL_STATUS } from 'src/common/state-machine/constants/batch-detail-status.constants'
import { BATCH_STATUS } from 'src/common/state-machine/constants/batch-status.constants'
import { AppLogger } from 'src/common/logger/app-logger'
import { normalize, parseWklDate } from 'src/common/utils'
import { CraMatchingSnapshot } from './cra-matching-snapshot.interface'
import { DetailRecord04 } from './inbound-weekly.interface'

const ACTIVE_BATCH_STATUSES = [BATCH_STATUS.IN_PROGRESS, BATCH_STATUS.PARTIALLY_PROCESSED]

const equalsIgnoreCase = (a: string | null | undefined, b: string | null | undefined): boolean =>
  normalize(a ?? '') === normalize(b ?? '')

const insensitiveEquals = (value: string) => ({
  equals: value.trim(),
  mode: 'insensitive' as const,
})

const isCanadaCountryCode = (country: string | null | undefined): boolean => {
  const normalized = normalize(country ?? '')
  return normalized === 'CA' || normalized === 'CANADA'
}

const equalsCountryCode = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (isCanadaCountryCode(a) && isCanadaCountryCode(b)) return true
  return equalsIgnoreCase(a, b)
}

// CRA's "First Name" field is either:
//   A) our FirstName alone — Initial field (if present) must equal first char of our MiddleName
//   B) our FirstName + " " + our MiddleName — Initial field is unused
const matchesGivenName = (
  wklGivenName: string,
  wklInitial: string,
  firstName: string | null | undefined,
  middleName: string | null | undefined,
): boolean => {
  const wklGiven = wklGivenName.trim()
  const wklInit = wklInitial.trim()
  const fn = firstName ?? ''
  const mn = middleName ?? ''

  if (equalsIgnoreCase(wklGiven, fn)) {
    return !wklInit || equalsIgnoreCase(mn.charAt(0), wklInit)
  }
  return mn !== '' && equalsIgnoreCase(wklGiven, `${fn} ${mn}`)
}

interface WklChildDetails {
  childDin: string
  childGivenName: string
  childInitial: string
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
        matchesGivenName(
          wklDetail.childGivenName,
          wklDetail.childInitial,
          snap.childGivenName,
          snap.childMiddleName,
        ) &&
        equalsIgnoreCase(snap.childSurName, wklDetail.childSurName) &&
        equalsIgnoreCase(snap.childSex, wklDetail.childSex) &&
        snap.childBirthDate === wklDetail.childBirthDate.trim() &&
        equalsIgnoreCase(snap.childBirthCity, wklDetail.childBirthCity) &&
        equalsIgnoreCase(snap.childBirthProv, wklDetail.childBirthProv) &&
        equalsCountryCode(snap.childBirthCountry, wklDetail.childBirthCountry)
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
    const wklGiven = wklDetail.childGivenName.trim()
    const wklInit = wklDetail.childInitial?.trim() ?? ''
    const spaceIdx = wklGiven.indexOf(' ')
    const combinedFirst = spaceIdx >= 0 ? wklGiven.slice(0, spaceIdx) : ''
    const combinedMiddle = spaceIdx >= 0 ? wklGiven.slice(spaceIdx + 1).trim() : ''

    const namePatterns: Prisma.ContactWhereInput[] = [
      // Pattern A: WKL FirstName === our firstName; Initial (if present) must equal middleName[0]
      {
        firstName: insensitiveEquals(wklGiven),
        ...(wklInit && { middleName: { startsWith: wklInit, mode: 'insensitive' } }),
      },
    ]
    if (combinedMiddle) {
      // Pattern B: WKL FirstName === our firstName + " " + middleName
      namePatterns.push({
        firstName: insensitiveEquals(combinedFirst),
        middleName: insensitiveEquals(combinedMiddle),
      })
    }

    const isCanada = isCanadaCountryCode(wklDetail.childBirthCountry)
    const detailMatches = await this.prisma.contact.findMany({
      where: {
        AND: [
          { OR: namePatterns },
          isCanada
            ? { OR: [{ birthCountry: 'CA' }, { birthCountry: '' }, { birthCountry: null }] }
            : {
                NOT: {
                  OR: [{ birthCountry: 'CA' }, { birthCountry: '' }, { birthCountry: null }],
                },
              },
        ],
        lastName: insensitiveEquals(wklDetail.childSurName),
        gender: this.mapWeeklyFileGender(wklDetail.childSex.trim()),
        dateOfBirth: parseWklDate(wklDetail.childBirthDate.trim()),
        ...(wklDetail.childBirthCity.trim() && {
          birthCity: insensitiveEquals(wklDetail.childBirthCity),
        }),
        ...(wklDetail.childBirthProv.trim() && {
          birthProvince: insensitiveEquals(wklDetail.childBirthProv),
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

  mapWeeklyFileGender(wklGender: string): string | { in: string[] } | null {
    switch (normalize(wklGender)) {
      case 'M':
        return 'Man/Boy'
      case 'F':
        return 'Woman/Girl'
      default:
        return { in: ['Unknown', 'Non-Binary'] }
    }
  }
}
