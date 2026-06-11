import { Injectable } from '@nestjs/common'
import { TRANSACTION_TYPES } from 'src/api/contacts/constants'
import { PrismaService } from 'src/common/database/prisma.service'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'

/** One-time backfill to populate effectiveDate and cancelReasonCode on existing batch details (User Story 39432). */
@Injectable()
export class BackfillBatchEffectiveDateReasonHandler extends BaseJob {
  readonly jobType = JobType.BACKFILL_BATCH_EFFECTIVE_DATE_REASON

  constructor(private readonly prisma: PrismaService) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    this.logger.log('Starting backfill of effective date and cancellation reason for batch details')

    // Find all batch details where effectiveDate is null (not yet backfilled)
    const batchDetails = await this.prisma.contactBatchDetail.findMany({
      where: {
        effectiveDate: null,
      },
      include: {
        contact: {
          select: {
            effectiveDate: true,
            careEndDate: true,
            cancelReasonCode: true,
          },
        },
      },
    })

    if (batchDetails.length === 0) {
      return {
        success: true,
        message: 'No batch details to backfill',
        metadata: { recordsProcessed: 0 },
      }
    }

    this.logger.log(`Found ${batchDetails.length} batch details to backfill`)

    let updatedCount = 0
    let skippedCount = 0

    for (const detail of batchDetails) {
      try {
        // Determine effective date based on transaction type
        const effectiveDate =
          detail.transactionType === TRANSACTION_TYPES.CANCELLATION
            ? detail.contact.careEndDate
            : detail.contact.effectiveDate

        // Determine cancellation reason (only for cancellations)
        const cancelReasonCode =
          detail.transactionType === TRANSACTION_TYPES.CANCELLATION
            ? detail.contact.cancelReasonCode
            : null

        await this.prisma.contactBatchDetail.update({
          where: { id: detail.id },
          data: {
            effectiveDate,
            cancelReasonCode,
          },
        })

        updatedCount++

        if (updatedCount % 100 === 0) {
          this.logger.log(`Backfilled ${updatedCount} of ${batchDetails.length} batch details`)
        }
      } catch (error) {
        this.logger.error(
          `Failed to backfill batch detail ${detail.id}: ${(error as Error).message}`,
        )
        skippedCount++
      }
    }

    const message = `Backfill complete: ${updatedCount} updated, ${skippedCount} skipped`
    this.logger.log(message)

    return {
      success: true,
      message,
      metadata: {
        recordsProcessed: batchDetails.length,
        updated: updatedCount,
        skipped: skippedCount,
      },
    }
  }
}
