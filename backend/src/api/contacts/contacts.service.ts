import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { PaginatedResponse } from 'src/api/common/dto/paginated-response.dto'
import { PrismaService } from 'src/common/database/prisma.service'
import {
  CRA_FILE_REJECTED_TARGET,
  CSA_EVENT,
  CSA_STATUS,
  CSA_STATUS_LABELS,
  REMOVE_FROM_BATCH_TARGET,
} from 'src/common/state-machine/constants'
import type { Actor, TransitionResult } from 'src/common/state-machine/interfaces'
import { StateMachineService } from 'src/common/state-machine/state-machine.service'
import { enrichLabels, isEligibleAge, pacificToday } from 'src/common/utils'
import { getCancelReasonLabel } from 'src/sync/eligibility/cancellation/cancellation-reason.constants'
import { EligibilityInputError } from 'src/sync/eligibility/eligibility.errors'
import { EligibilityService } from 'src/sync/eligibility/eligibility.service'
import { IcmSyncBackService } from 'src/sync/icm/icm-sync-back.service'
import {
  ALLOWED_FILTER_SORT_FIELDS,
  BULK_OPERATION_SKIP_REASONS,
  TRANSACTION_TYPES,
} from './constants'
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
    private eligibilityService: EligibilityService,
  ) {}

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
    const { key: filterKey, op, value: filterValue } = filter
    let key = filterKey
    let value: unknown = filterValue

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
    const db = options?.tx ?? this.prisma
    const contact = await db.contact.findUnique({ where: { id: contactId } })
    if (!contact) {
      return { success: false, reason: 'Contact not found' }
    }

    const currentState = contact.csaStatus ?? ''

    // For RESUME, pass the stored resumeStatus as the target state
    // For CRA_FILE_REJECTED, map preBatchStatus to correct revert state (refused -> TBD)
    // For REMOVE_FROM_BATCH, map preBatchStatus to the correct return state
    const targetState =
      event === CSA_EVENT.RESUME
        ? (contact.resumeStatus ?? undefined)
        : event === CSA_EVENT.CRA_FILE_REJECTED
          ? (CRA_FILE_REJECTED_TARGET[contact.preBatchStatus ?? ''] ?? undefined)
          : event === CSA_EVENT.REMOVE_FROM_BATCH
            ? (REMOVE_FROM_BATCH_TARGET[contact.preBatchStatus ?? ''] ?? undefined)
            : undefined

    // Use state machine to validate and get next state
    const result = this.stateMachine.transitionContact(currentState, event, actor, targetState)

    if (!result.success) {
      const origin = options?.origin ? ` [origin: ${options.origin}]` : ''
      this.logger.warn(
        `Contact ${contactId}: transition failed ${currentState} [${event}] by ${actor} — ${result.reason}${origin}`,
      )
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

    // save current state to preBatchStatus (fresh each batch cycle)
    if (event === CSA_EVENT.ADD_TO_BATCH) {
      updateData.preBatchStatus = currentState
    }

    // clear preBatchStatus on all batch cycle exits
    if (
      event === CSA_EVENT.REMOVE_FROM_BATCH ||
      event === CSA_EVENT.CRA_RSP_REJECTED ||
      event === CSA_EVENT.CRA_FILE_REJECTED ||
      event === CSA_EVENT.CRA_WKL_APPROVED ||
      event === CSA_EVENT.CRA_WKL_REFUSED
    ) {
      updateData.preBatchStatus = null
    }

    if (event === CSA_EVENT.SET_NOT_ELIGIBLE && contact.csaStatus === CSA_STATUS.IN_PAY) {
      if (!contact.cancelReasonCode) {
        updateData.cancelReasonCode = '21'
      }
      updateData.careEndDate = pacificToday()
    }

    if (event === CSA_EVENT.SET_ELIGIBLE_TBD || event === CSA_EVENT.BECOME_ELIGIBLE) {
      updateData.cancelReasonCode = null
      updateData.careEndDate = null
    }

    await db.contact.update({
      where: { id: contactId },
      data: updateData,
    })

    this.logger.log(`Contact ${contactId}: ${currentState}->${nextState} [${event}] by ${actor}`)

    // Skip immediate sync when running inside a transaction — the caller must
    // trigger sync after the transaction commits, otherwise syncSingleContact
    // reads the pre-commit state and syncs a stale status to ICM.
    if (actor === 'USER' && !options?.tx) {
      this.icmSyncBackService.syncSingleContact(contactId).catch((err) => {
        this.logger.warn(
          `Immediate ICM sync failed for contact ${contactId}: ${(err as Error).message}`,
        )
      })
    }

    return { success: true, from: currentState, to: nextState }
  }

  async forceUpdateCsaStatus(
    contactId: number,
    nextState: string,
    additionalData?: Record<string, unknown>,
    origin?: string,
  ): Promise<TransitionResult> {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } })
    if (!contact) {
      return { success: false, reason: 'Contact not found' }
    }

    const currentState = contact.csaStatus ?? ''

    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        csaStatus: nextState,
        csaStatusEffectiveDate: new Date(),
        icmIntegrationStatus: true,
        lastUpdatedBy: 'SYSTEM',
        lastUpdatedAt: new Date(),
        preBatchStatus: null,
        resumeStatus: null,
        holdBy: null,
        ...additionalData,
      },
    })

    const originSuffix = origin ? ` [origin: ${origin}]` : ''
    this.logger.log(
      `Contact ${contactId}: ${currentState}->${nextState} [FORCE/WKL] by SYSTEM${originSuffix}`,
    )

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

  async weeklyChildSearch(
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
      OR: [
        { personIdIcm: { contains: searchTerm, mode: 'insensitive' as const } },
        { personIdMis: { contains: searchTerm, mode: 'insensitive' as const } },
        { birthCity: { contains: searchTerm, mode: 'insensitive' as const } },
        { birthProvince: { contains: searchTerm, mode: 'insensitive' as const } },
        { birthCountry: { contains: searchTerm, mode: 'insensitive' as const } },
      ],
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

  async holdContacts(
    contactIds: number[],
    userId: string,
    reason: string,
  ): Promise<BulkOperationResponse> {
    const result: BulkOperationResponse = {
      success: [],
      skipped: [],
    }

    for (const id of contactIds) {
      const transitionResult = await this.updateCsaStatus(id, CSA_EVENT.HOLD, 'USER', {
        userId,
        origin: 'ContactsService.holdContacts',
        additionalData: { holdReason: reason },
      })
      if (transitionResult.success) {
        result.success.push(id)
      } else {
        const skipReason =
          transitionResult.reason === 'Contact not found'
            ? BULK_OPERATION_SKIP_REASONS.NOT_FOUND
            : BULK_OPERATION_SKIP_REASONS.INVALID_TRANSITION
        result.skipped.push({ id, reason: skipReason })
      }
    }

    return result
  }

  async resumeContacts(
    contactIds: number[],
    userId: string,
    reason?: string,
  ): Promise<BulkOperationResponse> {
    const result: BulkOperationResponse = {
      success: [],
      skipped: [],
    }

    for (const id of contactIds) {
      const additionalData: Record<string, unknown> = {}
      // If reason is provided (can be empty string to clear), update holdReason
      if (reason !== undefined) {
        additionalData.holdReason = reason || null
      }

      const transitionResult = await this.updateCsaStatus(id, CSA_EVENT.RESUME, 'USER', {
        userId,
        origin: 'ContactsService.resumeContacts',
        additionalData: Object.keys(additionalData).length > 0 ? additionalData : undefined,
      })
      if (transitionResult.success) {
        // Clear the review flag when resuming from hold
        await this.prisma.contact.update({
          where: { id },
          data: { needsReview: false },
        })
        result.success.push(id)
      } else {
        const skipReason =
          transitionResult.reason === 'Contact not found'
            ? BULK_OPERATION_SKIP_REASONS.NOT_FOUND
            : BULK_OPERATION_SKIP_REASONS.INVALID_TRANSITION
        result.skipped.push({ id, reason: skipReason })
      }
    }

    return result
  }

  async updateHoldReason(
    contactId: number,
    reason: string | undefined,
    userId: string,
  ): Promise<{ success: boolean; contact?: { id: number; holdReason: string } }> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, csaStatus: true },
    })

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${contactId} not found`)
    }

    const isOnHold = contact.csaStatus === CSA_STATUS.ON_HOLD
    const hasReason = reason !== undefined && reason.trim() !== ''

    // If contact is ON_HOLD, reason is required
    if (isOnHold && !hasReason) {
      throw new BadRequestException("'Reason' cannot be blank when the CSA Status is 'On Hold'.")
    }

    // If contact is NOT on hold and no reason provided, clear the reason
    const newReason = hasReason ? reason!.trim() : null

    // Do not update hold_by here — that is set on HOLD only. last_updated_by is set so the
    // audit trigger records the correct Actioned By on Reason changes without reassigning
    // who put the contact on hold.
    const updated = await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        holdReason: newReason,
        lastUpdatedBy: userId,
        lastUpdatedAt: new Date(),
      },
      select: { id: true, holdReason: true },
    })

    const action = newReason ? 'updated' : 'cleared'
    this.logger.log(`Hold reason ${action} for contact ${contactId} by ${userId}`)

    return { success: true, contact: { id: updated.id, holdReason: updated.holdReason || '' } }
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

      const transitionResult = await this.updateCsaStatus(id, event, actor, {
        userId,
        origin: 'ContactsService.updateEligibilityStatus',
      })
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
        origin: 'ContactsService.updateNotEligibleStatus',
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

      const transitionResult = await this.updateCsaStatus(id, CSA_EVENT.AGE_OUT, 'USER', {
        userId,
        origin: 'ContactsService.updateChildOver18',
      })
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

    const details = await this.prisma.contactBatchDetail.findMany({
      where: { contactId },
      include: {
        batch: {
          select: {
            id: true,
            batchNumber: true,
            batchDate: true,
            status: true,
            systemComments: true,
          },
        },
        contact: {
          select: {
            effectiveDate: true,
            careEndDate: true,
            cancelReasonCode: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return details.map((detail) => {
      const effectiveDate = detail.effectiveDate
      const cancelReasonCode = detail.cancelReasonCode
      const cancelReasonLabel = getCancelReasonLabel(cancelReasonCode, detail.transactionType)

      return enrichLabels({
        ...detail,
        effectiveDate,
        cancelReasonCode:
          detail.transactionType === TRANSACTION_TYPES.CANCELLATION ? cancelReasonCode : null,
        cancelReasonLabel,
        batch: enrichLabels(detail.batch),
      })
    })
  }

  async runContactEligibility(
    contactId: number,
  ): Promise<{ previousStatus: string | null; newStatus: string }> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { personIdIcm: true },
    })

    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`)
    }

    let result: { previousStatus: string | null; newStatus: string }
    try {
      result = await this.eligibilityService.runForContact(contact.personIdIcm)
    } catch (err) {
      if (err instanceof EligibilityInputError) {
        throw new UnprocessableEntityException(err.message)
      }
      throw err
    }

    // Clear the review flag after eligibility is run, unless the contact is ON_HOLD.
    // For ON_HOLD contacts, the review flag is set by the eligibility upsert when
    // staging data has changed, and we want to preserve that signal.
    if (result.newStatus !== CSA_STATUS.ON_HOLD) {
      await this.prisma.contact.update({
        where: { id: contactId },
        data: { needsReview: false },
      })
    }

    // If the eligibility run flipped csa_status, the upsert flagged
    // icm_integration_status=true. Try to push immediately; on failure
    // the flag stays set and the RETRY_FAILED cron will sweep it.
    if (result.previousStatus !== result.newStatus) {
      this.icmSyncBackService.syncSingleContact(contactId).catch((err) => {
        this.logger.warn(
          `Immediate ICM sync failed for contact ${contactId}: ${(err as Error).message}`,
        )
      })
    }

    return result
  }

  // Escape ILIKE special characters to prevent wildcard injection
  // '%' and '_' are wildcards, '\' is escape char
  private escapeLikePattern(input: string): string {
    return input.replace(/[%_\\]/g, '\\$&')
  }

  /**
   * Clear the review flag for a contact
   * @param contactId - Contact ID to clear review flag for
   * @param userId - User performing the action
   */
  async clearReviewFlag(contactId: number, userId: string): Promise<{ success: boolean }> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, needsReview: true },
    })

    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`)
    }

    await this.prisma.contact.update({
      where: { id: contactId },
      data: { needsReview: false },
    })

    this.logger.log(`Review flag cleared for contact ${contactId} by ${userId}`)

    return { success: true }
  }
}
