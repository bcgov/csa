import { Injectable } from '@nestjs/common'
import type { Batch, Contact, ContactBatchDetail } from '@prisma/client'
import { BatchesService } from 'src/api/batches/batches.service'
import { ContactsService } from 'src/api/contacts/contacts.service'
import { PrismaService } from 'src/common/database/prisma.service'
import {
  BATCH_DETAIL_STATUS,
  BATCH_EVENT,
  BATCH_STATUS,
  CSA_EVENT,
} from 'src/common/state-machine/constants'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { OutboundDataService } from '../outbound/outbound-data.service'
import { OutboundFileService } from '../outbound/outbound-file.service'
import { OutboundTransferService } from '../outbound/outbound-transfer.service'

const { DESTINATION_ID, FILE_DIRECTION, UPDATED_BY } = CRA_DATA_HANDLING_CONSTANT

@Injectable()
export class SendCraFileHandler extends BaseJob {
  readonly jobType = JobType.SEND_CRA_FILE

  private batch: Batch | null = null
  private batchDetails: (ContactBatchDetail & { contact: Contact })[] = []

  constructor(
    private readonly prisma: PrismaService,
    private readonly batchesService: BatchesService,
    private readonly contactsService: ContactsService,
    private readonly outboundDataService: OutboundDataService,
    private readonly outboundFileService: OutboundFileService,
    private readonly outboundTransferService: OutboundTransferService,
  ) {
    super()
  }

  async onStart(context: JobContext): Promise<void> {
    await super.onStart(context)

    // 1. Find actionable batch (system_error prioritized for retry, then pending)
    this.batch = await this.prisma.batch.findFirst({
      where: { status: { in: [BATCH_STATUS.SYSTEM_ERROR, BATCH_STATUS.PENDING] } },
      orderBy: { createdAt: 'asc' },
    })

    if (!this.batch) {
      this.logger.log('No actionable batch found')
      return
    }

    // 2. Get batch details with contacts
    this.batchDetails = await this.prisma.contactBatchDetail.findMany({
      where: { batchId: this.batch.id },
      include: { contact: true },
    })

    if (this.batchDetails.length === 0) {
      this.logger.log(`Batch ${this.batch.id} has no contacts`)
      return
    }

    // 3. Transition batch → in_progress
    await this.batchesService.updateBatchStatus(this.batch.id, BATCH_EVENT.SEND_TO_CRA)

    // 4. Transition batch details → in_progress (skip if already in_progress on retry)
    for (const detail of this.batchDetails) {
      if (detail.status !== BATCH_DETAIL_STATUS.IN_PROGRESS) {
        await this.batchesService.updateBatchDetailStatus(detail.id, BATCH_EVENT.SEND_TO_CRA)
      }
    }
  }

  async execute(_context: JobContext): Promise<JobResult> {
    if (!this.batch || this.batchDetails.length === 0) {
      return { success: true, message: 'No batch to process' }
    }

    // 5. Build CRA file data
    const { header, details, trailer } = this.outboundDataService.buildCraFileData(
      this.batchDetails,
    )

    // 6. Create file on local storage
    const { filePath, fileName, recordCount } = this.outboundFileService.createFile(
      header,
      details,
      trailer,
      DESTINATION_ID,
    )

    // 7. Transfer file
    await this.outboundTransferService.sendFileToTransferService(filePath, fileName, DESTINATION_ID)

    // 10. Create TransferFile record
    await this.prisma.transferFile.create({
      data: {
        batchId: this.batch.id,
        destinationId: DESTINATION_ID,
        direction: FILE_DIRECTION.OUTBOUND,
        fileName,
        deliveredAt: new Date(),
        referenceNumbers: this.batchDetails
          .map((d) => d.referenceNumber)
          .filter(Boolean) as string[],
      },
    })

    this.logger.log(
      `Batch ${this.batch.id}: file ${fileName} sent, ${this.batchDetails.length} contacts updated`,
    )

    return {
      success: true,
      message: `Batch ${this.batch.id} sent to CRA`,
      metadata: {
        batch_id: this.batch.id,
        file_path: filePath,
        record_count: recordCount,
        contacts_count: this.batchDetails.length,
      },
    }
  }

  async onSuccess(context: JobContext, result: JobResult): Promise<void> {
    await super.onSuccess(context, result)

    if (!this.batch) return

    // 8. Update contact CSA statuses
    for (const detail of this.batchDetails) {
      await this.contactsService.updateCsaStatus(
        detail.contactId,
        CSA_EVENT.SEND_TO_CRA,
        UPDATED_BY.SYSTEM,
      )
    }

    // 9. Set batchDate
    await this.prisma.batch.update({
      where: { id: this.batch.id },
      data: { batchDate: new Date() },
    })
  }

  async onFailure(context: JobContext, error: Error): Promise<void> {
    await super.onFailure(context, error)

    if (this.batch) {
      this.logger.error(`File transfer failed for batch ${this.batch.id}`, error)
      await this.batchesService.updateBatchStatus(this.batch.id, BATCH_EVENT.SEND_FAILED)
      // TODO: Revert each contact's CSA status via CRA_FILE_REJECTED
      // State transition to confirm
    }
  }
}
