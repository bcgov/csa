import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/common/database/prisma.service';
import {
  UpdateBatchStatusDto,
  UpdateContactStatusDto,
  UpdateEligibilityStatusDto,
} from './dto/update-status.dto';

export interface BulkUpdateResult {
  success: Array<{ contactId: number; oldStatus: string; newStatus: string }>
  failed: Array<{ contactId: number; reason: string }>
  totalProcessed: number
  successCount: number
  failedCount: number
}

@Injectable()
export class StatusUpdateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Update contact CSA status
   * @param dto - Update contact status DTO
   * @returns Updated contact
   */
  async updateContactStatus(dto: UpdateContactStatusDto) {
    const { contactId, status, updatedBy = 'system' } = dto

    // Check if contact exists
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    })

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${contactId} not found`)
    }

    // Update contact status
    const updatedContact = await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        csaStatus: status,
        csaStatusEffectiveDate: new Date(),
        lastUpdatedAt: new Date(),
        lastUpdatedBy: updatedBy,
      },
    })

    return {
      contactId: updatedContact.id,
      status: updatedContact.csaStatus,
      effectiveDate: updatedContact.csaStatusEffectiveDate,
      message: `Contact ${contactId} status updated to ${status}`,
    }
  }

  /**
   * Update batch status
   * @param dto - Update batch status DTO
   * @returns Updated batch
   */
  async updateBatchStatus(dto: UpdateBatchStatusDto) {
    const { batchId, status, comments } = dto

    // Check if batch exists
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    })

    if (!batch) {
      throw new NotFoundException(`Batch with ID ${batchId} not found`)
    }

    // Update batch status
    const updatedBatch = await this.prisma.batch.update({
      where: { id: batchId },
      data: {
        status,
        systemComments: comments || batch.systemComments,
      },
    })

    return {
      batchId: updatedBatch.id,
      status: updatedBatch.status,
      recordCount: updatedBatch.recordCount,
      message: `Batch ${batchId} status updated to ${status}`,
    }
  }

  /**
   * Get all available statuses for contacts
   * @returns List of contact statuses
   */
  async getContactStatuses() {
    // These could be fetched from a configuration table or enum
    return {
      statuses: ['Active', 'Inactive', 'Pending', 'Suspended', 'Terminated'],
    }
  }

  /**
   * Get all available statuses for batches
   * @returns List of batch statuses
   */
  async getBatchStatuses() {
    // These could be fetched from a configuration table or enum
    return {
      statuses: ['pending', 'in_progress', 'processed', 'failed', 'cancelled'],
    }
  }

  /**
   * Update eligibility status for multiple contacts
   * Rules:
   * - "Not Eligible - Out of Pay" → "Eligible - TBD"
   * - "Not Eligible - IP - TBD" → "In Pay"
   * @param dto - Update eligibility status DTO
   * @returns Bulk operation result
   */
  async updateEligibilityStatus(dto: UpdateEligibilityStatusDto): Promise<BulkUpdateResult> {
    const { contactIds, updatedBy = 'system' } = dto
    const success: Array<{ contactId: number; oldStatus: string; newStatus: string }> = []
    const failed: Array<{ contactId: number; reason: string }> = []

    // Process each contact
    for (const contactId of contactIds) {
      try {
        // Fetch the contact
        const contact = await this.prisma.contact.findUnique({
          where: { id: contactId },
        })

        if (!contact) {
          failed.push({
            contactId,
            reason: `Contact ${contactId} not found`,
          })
          continue
        }

        const currentStatus = contact.csaStatus
        let newStatus: string | null = null

        // Apply status transition rules
        if (currentStatus === 'not_eligible_out_of_pay') {
          newStatus = 'eligible_tbd'
        } else if (currentStatus === 'not_eligible_ip_tbd') {
          newStatus = 'in_pay'
        } else {
          failed.push({
            contactId,
            reason: `Contact ${contactId} has status "${currentStatus}" which is not eligible for update`,
          })
          continue
        }

        // Update the contact
        await this.prisma.contact.update({
          where: { id: contactId },
          data: {
            csaStatus: newStatus,
            csaStatusEffectiveDate: new Date(),
            lastUpdatedAt: new Date(),
            lastUpdatedBy: updatedBy,
          },
        })

        success.push({
          contactId,
          oldStatus: currentStatus || '',
          newStatus,
        })
      } catch (error) {
        failed.push({
          contactId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return {
      success,
      failed,
      totalProcessed: contactIds.length,
      successCount: success.length,
      failedCount: failed.length,
    }
  }

  /**
   * Update to not eligible status for multiple contacts
   * Rules:
   * - "eligible_tbd" → "not_eligible_ip_tbd"
   * - "in_pay" → "not_eligible_ip_tbd"
   * - "on_hold" → "not_eligible_ip_tbd"
   * @param dto - Update not eligible status DTO
   * @returns Bulk operation result
   */
  async updateNotEligibleStatus(dto: UpdateEligibilityStatusDto): Promise<BulkUpdateResult> {
    const { contactIds, updatedBy = 'system' } = dto
    const success: Array<{ contactId: number; oldStatus: string; newStatus: string }> = []
    const failed: Array<{ contactId: number; reason: string }> = []

    // Process each contact
    for (const contactId of contactIds) {
      try {
        // Fetch the contact
        const contact = await this.prisma.contact.findUnique({
          where: { id: contactId },
        })

        if (!contact) {
          failed.push({
            contactId,
            reason: `Contact ${contactId} not found`,
          })
          continue
        }

        const currentStatus = contact.csaStatus
        const newStatus = 'not_eligible_ip_tbd'

        // Apply status transition rules
        if (
          currentStatus !== 'eligible_tbd' &&
          currentStatus !== 'in_pay' &&
          currentStatus !== 'on_hold'
        ) {
          failed.push({
            contactId,
            reason: `Contact ${contactId} has status "${currentStatus}" which is not eligible for update`,
          })
          continue
        }

        // Update the contact
        await this.prisma.contact.update({
          where: { id: contactId },
          data: {
            csaStatus: newStatus,
            csaStatusEffectiveDate: new Date(),
            lastUpdatedAt: new Date(),
            lastUpdatedBy: updatedBy,
          },
        })

        success.push({
          contactId,
          oldStatus: currentStatus || '',
          newStatus,
        })
      } catch (error) {
        failed.push({
          contactId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return {
      success,
      failed,
      totalProcessed: contactIds.length,
      successCount: success.length,
      failedCount: failed.length,
    }
  }

  /**
   * Update contacts to not eligible status with specific transitions
   * Rules:
   * - "eligible_tbd" → "not_eligible_out_of_pay"
   * - "on_hold" → "not_eligible_out_of_pay"
   * - "in_pay" → "not_eligible_ip_tbd"
   * @param dto - Update not eligible status DTO
   * @returns Bulk operation result
   */
  async updateNotEligibleStatusAlt(dto: UpdateEligibilityStatusDto): Promise<BulkUpdateResult> {
    const { contactIds, updatedBy = 'system' } = dto
    const success: Array<{ contactId: number; oldStatus: string; newStatus: string }> = []
    const failed: Array<{ contactId: number; reason: string }> = []

    // Process each contact
    for (const contactId of contactIds) {
      try {
        // Fetch the contact
        const contact = await this.prisma.contact.findUnique({
          where: { id: contactId },
        })

        if (!contact) {
          failed.push({
            contactId,
            reason: `Contact ${contactId} not found`,
          })
          continue
        }

        const currentStatus = contact.csaStatus
        let newStatus: string

        // Apply status transition rules
        if (currentStatus === 'eligible_tbd' || currentStatus === 'on_hold') {
          newStatus = 'not_eligible_out_of_pay'
        } else if (currentStatus === 'in_pay') {
          newStatus = 'not_eligible_ip_tbd'
        } else {
          failed.push({
            contactId,
            reason: `Contact ${contactId} has status "${currentStatus}" which is not eligible for update`,
          })
          continue
        }

        // Update the contact
        await this.prisma.contact.update({
          where: { id: contactId },
          data: {
            csaStatus: newStatus,
            csaStatusEffectiveDate: new Date(),
            lastUpdatedAt: new Date(),
            lastUpdatedBy: updatedBy,
          },
        })

        success.push({
          contactId,
          oldStatus: currentStatus || '',
          newStatus,
        })
      } catch (error) {
        failed.push({
          contactId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return {
      success,
      failed,
      totalProcessed: contactIds.length,
      successCount: success.length,
      failedCount: failed.length,
    }
  }

  /**
   * Update contacts to "Over 18" status
   * Rules:
   * - "eligible_tbd" → "Over 18"
   * - "not_eligible_ip_tbd" → "Over 18"
   * @param dto - Update status DTO
   * @returns Bulk operation result
   */
  async updateOver18Status(dto: UpdateEligibilityStatusDto): Promise<BulkUpdateResult> {
    const { contactIds, updatedBy = 'system' } = dto
    const success: Array<{ contactId: number; oldStatus: string; newStatus: string }> = []
    const failed: Array<{ contactId: number; reason: string }> = []

    // Process each contact
    for (const contactId of contactIds) {
      try {
        // Fetch the contact
        const contact = await this.prisma.contact.findUnique({
          where: { id: contactId },
        })

        if (!contact) {
          failed.push({
            contactId,
            reason: `Contact ${contactId} not found`,
          })
          continue
        }

        const currentStatus = contact.csaStatus
        const newStatus = 'Over 18'

        // Apply status transition rules
        if (currentStatus !== 'eligible_tbd' && currentStatus !== 'not_eligible_ip_tbd') {
          failed.push({
            contactId,
            reason: `Contact ${contactId} has status "${currentStatus}" which is not eligible for update to Over 18`,
          })
          continue
        }

        // Update the contact
        await this.prisma.contact.update({
          where: { id: contactId },
          data: {
            csaStatus: newStatus,
            csaStatusEffectiveDate: new Date(),
            lastUpdatedAt: new Date(),
            lastUpdatedBy: updatedBy,
          },
        })

        success.push({
          contactId,
          oldStatus: currentStatus || '',
          newStatus,
        })
      } catch (error) {
        failed.push({
          contactId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return {
      success,
      failed,
      totalProcessed: contactIds.length,
      successCount: success.length,
      failedCount: failed.length,
    }
  }
}
