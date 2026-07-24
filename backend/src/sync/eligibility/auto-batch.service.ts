import { Injectable } from '@nestjs/common'
import { BatchesService } from 'src/api/batches/batches.service'
import { PrismaService } from 'src/common/database/prisma.service'
import { AppLogger } from 'src/common/logger/app-logger'
import { JobActivityType } from 'src/jobs/enums/job-activity-type.enum'
import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'

export interface AutoBatchResult {
  application: number
  cancellation: number
}

type AutoBatchCandidate = {
  contactId: number
  kind: 'application' | 'cancellation'
}

/*
 * Finds all contacts in eligible or not_eligible_in_pay status and adds them
 * to the pending batch via BatchesService (same path as the UI). Triggered
 * independently — not chained from eligibility.
 */
@Injectable()
export class AutoBatchService {
  private readonly logger = new AppLogger(AutoBatchService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly batchesService: BatchesService,
  ) {}

  async run(): Promise<AutoBatchResult> {
    const contacts = await this.prisma.contact.findMany({
      where: {
        csaStatus: { in: [CSA_STATUS.ELIGIBLE, CSA_STATUS.NOT_ELIGIBLE_IN_PAY] },
      },
      select: { id: true, csaStatus: true },
    })

    const candidates: AutoBatchCandidate[] = contacts.map((contact) => ({
      contactId: contact.id,
      kind:
        contact.csaStatus === CSA_STATUS.ELIGIBLE
          ? ('application' as const)
          : ('cancellation' as const),
    }))

    const applicationCandidates = candidates.filter((c) => c.kind === 'application').length
    const cancellationCandidates = candidates.filter((c) => c.kind === 'cancellation').length

    this.logger.log(
      `Auto-batch candidates: ${applicationCandidates} application, ${cancellationCandidates} cancellation`,
    )

    if (candidates.length === 0) {
      return { application: 0, cancellation: 0 }
    }

    const result = await this.batchesService.addContactsToPendingBatch(
      candidates.map((c) => c.contactId),
      'SYSTEM', // userId for audit trail
      'SYSTEM', // actor: SYSTEM for auto-batch
    )

    const successIds = new Set(result.success)
    let application = 0
    let cancellation = 0
    for (const candidate of candidates) {
      if (!successIds.has(candidate.contactId)) continue
      if (candidate.kind === 'application') application++
      else cancellation++
    }

    if (result.skipped.length > 0) {
      this.logger.activityWarn(
        `Auto-batch skipped ${result.skipped.length} contacts (batch ${result.batch.id})`,
        {
          activityType: JobActivityType.BATCH,
          related: `${result.skipped.length} contacts skipped during auto-batch (batch ${result.batch.id})`,
        },
      )
    }

    if (result.incomplete.length > 0) {
      this.logger.log(
        `Auto-batch Records Validation: ${result.incomplete.length} contacts auto-held due to missing CRA mandatory fields (batch ${result.batch.id})`,
      )
    }

    this.logger.log(
      `Auto-batched ${application} application + ${cancellation} cancellation contacts into batch ${result.batch.id}`,
    )

    return { application, cancellation }
  }
}
