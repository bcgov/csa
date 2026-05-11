import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { readFile } from 'fs/promises'
import { appendSystemComment, pacificToday } from 'src/common/utils'
import type { Batch, Contact, ContactBatchDetail } from '@prisma/client'
import { Prisma } from '@prisma/client'
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
import { IcmSyncBackService } from 'src/sync/icm/icm-sync-back.service'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { OutboundDataService } from '../outbound/outbound-data.service'
import { OutboundFileService } from '../outbound/outbound-file.service'
import { CraTransferService } from '../transfer/cra-transfer.service'

const { DESTINATION_ID, FILE_DIRECTION, UPDATED_BY } = CRA_DATA_HANDLING_CONSTANT

@Injectable()
export class SendCraFileHandler extends BaseJob {
  readonly jobType = JobType.SEND_CRA_FILE

  private batch: Batch | null = null
  private batchDetails: (ContactBatchDetail & { contact: Contact })[] = []
  private readonly lastSequenceNumber: number

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly batchesService: BatchesService,
    private readonly contactsService: ContactsService,
    private readonly outboundDataService: OutboundDataService,
    private readonly outboundFileService: OutboundFileService,
    private readonly craTransferService: CraTransferService,
    private readonly icmSyncBackService: IcmSyncBackService,
  ) {
    super()
    this.lastSequenceNumber = this.configService.get<number>('cra.lastSequenceNumber')!
  }

  async onStart(context: JobContext): Promise<void> {
    await super.onStart(context)

    this.batch = await this.prisma.batch.findFirst({
      where: { status: { in: [BATCH_STATUS.SYSTEM_ERROR, BATCH_STATUS.PENDING] } },
      orderBy: { createdAt: 'asc' },
    })

    if (!this.batch) {
      this.logger.log('No actionable batch found')
      return
    }

    this.batchDetails = await this.prisma.contactBatchDetail.findMany({
      where: { batchId: this.batch.id },
      include: { contact: true },
    })

    if (this.batchDetails.length === 0) {
      this.logger.log(`Batch ${this.batch.id} has no contacts`)
      return
    }

    await this.ensureBatchDetailsReady()

    await this.batchesService.updateBatchStatus(this.batch.id, BATCH_EVENT.SEND_TO_CRA)

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

    const { header, details, trailer } = this.outboundDataService.buildCraFileData(
      this.batchDetails,
    )

    const lastSequence = await this.prisma.transferFile.aggregate({
      _max: { sequenceNumber: true },
      where: { direction: FILE_DIRECTION.OUTBOUND },
    })
    const nextSequence = ((lastSequence._max.sequenceNumber ?? this.lastSequenceNumber) % 9999) + 1

    const { filePath, fileName, recordCount } = this.outboundFileService.createFile(
      header,
      details,
      trailer,
      DESTINATION_ID,
      nextSequence,
    )

    const fileBuffer = await readFile(filePath)
    await this.craTransferService.sendFile(fileName, fileBuffer)

    await this.prisma.transferFile.create({
      data: {
        batchId: this.batch.id,
        destinationId: DESTINATION_ID,
        direction: FILE_DIRECTION.OUTBOUND,
        fileName,
        deliveredAt: new Date(),
        referenceNumbers: this.batchDetails
          .map((detail) => detail.referenceNumber)
          .filter(Boolean) as string[],
        sequenceNumber: nextSequence,
      },
    })

    for (let i = 0; i < this.batchDetails.length; i++) {
      await this.prisma.contactBatchDetail.update({
        where: { id: this.batchDetails[i].id },
        data: {
          craMatchingSnapshot: this.outboundDataService.buildMatchingSnapshot(
            details[i],
          ) as unknown as Prisma.InputJsonValue,
        },
      })
    }

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

    const now = new Date()

    for (const detail of this.batchDetails) {
      await this.contactsService.updateCsaStatus(
        detail.contactId,
        CSA_EVENT.SEND_TO_CRA,
        UPDATED_BY.SYSTEM,
        { additionalData: { csaSentDate: now }, origin: 'SendCraFileHandler' },
      )
    }

    await this.prisma.batch.update({
      where: { id: this.batch.id },
      data: { batchDate: pacificToday() },
    })

    try {
      await this.icmSyncBackService.syncFlaggedWithRetry()
    } catch (err) {
      this.logger.warn(`ICM sync-back failed: ${(err as Error).message}`)
    }
  }

  private async ensureBatchDetailsReady(): Promise<void> {
    const missingRefDetails = this.batchDetails.filter((detail) => !detail.referenceNumber)
    if (missingRefDetails.length > 0) {
      this.logger.warn(
        `Batch ${this.batch!.id}: ${missingRefDetails.length} details missing referenceNumber, backfilling`,
      )
      for (const detail of missingRefDetails) {
        const caseNumber = detail.contact.caseNumber ?? ''
        const referenceNumber = `${caseNumber}-${detail.id}`
        await this.prisma.contactBatchDetail.update({
          where: { id: detail.id },
          data: { referenceNumber },
        })
        ;(detail as any).referenceNumber = referenceNumber
      }
    }
  }

  async onFailure(context: JobContext, error: Error): Promise<void> {
    await super.onFailure(context, error)

    if (this.batch) {
      this.logger.error(`File transfer failed for batch ${this.batch.id}`, error)
      const errorMessage = error.message || 'File transfer failed'
      await this.batchesService.updateBatchStatus(this.batch.id, BATCH_EVENT.SEND_FAILED, {
        additionalData: {
          systemComments: appendSystemComment(errorMessage, this.batch.systemComments),
        },
      })

      for (const detail of this.batchDetails) {
        await this.prisma.contactBatchDetail.update({
          where: { id: detail.id },
          data: {
            systemComments: appendSystemComment(errorMessage, detail.systemComments),
            lastUpdatedAt: new Date(),
            lastUpdatedBy: 'SYSTEM',
          },
        })
      }
    }
  }
}
