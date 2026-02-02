import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'
import {
  BATCH_STATUSES,
  BULK_OPERATION_SKIP_REASONS,
  TRANSACTION_TYPES,
} from '../contacts/constants'
import { BulkOperationResponse } from '../contacts/interfaces'

export interface AddContactsResult extends BulkOperationResponse {
  batch: {
    id: number
    batchDate: Date | null
    status: string
    recordCount: number
    createdAt: Date
    systemComments: string | null
  }
}

@Injectable()
export class BatchesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.batch.findMany({
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: number) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
    })
    if (!batch) {
      throw new NotFoundException(`Batch ${id} not found`)
    }
    return batch
  }

  async findBatchContacts(batchId: number) {
    // Verify batch exists
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    })
    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`)
    }

    return this.prisma.contactBatchDetail.findMany({
      where: { batchId },
      include: {
        contact: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            din: true,
            csaStatus: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOrCreatePendingBatch() {
    // Check if pending batch exists
    let pendingBatch = await this.prisma.batch.findFirst({
      where: { status: BATCH_STATUSES.PENDING },
    })

    if (!pendingBatch) {
      // Create new pending batch
      // DB constraint (batches_pending_unique) ensures only one pending batch can exist
      pendingBatch = await this.prisma.batch.create({
        data: {
          batchDate: null,
          status: BATCH_STATUSES.PENDING,
          recordCount: 0,
          createdAt: new Date(),
        },
      })
    }

    return pendingBatch
  }

  async addContactsToPendingBatch(
    contactIds: number[],
    userId: string,
  ): Promise<AddContactsResult> {
    const pendingBatch = await this.findOrCreatePendingBatch()

    const result: AddContactsResult = {
      batch: pendingBatch,
      success: [],
      skipped: [],
    }

    const existingContacts = await this.prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true },
    })
    const existingContactIds = new Set(existingContacts.map((c) => c.id))

    const alreadyInBatch = await this.prisma.contactBatchDetail.findMany({
      where: {
        batchId: pendingBatch.id,
        contactId: { in: contactIds },
      },
      select: { contactId: true },
    })
    const alreadyInBatchIds = new Set(alreadyInBatch.map((c) => c.contactId))

    const now = new Date()
    for (const contactId of contactIds) {
      if (!existingContactIds.has(contactId)) {
        result.skipped.push({ id: contactId, reason: BULK_OPERATION_SKIP_REASONS.NOT_FOUND })
      } else if (alreadyInBatchIds.has(contactId)) {
        result.skipped.push({ id: contactId, reason: BULK_OPERATION_SKIP_REASONS.ALREADY_IN_BATCH })
      } else {
        // Add to batch
        await this.prisma.contactBatchDetail.create({
          data: {
            contactId,
            batchId: pendingBatch.id,
            transactionType: TRANSACTION_TYPES.APPLICATION,
            status: BATCH_STATUSES.PENDING,
            createdAt: now,
            createdBy: userId,
            lastUpdatedAt: now,
            lastUpdatedBy: userId,
          },
        })
        result.success.push(contactId)
      }
    }

    // Update record count
    result.batch = await this.prisma.batch.update({
      where: { id: pendingBatch.id },
      data: {
        recordCount: {
          increment: result.success.length,
        },
      },
    })

    return result
  }

  async removeContactFromPendingBatch(contactId: number): Promise<void> {
    const pendingBatch = await this.prisma.batch.findFirst({
      where: { status: BATCH_STATUSES.PENDING },
    })

    if (!pendingBatch) {
      throw new NotFoundException('No pending batch exists')
    }

    // Find the contact batch detail
    const detail = await this.prisma.contactBatchDetail.findFirst({
      where: {
        batchId: pendingBatch.id,
        contactId,
      },
    })

    if (!detail) {
      throw new NotFoundException(`Contact ${contactId} not found in pending batch`)
    }

    // Delete the detail and update count
    await this.prisma.$transaction([
      this.prisma.contactBatchDetail.delete({
        where: { id: detail.id },
      }),
      this.prisma.batch.update({
        where: { id: pendingBatch.id },
        data: {
          recordCount: {
            decrement: 1,
          },
        },
      }),
    ])
  }
}
