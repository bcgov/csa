import { Injectable } from '@nestjs/common'
import { BatchesService, IncompleteRecord } from 'src/api/batches/batches.service'
import { PrismaService } from 'src/common/database/prisma.service'
import { AppLogger } from 'src/common/logger/app-logger'
import { CSA_STATUS } from 'src/common/state-machine/constants/csa-status.constants'

export interface AutoBatchResult {
  application: number
  cancellation: number
  onHold: number
  incomplete: IncompleteRecord[]
}

export function formatAutoBatchSummary(result: AutoBatchResult): string {
  const added = result.application + result.cancellation
  const onHoldSuffix =
    result.onHold > 0
      ? `${added > 0 ? '; ' : ''}${result.onHold} contacts auto-held due to missing CRA mandatory fields`
      : ''

  if (added > 0) {
    return `Auto-batch complete: ${result.application} application, ${result.cancellation} cancellation${onHoldSuffix}`
  }

  if (result.onHold > 0) {
    return `Auto-batch complete: ${result.onHold} contacts auto-held due to missing CRA mandatory fields`
  }

  return 'Auto-batch complete: No eligible contacts found to batch'
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
      return { application: 0, cancellation: 0, onHold: 0, incomplete: [] }
    }

    const batchResult = await this.batchesService.addContactsToPendingBatch(
      candidates.map((c) => c.contactId),
      'SYSTEM', // userId for audit trail
      'SYSTEM', // actor: SYSTEM for auto-batch
    )

    const successIds = new Set(batchResult.success)
    let application = 0
    let cancellation = 0
    for (const candidate of candidates) {
      if (!successIds.has(candidate.contactId)) continue
      if (candidate.kind === 'application') application++
      else cancellation++
    }

    const onHold = batchResult.incomplete.length
    const summary = formatAutoBatchSummary({
      application,
      cancellation,
      onHold,
      incomplete: batchResult.incomplete,
    })

    this.logger.log(`${summary} (batch ${batchResult.batch.id})`)

    return {
      application,
      cancellation,
      onHold,
      incomplete: batchResult.incomplete,
    }
  }
}
