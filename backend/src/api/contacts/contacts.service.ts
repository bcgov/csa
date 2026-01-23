import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'

import { NotFoundException } from '@nestjs/common'
import { PaginatedResponse } from 'src/api/common/dto/paginated-response.dto'
import { ContactDto } from './dto/contact.dto'

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number = 1, limit: number = 10): Promise<PaginatedResponse<ContactDto>> {
    if (limit > 200) {
      limit = 200
    }

    const [data, total] = await Promise.all([
      this.prisma.contact.findMany({
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contact.count(),
    ])

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
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

  async searchContacts(
    page: number,
    limit: number,
    sort: string, // JSON string to store sort key and sort value, ex: [{"name":"desc"},{"email":"asc"}]
    filter: string, // JSON array for key, operation and value, ex: [{"key": "name", "operation": "like", "value": "Jo"}]
  ): Promise<any> {
    page = page || 1
    if (!limit || limit > 200) {
      limit = 10
    }

    let sortObj: unknown[] = []
    let filterObj: Array<{ key: string; operation: string; value: unknown }> = []
    try {
      sortObj = JSON.parse(sort)
      const parsedFilter = JSON.parse(filter) // Ensure filterObj is an array
      filterObj = Array.isArray(parsedFilter) ? parsedFilter : []
    } catch {
      throw new Error('Invalid query parameters')
    }
    const contacts = await this.prisma.contact.findMany({
      skip: (page - 1) * limit,
      take: parseInt(String(limit)),
      orderBy: sortObj,
      where: this.convertFiltersToPrismaFormat(filterObj),
    })

    const count = await this.prisma.contact.count({
      orderBy: sortObj,
      where: this.convertFiltersToPrismaFormat(filterObj),
    })

    return {
      contacts,
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    }
  }

  public convertFiltersToPrismaFormat(
    filterObj: Array<{ key: string; operation: string; value: unknown }>,
  ): Record<string, unknown> {
    const prismaFilterObj: Record<string, unknown> = {}

    for (const item of filterObj) {
      if (item.operation === 'like') {
        prismaFilterObj[item.key] = { contains: item.value }
      } else if (item.operation === 'eq') {
        prismaFilterObj[item.key] = { equals: item.value }
      } else if (item.operation === 'neq') {
        prismaFilterObj[item.key] = { not: { equals: item.value } }
      } else if (item.operation === 'gt') {
        prismaFilterObj[item.key] = { gt: item.value }
      } else if (item.operation === 'gte') {
        prismaFilterObj[item.key] = { gte: item.value }
      } else if (item.operation === 'lt') {
        prismaFilterObj[item.key] = { lt: item.value }
      } else if (item.operation === 'lte') {
        prismaFilterObj[item.key] = { lte: item.value }
      } else if (item.operation === 'in') {
        prismaFilterObj[item.key] = { in: item.value }
      } else if (item.operation === 'notin') {
        prismaFilterObj[item.key] = { not: { in: item.value } }
      } else if (item.operation === 'isnull') {
        prismaFilterObj[item.key] = { equals: null }
      }
    }
    return prismaFilterObj
  }
}
