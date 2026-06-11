import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/common/database/prisma.service'
import { PROTECTED_STATUSES } from '../eligibility/eligibility.config'
import { buildFindIcmCsaDriftSql, IcmInboundCsaDriftRow } from './icm-inbound-csa-sync.queries'

export const ICM_INBOUND_SYNC_ACTOR = 'ICM_INBOUND_SYNC'

export interface IcmInboundCsaSyncResult {
  candidates: number
  updated: number
  skipped: number
}

@Injectable()
export class IcmInboundCsaSyncService {
  private readonly logger = new Logger(IcmInboundCsaSyncService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Applies ICM case CSA field corrections to the CSA master when ICM differs
   * and the contact is not queued for outbound sync (icm_integration_status).
   */
  async syncFromStaging(since: Date | null): Promise<IcmInboundCsaSyncResult | null> {
    if (!since) {
      this.logger.log('Skipping ICM inbound CSA sync: no incremental threshold (full load)')
      return null
    }

    const sql = buildFindIcmCsaDriftSql()
    const rows = await this.prisma.$queryRawUnsafe<IcmInboundCsaDriftRow[]>(sql, since)

    if (rows.length === 0) {
      this.logger.log('No ICM CSA field drift detected')
      return { candidates: 0, updated: 0, skipped: 0 }
    }

    this.logger.log(`Found ${rows.length} contacts with ICM CSA field drift`)

    let updated = 0
    let skipped = 0

    for (const row of rows) {
      try {
        await this.applyDrift(row)
        updated++
      } catch (error) {
        skipped++
        if (isPersonIdIcmUniqueViolation(error)) {
          this.logger.warn(
            `Skipping ICM CSA drift for contact ${row.contactId} (case ${row.caseNumber}): ` +
              `person_id_icm '${row.personIdIcm}' already exists on another contact`,
          )
          continue
        }
        this.logger.warn(
          `Failed to apply ICM CSA drift for contact ${row.contactId} (case ${row.caseNumber}): ` +
            `${(error as Error).message}`,
        )
      }
    }

    this.logger.log(`ICM inbound CSA sync: ${updated} updated, ${skipped} skipped`)

    return { candidates: rows.length, updated, skipped }
  }

  private async applyDrift(row: IcmInboundCsaDriftRow): Promise<void> {
    const statusProtected = isProtectedCsaStatus(row.currentCsaStatus)

    const data: Record<string, unknown> = {
      personIdIcm: row.personIdIcm,
      contactIdIcm: row.contactIdIcm,
      lastUpdatedAt: new Date(),
      lastUpdatedBy: ICM_INBOUND_SYNC_ACTOR,
    }

    data.din = row.din
    if (!statusProtected) {
      data.csaStatus = row.csaStatus
      data.csaStatusEffectiveDate = row.csaStatusEffectiveDate
    } else if (row.csaStatus !== row.currentCsaStatus) {
      this.logger.warn(
        `Preserving protected CSA status '${row.currentCsaStatus}' for contact ${row.contactId} ` +
          `(case ${row.caseNumber}); ICM has '${row.csaStatus ?? ''}'`,
      )
    }
    data.csaSentDate = row.csaSentDate

    await this.prisma.contact.update({
      where: { id: row.contactId },
      data,
    })
  }
}

function isProtectedCsaStatus(status: string | null): boolean {
  return !!status && (PROTECTED_STATUSES as readonly string[]).includes(status)
}

function isPersonIdIcmUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false
  }
  const target = error.meta?.target
  if (Array.isArray(target)) {
    return target.includes('person_id_icm')
  }
  if (typeof target === 'string') {
    return target.includes('person_id_icm')
  }
  // Prisma does not always include the column name; person_id_icm is the only
  // unique constraint this update can violate.
  return true
}
