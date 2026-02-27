import { Injectable } from '@nestjs/common'
import { BatchesService } from 'src/api/batches/batches.service'
import { ContactsService } from 'src/api/contacts/contacts.service'
import { PrismaService } from 'src/common/database/prisma.service'
import { BATCH_DETAIL_EVENT, CSA_EVENT } from 'src/common/state-machine/constants'
import { BaseJob } from 'src/jobs/base-job'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { JobRunner } from 'src/jobs/job-runner.service'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { InboundFileService } from '../inbound/inbound-file.service'
import { InboundResponseService } from '../inbound/inbound-response.service'
import { DETAIL_OUTCOME, type CraResDetail } from '../inbound/inbound.interface'

const { DESTINATION_ID, FILE_DIRECTION, UPDATED_BY } = CRA_DATA_HANDLING_CONSTANT

/*
 * Checks for response files from CRA and processes them
 * Triggered by CronJob POLL_CRA_RESPONSE
 */
@Injectable()
export class PollCraResponseHandler extends BaseJob {
  readonly jobType = JobType.POLL_CRA_RESPONSE

  // Per-run state shared across private methods
  private processedBatchIds!: Set<number>
  private recordsAccepted!: number
  private recordsRejected!: number
  private recordsRecycled!: number

  constructor(
    private readonly inboundFileService: InboundFileService,
    private readonly inboundResponseService: InboundResponseService,
    private readonly prisma: PrismaService,
    private readonly batchesService: BatchesService,
    private readonly contactsService: ContactsService,
    private readonly jobRunner: JobRunner,
  ) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    // shares across all the retries
    this.processedBatchIds = new Set<number>()
    this.recordsAccepted = 0
    this.recordsRejected = 0
    this.recordsRecycled = 0

    // download, validate, track in DB
    await this.inboundFileService.downloadNewResponseFiles(DESTINATION_ID)

    // newly downloaded + any previously failed
    const unprocessedResponseFiles = await this.prisma.transferFile.findMany({
      where: { direction: FILE_DIRECTION.INBOUND, isDetailsProcessed: false, isValid: true },
    })

    if (unprocessedResponseFiles.length === 0) {
      return {
        success: true,
        message: 'No new CRA response files to process',
        metadata: { files_processed: 0, records_updated: 0 },
      }
    }

    let totalRecordsProcessed = 0
    for (const responseFile of unprocessedResponseFiles) {
      totalRecordsProcessed += await this.processResponseFile(responseFile)
    }

    // set bacth status based on batch details record
    for (const batchId of this.processedBatchIds) {
      await this.batchesService.aggregateBatchStatus(batchId)
    }

    // Fire sync flagged contacts to ICM Job
    if (this.recordsAccepted + this.recordsRejected > 0) {
      this.jobRunner.runJobType(JobType.SYNC_ICM, JobTrigger.SYSTEM).catch((err) => {
        this.logger.warn(`Post-CRA ICM sync failed: ${(err as Error).message}`)
      })
    }

    const totalUpdated = this.recordsAccepted + this.recordsRejected
    return {
      success: true,
      message: `Processed ${totalRecordsProcessed} CRA response records from ${unprocessedResponseFiles.length} file(s)`,
      metadata: {
        files_processed: unprocessedResponseFiles.length,
        records_updated: totalUpdated,
        records_accepted: this.recordsAccepted,
        records_rejected: this.recordsRejected,
        records_recycled: this.recordsRecycled,
      },
    }
  }

  private async processResponseFile(responseFile: {
    id: number
    fileName: string
  }): Promise<number> {
    const localFilePath = this.inboundFileService.getLocalFilePath(
      DESTINATION_ID,
      responseFile.fileName,
    )

    let parsed: ReturnType<InboundResponseService['parseFile']>
    try {
      parsed = this.inboundResponseService.parseFile(localFilePath)
    } catch (error) {
      this.logger.error(`Failed to parse response file ${responseFile.fileName}: ${error}`)
      await this.prisma.transferFile.update({
        where: { id: responseFile.id },
        data: { isValid: false, isDetailsProcessed: true },
      })
      return 0
    }

    const { header, details } = parsed

    this.logger.log(
      `Parsed ${responseFile.fileName}: ${details.length} detail records, header recordCount=${header.recordCount}`,
    )

    for (const detail of details) {
      await this.processResponseDetail(detail)
    }

    await this.prisma.transferFile.update({
      where: { id: responseFile.id },
      data: {
        isDetailsProcessed: true,
        deliveredAt: new Date(),
        referenceNumbers: details.map((d) => d.referenceNum),
      },
    })

    return details.length
  }

  private async processResponseDetail(detail: CraResDetail): Promise<void> {
    const batchDetail = await this.prisma.contactBatchDetail.findUnique({
      where: { referenceNumber: detail.referenceNum },
      select: {
        id: true,
        contactId: true,
        batchId: true,
        systemComments: true,
      },
    })

    if (!batchDetail) {
      this.logger.warn(`Batch detail not found for referenceNum ${detail.referenceNum}`)
      return
    }

    this.processedBatchIds.add(batchDetail.batchId)

    const { outcome, systemComments, din } = this.inboundResponseService.classifyDetail(
      detail,
      batchDetail.systemComments,
    )

    if (outcome === DETAIL_OUTCOME.ACCEPTED) {
      await this.batchesService.updateBatchDetailStatus(
        batchDetail.id,
        BATCH_DETAIL_EVENT.CRA_ACCEPTED,
        {
          additionalData: { systemComments },
        },
      )

      const additionalData: Record<string, unknown> = {}
      if (din) {
        const contact = await this.prisma.contact.findUnique({
          where: { id: batchDetail.contactId },
          select: { din: true },
        })
        if (!contact?.din) {
          additionalData.din = din
        }
      }

      await this.contactsService.updateCsaStatus(
        batchDetail.contactId,
        CSA_EVENT.CRA_ACCEPTED,
        UPDATED_BY.SYSTEM,
        { additionalData },
      )
      this.recordsAccepted++
    } else if (outcome === DETAIL_OUTCOME.FILE_ERROR) {
      await this.batchesService.updateBatchDetailStatus(
        batchDetail.id,
        BATCH_DETAIL_EVENT.CRA_FILE_REJECTED,
        {
          additionalData: { systemComments },
        },
      )
      await this.contactsService.updateCsaStatus(
        batchDetail.contactId,
        CSA_EVENT.CRA_FILE_REJECTED,
        UPDATED_BY.SYSTEM,
      )
      this.recordsRejected++
    } else if (outcome === DETAIL_OUTCOME.REJECTED) {
      await this.batchesService.updateBatchDetailStatus(
        batchDetail.id,
        BATCH_DETAIL_EVENT.CRA_RECORD_REJECTED,
        {
          additionalData: { systemComments },
        },
      )
      await this.contactsService.updateCsaStatus(
        batchDetail.contactId,
        CSA_EVENT.CRA_RECORD_REJECTED,
        UPDATED_BY.SYSTEM,
      )
      this.recordsRejected++
    } else {
      // recycled: no state change, just update system comments
      this.logger.log(`Detail ${batchDetail.id} recycled, no status change`)
      await this.prisma.contactBatchDetail.update({
        where: { id: batchDetail.id },
        data: { systemComments, lastUpdatedBy: UPDATED_BY.SYSTEM },
      })
      this.recordsRecycled++
    }
  }
}
