import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'
import { CSA_STATUS_LABELS } from 'src/common/state-machine/constants/csa-status.constants'
import { IcmContactUpdatePayload, IcmDataSource } from './data-source/icm-data-source'
import { formatDateTimePacific } from 'src/common/utils'

const ICM_BATCH_SIZE = 100

export interface SyncBackResult {
  totalFlagged: number
  synced: number
  failed: number
  chunks: number
}

@Injectable()
export class IcmSyncBackService {
  private readonly logger = new Logger(IcmSyncBackService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly icmDataSource: IcmDataSource,
  ) {}

  async hasFlaggedContacts(): Promise<boolean> {
    const found = await this.prisma.contact.findFirst({
      where: { icmIntegrationStatus: true },
      select: { id: true },
    })
    return found !== null
  }

  async syncFlaggedContacts(): Promise<SyncBackResult> {
    const flagged = await this.prisma.contact.findMany({
      where: { icmIntegrationStatus: true },
      select: {
        id: true,
        contactIdIcm: true,
        csaStatus: true,
        csaStatusEffectiveDate: true,
        din: true,
        csaSentDate: true,
      },
    })

    if (flagged.length === 0) {
      this.logger.log('No contacts flagged for ICM sync')
      return { totalFlagged: 0, synced: 0, failed: 0, chunks: 0 }
    }

    this.logger.log(`Found ${flagged.length} contacts flagged for ICM sync`)

    let synced = 0
    let failed = 0
    let chunks = 0

    for (let i = 0; i < flagged.length; i += ICM_BATCH_SIZE) {
      const chunk = flagged.slice(i, i + ICM_BATCH_SIZE)
      chunks++

      const payloads = chunk.map((contact) => this.toPayload(contact))

      try {
        await this.icmDataSource.updateContacts(payloads)

        const ids = chunk.map((c) => c.id)
        await this.prisma.contact.updateMany({
          where: { id: { in: ids } },
          data: { icmIntegrationStatus: false },
        })

        synced += chunk.length
        this.logger.log(`Chunk ${chunks}: synced ${chunk.length} contacts`)
      } catch (error) {
        failed += chunk.length
        this.logger.error(
          `Chunk ${chunks}: failed to sync ${chunk.length} contacts: ${(error as Error).message}`,
        )
      }
    }

    return { totalFlagged: flagged.length, synced, failed, chunks }
  }

  async syncFlaggedWithRetry(): Promise<SyncBackResult | null> {
    if (!(await this.hasFlaggedContacts())) return null

    this.logger.log('Syncing flagged contacts back to ICM...')
    let result = await this.syncFlaggedContacts()

    if (result.failed > 0) {
      this.logger.warn(
        `ICM sync-back partial failure: ${result.synced} synced, ${result.failed} failed. Retrying...`,
      )
      result = await this.syncFlaggedContacts()

      if (result.failed > 0) {
        this.logger.warn(
          `ICM sync-back retry still has failures: ${result.synced} synced, ${result.failed} failed`,
        )
      }
    }

    return result
  }

  async syncSingleContact(contactId: number): Promise<boolean> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        contactIdIcm: true,
        csaStatus: true,
        csaStatusEffectiveDate: true,
        din: true,
        csaSentDate: true,
      },
    })

    if (!contact) {
      this.logger.warn(`Contact ${contactId} not found for immediate sync`)
      return false
    }

    try {
      await this.icmDataSource.updateContacts([this.toPayload(contact)])

      await this.prisma.contact.update({
        where: { id: contactId },
        data: { icmIntegrationStatus: false },
      })

      this.logger.log(`Immediately synced contact ${contactId} to ICM`)
      return true
    } catch (error) {
      this.logger.warn(
        `Immediate sync failed for contact ${contactId}: ${(error as Error).message}. Flag stays true for batch pickup.`,
      )
      return false
    }
  }

  private toPayload(contact: {
    contactIdIcm: string | null
    csaStatus: string | null
    csaStatusEffectiveDate: Date | null
    din: string | null
    csaSentDate: Date | null
  }): IcmContactUpdatePayload {
    return {
      Id: contact.contactIdIcm ?? '',
      'CSA Status': contact.csaStatus
        ? (CSA_STATUS_LABELS[contact.csaStatus] ?? contact.csaStatus)
        : '',
      'CSA Status Effective Date': contact.csaStatusEffectiveDate
        ? formatDateTimePacific(contact.csaStatusEffectiveDate)
        : '',
      'CSA DIN': contact.din ?? null,
      'CSA Sent Date': contact.csaSentDate ? formatDateTimePacific(contact.csaSentDate) : null,
    }
  }
}
