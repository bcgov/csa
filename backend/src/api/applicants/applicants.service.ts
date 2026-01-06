import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'

import { ApplicantDto } from './dto/applicant.dto'
import { CreateApplicantDto } from './dto/create-applicant.dto'
import { UpdateApplicantDto } from './dto/update-applicant.dto'

@Injectable()
export class ApplicantsService {
  constructor(private prisma: PrismaService) {}

  async create(applicant: CreateApplicantDto): Promise<ApplicantDto> {
    const savedApplicant = await this.prisma.applicants.create({
      data: {
        last_name: applicant.last_name,
        given_name: applicant.given_name,
        csa_status: applicant.csa_status,
      },
    })

    return {
      id: savedApplicant.id,
      last_name: savedApplicant.last_name,
      given_name: savedApplicant.given_name,
      csa_status: savedApplicant.csa_status,
    }
  }

  async findAll(): Promise<ApplicantDto[]> {
    const applicants = await this.prisma.applicants.findMany()
    return applicants.flatMap((applicant) => {
      const ApplicantDto: ApplicantDto = {
        id: applicant.id,
        last_name: applicant.last_name,
        given_name: applicant.given_name,
        csa_status: applicant.csa_status,
      }
      return ApplicantDto
    })
  }

  async findOne(id: number): Promise<ApplicantDto> {
    const applicant = await this.prisma.applicants.findUnique({
      where: {
        id: id,
      },
    })
    return {
      id: applicant.id,
      last_name: applicant.last_name,
      given_name: applicant.given_name,
      csa_status: applicant.csa_status,
    }
  }

  async update(id: number, updateApplicantDto: UpdateApplicantDto): Promise<ApplicantDto> {
    const applicant = await this.prisma.applicants.update({
      where: {
        id: id,
      },
      data: {
        last_name: updateApplicantDto.last_name,
        given_name: updateApplicantDto.given_name,
        csa_status: updateApplicantDto.csa_status,
      },
    })
    return {
      id: applicant.id,
      last_name: applicant.last_name,
      given_name: applicant.given_name,
      csa_status: applicant.csa_status,
    }
  }

  async remove(id: number): Promise<{ deleted: boolean; message?: string }> {
    try {
      await this.prisma.applicants.delete({
        where: {
          id: id,
        },
      })
      return { deleted: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { deleted: false, message }
    }
  }

  async searchApplicants(
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
      const parsedFilter = JSON.parse(filter)
      // Ensure filterObj is an array
      filterObj = Array.isArray(parsedFilter) ? parsedFilter : []
    } catch {
      throw new Error('Invalid query parameters')
    }
    const applicants = await this.prisma.applicants.findMany({
      skip: (page - 1) * limit,
      take: parseInt(String(limit)),
      orderBy: sortObj,
      where: this.convertFiltersToPrismaFormat(filterObj),
    })

    const count = await this.prisma.applicants.count({
      orderBy: sortObj,
      where: this.convertFiltersToPrismaFormat(filterObj),
    })

    return {
      applicants,
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
