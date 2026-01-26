import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'

import { NotFoundException } from '@nestjs/common'
import { PaginatedResponse } from 'src/api/common/dto/paginated-response.dto'
import { ALLOWED_FILTER_SORT_FIELDS } from './constants'
import { ContactDto } from './dto/contact.dto'
import { FilterCondition, FilterItem } from './interfaces'
@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    page: number = 1,
    limit: number = 10,
    sort?: string,
    filter?: string,
  ): Promise<PaginatedResponse<ContactDto>> {
    if (limit > 200) {
      limit = 200
    }

    // Parse and validate sort parameter
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
              ALLOWED_FILTER_SORT_FIELDS.includes(
                field as (typeof ALLOWED_FILTER_SORT_FIELDS)[number],
              ) &&
              (direction === 'asc' || direction === 'desc')
            ) {
              orderBy.push({ [field]: direction })
            }
          }
          if (orderBy.length === 0) {
            orderBy = undefined
          }
        }
      } catch {
        throw new BadRequestException('Invalid JSON format for sort parameter')
      }
    }

    // Parse and validate filter parameter
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
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  }

  private convertFiltersToPrismaFormat(filters: FilterCondition[]): Record<string, unknown> {
    const andConditions: Array<Record<string, unknown>> = []

    for (const condition of filters) {
      // Check if it's an OR condition
      if ('OR' in condition) {
        if (!Array.isArray(condition.OR) || condition.OR.length === 0) {
          throw new BadRequestException('OR condition must contain at least one filter item')
        }
        const orConditions: Array<Record<string, unknown>> = []
        for (const item of condition.OR) {
          const prismaCondition = this.convertSingleFilterToPrisma(item)
          if (prismaCondition) {
            orConditions.push(prismaCondition)
          }
        }
        if (orConditions.length > 0) {
          andConditions.push({ OR: orConditions })
        }
      } else {
        // Regular filter item
        const prismaCondition = this.convertSingleFilterToPrisma(condition)
        if (prismaCondition) {
          andConditions.push(prismaCondition)
        }
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

  private convertSingleFilterToPrisma(filter: FilterItem): Record<string, unknown> | null {
    const { key, op, value } = filter

    // Validate field is allowed
    if (!ALLOWED_FILTER_SORT_FIELDS.includes(key as (typeof ALLOWED_FILTER_SORT_FIELDS)[number])) {
      return null
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
        return null
    }
  }

  async findOne(id: number): Promise<ContactDto> {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
    })

    if (!contact) {
      throw new NotFoundException(`Contact ${id} not found`)
    }

    return contact
  }

  async fullTextSearch(
    query: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<ContactDto>> {
    if (limit > 200) {
      limit = 200
    }

    const offset = (page - 1) * limit
    const searchQuery = query.trim().split(/\s+/).join(' & ')

    const data = await this.prisma.$queryRaw<ContactDto[]>`
      SELECT id, last_name as "lastName", given_names as "givenNames", middle_name as "middleName",
             aka_last_name as "akaLastName", aka_first_name as "akaFirstName",
             person_id_icm as "personIdIcm", person_id_ims as "personIdIms",
             gender, date_of_birth as "dateOfBirth", age,
             case_number as "caseNumber", legacy_file_number as "legacyFileNumber",
             case_type as "caseType", case_status as "caseStatus", case_load as "caseLoad",
             service_office as "serviceOffice", assigned_to as "assignedTo",
             csa_status as "csaStatus", csa_status_effective_date as "csaStatusEffectiveDate",
             csa_sent_date as "csaSentDate", din, effective_legal_status as "effectiveLegalStatus",
             effective_date as "effectiveDate", expiry_date as "expiryDate",
             enroll_for_csa as "enrollForCsa", mis_legal_authority_code as "misLegalAuthorityCode",
             legal_authority_code as "legalAuthorityCode", birth_city as "birthCity",
             birth_province as "birthProvince", birth_country as "birthCountry",
             placement_location as "placementLocation", location_type as "locationType",
             location_sub_type as "locationSubType", placement_status as "placementStatus",
             actual_start_date as "actualStartDate", actual_end_date as "actualEndDate",
             paid_unpaid as "paidUnpaid", interrupted_placement as "interruptedPlacement",
             source_placement as "sourcePlacement", service_provider_name as "serviceProviderName",
             provider_id as "providerId", place_of_service_name as "placeOfServiceName",
             agreement_type as "agreementType", agreement_status as "agreementStatus",
             agreement_start_date as "agreementStartDate", agreement_end_date as "agreementEndDate",
             termination_date as "terminationDate", mcfd_contract as "mcfdContract",
             order_number as "orderNumber", order_type as "orderType", order_status as "orderStatus",
             order_amount as "orderAmount", order_effective_start_date as "orderEffectiveStartDate",
             product, source_order as "sourceOrder",
             created_at as "createdAt", created_by as "createdBy",
             last_updated_at as "lastUpdatedAt", last_updated_by as "lastUpdatedBy"
      FROM csa.contacts
      WHERE search_vector @@ to_tsquery('english', ${searchQuery})
      ORDER BY ts_rank(search_vector, to_tsquery('english', ${searchQuery})) DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const countResult = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM csa.contacts
      WHERE search_vector @@ to_tsquery('english', ${searchQuery})
    `
    const total = Number(countResult[0].count)

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  }
}
