import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PaginatedResponse } from 'src/api/common/dto/paginated-response.dto'
import { PrismaService } from 'src/common/database/prisma.service'
import { CSA_EVENT, CSA_STATUS, CSA_STATUS_LABELS } from 'src/common/state-machine/constants'
import type { Actor, TransitionResult } from 'src/common/state-machine/interfaces'
import { StateMachineService } from 'src/common/state-machine/state-machine.service'
import { enrichLabels, isEligibleAge } from 'src/common/utils'
import { IcmSyncBackService } from 'src/sync/icm/icm-sync-back.service'
import { ALLOWED_FILTER_SORT_FIELDS, BULK_OPERATION_SKIP_REASONS } from './constants'
import { ContactDto } from './dto/contact.dto'
import type {
  BulkOperationResponse,
  FilterCondition,
  FilterItem,
  UpdateCsaStatusOptions,
} from './interfaces'

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name)

  constructor(
    private prisma: PrismaService,
    private stateMachine: StateMachineService,
    private icmSyncBackService: IcmSyncBackService,
  ) { }

  async findAll(
    page: number = 1,
    limit: number = 10,
    sort?: string,
    filter?: string,
  ): Promise<PaginatedResponse<ContactDto>> {
    if (limit > 200) {
      limit = 200
    }

    let orderBy: Array<Record<string, 'asc' | 'desc'>> | undefined
    if (sort) {
      try {
        const sortArray = JSON.parse(sort)
        if (Array.isArray(sortArray) && sortArray.length > 0) {
          orderBy = []
          for (const sortItem of sortArray) {
            const field = Object.keys(sortItem)[0]
            const direction = sortItem[field]

            if (
              !ALLOWED_FILTER_SORT_FIELDS.includes(
                field as (typeof ALLOWED_FILTER_SORT_FIELDS)[number],
              )
            ) {
              throw new BadRequestException(
                `Invalid sort field: ${field}. Allowed fields: ${ALLOWED_FILTER_SORT_FIELDS.join(', ')}`,
              )
            }

            if (direction !== 'asc' && direction !== 'desc') {
              throw new BadRequestException(
                `Invalid sort direction: ${direction}. Allowed values: asc, desc`,
              )
            }

            orderBy.push({ [field]: direction })
          }
        }
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error
        }
        throw new BadRequestException('Invalid JSON format for sort parameter')
      }
    }

    let where: Record<string, unknown> = {}
    if (filter) {
      let filterArray: unknown
      try {
        filterArray = JSON.parse(filter)
      } catch {
        throw new BadRequestException('Invalid JSON format for filter parameter')
      }
      if (Array.isArray(filterArray) && filterArray.length > 0) {
        where = this.convertFiltersToPrismaFormat(filterArray)
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.contact.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        where,
      }),
      this.prisma.contact.count({ where }),
    ])

    return {
      data: data.map(enrichLabels),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  }

  private convertFiltersToPrismaFormat(filters: FilterCondition[]): Record<string, unknown> {
    const andConditions: Array<Record<string, unknown>> = []

    for (const condition of filters) {
      if ('OR' in condition) {
        if (!Array.isArray(condition.OR) || condition.OR.length === 0) {
          throw new BadRequestException('OR condition must contain at least one filter item')
        }
        const orConditions: Array<Record<string, unknown>> = []
        for (const item of condition.OR) {
          const prismaCondition = this.convertSingleFilterToPrisma(item)
          orConditions.push(prismaCondition)
        }
        andConditions.push({ OR: orConditions })
      } else {
        const prismaCondition = this.convertSingleFilterToPrisma(condition)
        andConditions.push(prismaCondition)
      }
    }

    if (andConditions.length === 0) {
      return {}
    }

    if (andConditions.length === 1) {
      return andConditions[0]
    }

    return { AND: andConditions }
  }

  private convertSingleFilterToPrisma(filter: FilterItem): Record<string, unknown> {
    let { key, op, value } = filter

    if (!ALLOWED_FILTER_SORT_FIELDS.includes(key as (typeof ALLOWED_FILTER_SORT_FIELDS)[number])) {
      throw new BadRequestException(
        `Invalid filter field: ${key}. Allowed fields: ${ALLOWED_FILTER_SORT_FIELDS.join(', ')}`,
      )
    }

    // Convert csaStatusLabel filter to csaStatus by looking up the reverse mapping
    if (key === 'csaStatusLabel' && typeof value === 'string') {
      // Create reverse mapping from label to status code
      const labelToStatus: Record<string, string> = {}
      for (const [statusCode, label] of Object.entries(CSA_STATUS_LABELS)) {
        labelToStatus[label.toLowerCase()] = statusCode
      }

      // Check for exact match first
      const lowerValue = value.toLowerCase()
      if (labelToStatus[lowerValue]) {
        value = labelToStatus[lowerValue]
      } else {
        // For partial matching with 'like', find any status codes whose labels contain the search term
        if (op === 'like') {
          const matchingStatuses = Object.entries(CSA_STATUS_LABELS)
            .filter(([, label]) => label.toLowerCase().includes(lowerValue))
            .map(([statusCode]) => statusCode)

          if (matchingStatuses.length > 0) {
            // Return OR condition for all matching statuses
            return { csaStatus: { in: matchingStatuses } }
          }
        }
      }
      // Use csaStatus as the actual database field
      key = 'csaStatus'
    }

    switch (op) {
      case 'eq':
        return { [key]: { equals: value } }
      case 'neq':
        return { [key]: { not: { equals: value } } }
      case 'like':
        return { [key]: { contains: value as string, mode: 'insensitive' } }
      case 'gt':
        return { [key]: { gt: value } }
      case 'gte':
        return { [key]: { gte: value } }
      case 'lt':
        return { [key]: { lt: value } }
      case 'lte':
        return { [key]: { lte: value } }
      case 'in':
        return { [key]: { in: value as unknown[] } }
      case 'notin':
        return { [key]: { not: { in: value as unknown[] } } }
      case 'isnull':
        return { [key]: null }
      case 'notnull':
        return { [key]: { not: null } }
      case 'isblank':
        return { OR: [{ [key]: null }, { [key]: '' }] }
      case 'notblank':
        return { NOT: { OR: [{ [key]: null }, { [key]: '' }] } }
      default:
        throw new BadRequestException(
          `Invalid filter operation: ${op}. Allowed operations: eq, neq, like, gt, gte, lt, lte, in, notin, isnull, notnull, isblank, notblank`,
        )
    }
  }

  async findOne(id: number): Promise<ContactDto> {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
    })

    if (!contact) {
      throw new NotFoundException(`Contact ${id} not found`)
    }

    return enrichLabels(contact)
  }

  // Update a contact's CSA status using the state machine.
  // This is the core method for CSA status transitions - used by both API and system processes.
  async updateCsaStatus(
    contactId: number,
    event: string,
    actor: Actor,
    options?: UpdateCsaStatusOptions,
  ): Promise<TransitionResult> {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } })
    if (!contact) {
      return { success: false, reason: 'Contact not found' }
    }

    const currentState = contact.csaStatus ?? ''

    // For RESUME, pass the stored resumeStatus as the target state
    // For CRA_FILE_REJECTED, pass the stored preBatchStatus as the target state
    const targetState =
      event === CSA_EVENT.RESUME
        ? (contact.resumeStatus ?? undefined)
        : event === CSA_EVENT.CRA_FILE_REJECTED
          ? (contact.preBatchStatus ?? undefined)
          : undefined

    // Use state machine to validate and get next state
    const result = this.stateMachine.transitionContact(currentState, event, actor, targetState)

    if (!result.success) {
      return result
    }

    const nextState = result.to!

    // Build update data
    const updateData: Record<string, unknown> = {
      csaStatus: nextState,
      csaStatusEffectiveDate: new Date(),
      icmIntegrationStatus: true,
      lastUpdatedBy: options?.userId ?? 'SYSTEM',
      lastUpdatedAt: new Date(),
      ...options?.additionalData,
    }

    // save current state to resumeStatus
    if (event === CSA_EVENT.HOLD) {
      updateData.resumeStatus = currentState
      updateData.holdBy = options?.userId
    }

    // clear resume fields
    if (event === CSA_EVENT.RESUME) {
      updateData.resumeStatus = null
      updateData.holdBy = null
    }

    // save current state to preBatchStatus (only if not already set)
    if (event === CSA_EVENT.ADD_TO_BATCH && !contact.preBatchStatus) {
      updateData.preBatchStatus = currentState
    }

    // clear preBatchStatus (batch flow succeeded)
    if (event === CSA_EVENT.CRA_ACCEPTED) {
      updateData.preBatchStatus = null
    }

    // clear preBatchStatus (rolled back)
    if (event === CSA_EVENT.CRA_FILE_REJECTED) {
      updateData.preBatchStatus = null
    }

    // default cancel reason code when user sets not eligible from in-pay
    if (
      event === CSA_EVENT.SET_NOT_ELIGIBLE &&
      currentState === CSA_STATUS.IN_PAY &&
      !contact.cancelReasonCode
    ) {
      updateData.cancelReasonCode = '21'
    }

    await this.prisma.contact.update({
      where: { id: contactId },
      data: updateData,
    })

    this.logger.log(`Contact ${contactId}: ${currentState}->${nextState} [${event}] by ${actor}`)

    if (actor === 'USER') {
      this.icmSyncBackService.syncSingleContact(contactId).catch((err) => {
        this.logger.warn(
          `Immediate ICM sync failed for contact ${contactId}: ${(err as Error).message}`,
        )
      })
    }

    return { success: true, from: currentState, to: nextState }
  }

  async fullTextSearch(
    query: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<ContactDto>> {
    if (limit > 200) {
      limit = 200
    }

    const searchTerm = this.escapeLikePattern(query.trim())
    if (!searchTerm) {
      return { data: [], page, limit, total: 0, totalPages: 0 }
    }

    const where = {
      searchText: { contains: searchTerm, mode: 'insensitive' as const },
    }

    const [data, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.contact.count({ where }),
    ])

    return {
      data: data.map(enrichLabels),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  }

  async holdContacts(contactIds: number[], userId: string): Promise<BulkOperationResponse> {
    const result: BulkOperationResponse = {
      success: [],
      skipped: [],
    }

    for (const id of contactIds) {
      const transitionResult = await this.updateCsaStatus(id, CSA_EVENT.HOLD, 'USER', { userId })
      if (transitionResult.success) {
        result.success.push(id)
      } else {
        const reason =
          transitionResult.reason === 'Contact not found'
            ? BULK_OPERATION_SKIP_REASONS.NOT_FOUND
            : BULK_OPERATION_SKIP_REASONS.INVALID_TRANSITION
        result.skipped.push({ id, reason })
      }
    }

    return result
  }

  async resumeContacts(contactIds: number[], userId: string): Promise<BulkOperationResponse> {
    const result: BulkOperationResponse = {
      success: [],
      skipped: [],
    }

    for (const id of contactIds) {
      const transitionResult = await this.updateCsaStatus(id, CSA_EVENT.RESUME, 'USER', { userId })
      if (transitionResult.success) {
        result.success.push(id)
      } else {
        const reason =
          transitionResult.reason === 'Contact not found'
            ? BULK_OPERATION_SKIP_REASONS.NOT_FOUND
            : BULK_OPERATION_SKIP_REASONS.INVALID_TRANSITION
        result.skipped.push({ id, reason })
      }
    }

    return result
  }

  async updateEligibilityStatus(
    contactIds: number[],
    action: string,
    userId: string,
  ): Promise<BulkOperationResponse> {
    if (action !== 'ELIGIBLE') {
      throw new BadRequestException(`Invalid action: ${action}. Only 'ELIGIBLE' is supported.`)
    }

    const result: BulkOperationResponse = {
      success: [],
      skipped: [],
    }

    for (const id of contactIds) {
      // Fetch the contact to determine current CSA status
      const contact = await this.prisma.contact.findUnique({
        where: { id },
        select: { csaStatus: true },
      })

      if (!contact) {
        result.skipped.push({ id, reason: BULK_OPERATION_SKIP_REASONS.NOT_FOUND })
        continue
      }

      // Determine the appropriate event based on current status
      let event: string
      let actor: Actor

      if (contact.csaStatus === CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY) {
        // not_eligible_out_of_pay -> eligible_tbd using SET_ELIGIBLE_TBD
        event = CSA_EVENT.SET_ELIGIBLE_TBD
        actor = 'USER'
      } else if (contact.csaStatus === CSA_STATUS.NOT_ELIGIBLE_IP_TBD) {
        // not_eligible_ip_tbd -> in_pay using BECOME_ELIGIBLE
        event = CSA_EVENT.BECOME_ELIGIBLE
        actor = 'USER'
      } else {
        // Current status is not eligible for this operation
        result.skipped.push({ id, reason: BULK_OPERATION_SKIP_REASONS.INVALID_TRANSITION })
        continue
      }

      const transitionResult = await this.updateCsaStatus(id, event, actor, { userId })
      if (transitionResult.success) {
        result.success.push(id)
      } else {
        result.skipped.push({ id, reason: BULK_OPERATION_SKIP_REASONS.INVALID_TRANSITION })
      }
    }

    return result
  }

  async updateNotEligibleStatus(
    contactIds: number[],
    action: string,
    userId: string,
  ): Promise<BulkOperationResponse> {
    if (action !== 'SET_NOT_ELIGIBLE') {
      throw new BadRequestException(
        `Invalid action: ${action}. Only 'SET_NOT_ELIGIBLE' is supported.`,
      )
    }

    const result: BulkOperationResponse = {
      success: [],
      skipped: [],
    }

    for (const id of contactIds) {
      // Fetch the contact to determine current CSA status
      const contact = await this.prisma.contact.findUnique({
        where: { id },
        select: { csaStatus: true },
      })

      if (!contact) {
        result.skipped.push({ id, reason: BULK_OPERATION_SKIP_REASONS.NOT_FOUND })
        continue
      }

      // Determine if the current status supports SET_NOT_ELIGIBLE transition
      // eligible_tbd -> not_eligible_out_of_pay
      // on_hold -> not_eligible_out_of_pay
      // in_pay -> not_eligible_ip_tbd
      const validStatuses = [CSA_STATUS.ELIGIBLE_TBD, CSA_STATUS.ON_HOLD, CSA_STATUS.IN_PAY]

      if (!validStatuses.includes(contact.csaStatus as any)) {
        // Current status is not eligible for this operation
        result.skipped.push({ id, reason: BULK_OPERATION_SKIP_REASONS.INVALID_TRANSITION })
        continue
      }

      const transitionResult = await this.updateCsaStatus(id, CSA_EVENT.SET_NOT_ELIGIBLE, 'USER', {
        userId,
      })
      if (transitionResult.success) {
        result.success.push(id)
      } else {
        result.skipped.push({ id, reason: BULK_OPERATION_SKIP_REASONS.INVALID_TRANSITION })
      }
    }

    return result
  }

  async updateChildOver18(
    contactIds: number[],
    action: string,
    userId: string,
  ): Promise<BulkOperationResponse> {
    if (action !== 'AGE_OUT') {
      throw new BadRequestException(`Invalid action: ${action}. Only 'AGE_OUT' is supported.`)
    }

    const result: BulkOperationResponse = {
      success: [],
      skipped: [],
    }

    for (const id of contactIds) {
      const contact = await this.prisma.contact.findUnique({
        where: { id },
        select: { csaStatus: true, dateOfBirth: true },
      })

      if (!contact) {
        result.skipped.push({ id, reason: BULK_OPERATION_SKIP_REASONS.NOT_FOUND })
        continue
      }

      // Skip if contact is still eligible age (under 18 through end of birth month)
      if (!contact.dateOfBirth || isEligibleAge(contact.dateOfBirth)) {
        result.skipped.push({ id, reason: BULK_OPERATION_SKIP_REASONS.INVALID_TRANSITION })
        continue
      }

      // Determine if the current status supports AGE_OUT transition
      // eligible_tbd -> over_18
      // not_eligible_ip_tbd -> over_18
      const validStatuses = [CSA_STATUS.ELIGIBLE_TBD, CSA_STATUS.NOT_ELIGIBLE_IP_TBD]

      if (!validStatuses.includes(contact.csaStatus as any)) {
        // Current status is not eligible for this operation
        result.skipped.push({ id, reason: BULK_OPERATION_SKIP_REASONS.INVALID_TRANSITION })
        continue
      }

      const transitionResult = await this.updateCsaStatus(id, CSA_EVENT.AGE_OUT, 'USER', { userId })
      if (transitionResult.success) {
        result.success.push(id)
      } else {
        result.skipped.push({ id, reason: BULK_OPERATION_SKIP_REASONS.INVALID_TRANSITION })
      }
    }

    return result
  }

  async findContactBatches(contactId: number) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    })
    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`)
    }

    return this.prisma.contactBatchDetail.findMany({
      where: { contactId },
      include: {
        batch: {
          select: {
            id: true,
            batchDate: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  // Escape ILIKE special characters to prevent wildcard injection
  // '%' and '_' are wildcards, '\' is escape char
  private escapeLikePattern(input: string): string {
    return input.replace(/[%_\\]/g, '\\$&')
  }
}
