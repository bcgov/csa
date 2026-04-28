import { Injectable } from '@nestjs/common'
import { AppLogger } from 'src/common/logger/app-logger'
import { TRANSACTION_TYPES } from 'src/api/contacts/constants'
import { PrismaService } from 'src/common/database/prisma.service'
import { BATCH_STATUS } from 'src/common/state-machine/constants/batch-status.constants'
import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'

export interface AutoBatchResult {
  application: number
  cancellation: number
}

/*
 * Finds all contacts in eligible or not_eligible_in_pay status and adds them
 * to the pending batch. Triggered independently — not chained from eligibility.
 */
@Injectable()
export class AutoBatchService {
  private readonly logger = new AppLogger(AutoBatchService.name)

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<AutoBatchResult> {
    const rows = await this.prisma.$queryRawUnsafe<{ person_id_icm: string; csa_status: string }[]>(
      `SELECT person_id_icm, csa_status FROM contacts WHERE csa_status = ANY($1)`,
      [CSA_STATUS.ELIGIBLE, CSA_STATUS.NOT_ELIGIBLE_IN_PAY],
    )
    const applicationPersonIds = rows
      .filter((r) => r.csa_status === CSA_STATUS.ELIGIBLE)
      .map((r) => r.person_id_icm)
    const cancellationPersonIds = rows
      .filter((r) => r.csa_status === CSA_STATUS.NOT_ELIGIBLE_IN_PAY)
      .map((r) => r.person_id_icm)

    this.logger.log(
      `Auto-batch candidates: ${applicationPersonIds.length} application, ${cancellationPersonIds.length} cancellation`,
    )

    if (applicationPersonIds.length === 0 && cancellationPersonIds.length === 0) {
      return { application: 0, cancellation: 0 }
    }

    const allPersonIds = [...applicationPersonIds, ...cancellationPersonIds]

    const contactRows = await this.prisma.$queryRawUnsafe<{ id: number; person_id_icm: string }[]>(
      `SELECT id, person_id_icm FROM contacts WHERE person_id_icm = ANY($1)`,
      allPersonIds,
    )
    const idMap = new Map(contactRows.map((row) => [row.person_id_icm, row.id]))

    const [existingBatch] = await this.prisma.$queryRawUnsafe<{ id: number }[]>(
      `SELECT id FROM batches WHERE status = $1 LIMIT 1`,
      BATCH_STATUS.PENDING,
    )
    let batchId: number
    if (existingBatch) {
      batchId = existingBatch.id
    } else {
      const [newBatch] = await this.prisma.$queryRawUnsafe<{ id: number }[]>(
        `INSERT INTO batches (batch_date, status, record_count, created_at, updated_at)
         VALUES (CURRENT_DATE, $1, 0, NOW(), NOW()) RETURNING id`,
        BATCH_STATUS.PENDING,
      )
      batchId = newBatch.id
    }

    const allDbIds = allPersonIds
      .map((pid) => idMap.get(pid))
      .filter((id): id is number => id != null)
    const alreadyInBatch = await this.prisma.$queryRawUnsafe<{ contact_id: number }[]>(
      `SELECT contact_id FROM contact_batch_details
       WHERE batch_id = $1 AND contact_id = ANY($2)`,
      batchId,
      allDbIds,
    )
    const alreadyInBatchIds = new Set(alreadyInBatch.map((row) => row.contact_id))

    const contactIds: number[] = []
    const batchIds: number[] = []
    const transactionTypes: string[] = []
    const statuses: string[] = []
    const systemComments: (string | null)[] = []
    const createdBys: string[] = []
    const lastUpdatedBys: string[] = []

    const applicationSet = new Set(applicationPersonIds)

    for (const personIdIcm of allPersonIds) {
      const contactId = idMap.get(personIdIcm)
      if (!contactId || alreadyInBatchIds.has(contactId)) continue

      contactIds.push(contactId)
      batchIds.push(batchId)
      transactionTypes.push(
        applicationSet.has(personIdIcm)
          ? TRANSACTION_TYPES.APPLICATION
          : TRANSACTION_TYPES.CANCELLATION,
      )
      statuses.push(BATCH_STATUS.PENDING)
      systemComments.push(null)
      createdBys.push('SYSTEM')
      lastUpdatedBys.push('SYSTEM')
    }

    if (contactIds.length === 0) {
      return { application: 0, cancellation: 0 }
    }

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO contact_batch_details
         (contact_id, batch_id, transaction_type, status, system_comments,
          created_at, created_by, last_updated_at, last_updated_by)
       SELECT * FROM unnest(
         $1::int[], $2::int[], $3::text[], $4::text[], $5::text[],
         $6::timestamptz[], $7::text[], $8::timestamptz[], $9::text[]
       )`,
      contactIds,
      batchIds,
      transactionTypes,
      statuses,
      systemComments,
      contactIds.map(() => new Date()),
      createdBys,
      contactIds.map(() => new Date()),
      lastUpdatedBys,
    )

    await this.prisma.$executeRawUnsafe(
      `UPDATE contact_batch_details cbd
       SET reference_number = COALESCE(c.case_number, '') || '-' || cbd.id
       FROM contacts c
       WHERE cbd.batch_id = $1
         AND cbd.reference_number IS NULL
         AND c.id = cbd.contact_id`,
      batchId,
    )

    const appDbIds = contactIds.filter(
      (_, i) => transactionTypes[i] === TRANSACTION_TYPES.APPLICATION,
    )
    const cancelDbIds = contactIds.filter(
      (_, i) => transactionTypes[i] === TRANSACTION_TYPES.CANCELLATION,
    )

    if (appDbIds.length > 0) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE contacts SET
           csa_status = $1,
           pre_batch_status = $3,
           csa_status_effective_date = NOW(),
           icm_integration_status = true,
           last_updated_at = NOW(),
           last_updated_by = 'SYSTEM'
         WHERE id = ANY($2)`,
        CSA_STATUS.IN_BATCH_APPLICATION,
        appDbIds,
        CSA_STATUS.ELIGIBLE,
      )
    }

    if (cancelDbIds.length > 0) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE contacts SET
           csa_status = $1,
           pre_batch_status = $3,
           csa_status_effective_date = NOW(),
           icm_integration_status = true,
           last_updated_at = NOW(),
           last_updated_by = 'SYSTEM'
         WHERE id = ANY($2)`,
        CSA_STATUS.IN_BATCH_CANCELLATION,
        cancelDbIds,
        CSA_STATUS.NOT_ELIGIBLE_IN_PAY,
      )
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE batches SET record_count = record_count + $1 WHERE id = $2`,
      contactIds.length,
      batchId,
    )

    this.logger.log(
      `Auto-batched ${appDbIds.length} application + ${cancelDbIds.length} cancellation contacts into batch ${batchId}`,
    )

    return { application: appDbIds.length, cancellation: cancelDbIds.length }
  }
}
