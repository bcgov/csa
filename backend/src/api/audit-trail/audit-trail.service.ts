import { Injectable, NotFoundException } from '@nestjs/common'
import { PaginatedResponse } from 'src/api/common/dto/paginated-response.dto'
import { PrismaService } from 'src/common/database/prisma.service'
import { buildStableOrderBy } from 'src/common/utils'
import { toContactAuditTrailDto } from './contact-audit-trail.mapper'
import { ContactAuditTrailDto } from './dto/contact-audit-trail.dto'

@Injectable()
export class AuditTrailService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    page = 1,
    limit = 10,
    contactId?: number,
  ): Promise<PaginatedResponse<ContactAuditTrailDto>> {
    const safePage = page >= 1 ? page : 1
    const safeLimit = limit >= 1 ? Math.min(limit, 200) : 10
    const where = contactId ? { contactId } : {}

    const [rows, total] = await Promise.all([
      this.prisma.contactAuditTrail.findMany({
        where,
        orderBy: buildStableOrderBy({ actionedAt: 'desc' }),
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.contactAuditTrail.count({ where }),
    ])

    return {
      data: rows.map(toContactAuditTrailDto),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    }
  }

  async findByContactId(
    contactId: number,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResponse<ContactAuditTrailDto>> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true },
    })

    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`)
    }

    return this.findAll(page, limit, contactId)
  }
}
