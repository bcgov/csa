import { Injectable } from '@nestjs/common'
import { readFileSync } from 'fs'
import { CraDetail, CraHeader, CraTrailer } from '../outbound-file/file-create.interface'

@Injectable()
export class FileDecodeService {
  // Helper method to slice field values

  private slice(line: string, start: number, length: number): string {
    return line.substring(start, start + length).trim()
  }

  private parseHeader(line: string): CraHeader {
    return {
      tranCode: this.slice(line, 0, 4), // 6133
      versionNum: this.slice(line, 4, 5),
      processDate: this.slice(line, 9, 8),
      businessNum: this.slice(line, 17, 15),
      recordCount: parseInt(this.slice(line, 32, 8), 10),
      filler: this.slice(line, 57, 25),
    }
  }
  private parseDetail(line: string): any {
    return {
      tranCode: 6134,

      referenceNum: this.slice(line, 4, 20),
      businessNum: this.slice(line, 24, 15),
      tranType: parseInt(this.slice(line, 39, 1)),

      childGivenName: this.slice(line, 40, 30),
      childInitial: this.slice(line, 70, 1),
      childSurName: this.slice(line, 71, 30),

      childGivenNameAka: this.slice(line, 101, 30),
      childSurNameAka: this.slice(line, 131, 30),

      childBirthDate: this.slice(line, 161, 8),
      childSex: this.slice(line, 169, 1),
      childBirthCity: this.slice(line, 170, 28),
      childBirthProv: this.slice(line, 198, 2),
      childBirthCountry: this.slice(line, 200, 2),

      prevRecipSin: this.slice(line, 202, 9),
      filler1: this.slice(line, 211, 6),
      prevRecipGivenName: this.slice(line, 217, 30),
      prevRecipSurName: this.slice(line, 247, 30),

      appStartDate: this.slice(line, 277, 8),
      newBornCode: this.slice(line, 285, 1),

      cancelEndDate: this.slice(line, 286, 8),
      cancelReasonCode: this.slice(line, 294, 2),

      ccraDinNum: this.slice(line, 296, 9),
    }
  }

  private parseTrailer(line: string): CraTrailer {
    return {
      tranCode: this.slice(line, 0, 4), // 6135
      versionNum: this.slice(line, 4, 5),
      processDate: this.slice(line, 9, 8),
      businessNum: this.slice(line, 17, 15),
      recordCount: parseInt(this.slice(line, 32, 8), 10),
      filler: this.slice(line, 57, 25),
    }
  }

  parseFile(filePath: string): {
    header: CraHeader
    details: CraDetail[]
    trailer: CraTrailer
  } {
    const content = readFileSync(filePath, 'utf8')
    const lines = content.split('\n').filter(Boolean)

    let header!: CraHeader // ! = definite assignment assertion operator
    let trailer!: CraTrailer
    const details: CraDetail[] = []

    for (const line of lines) {
      const tranCode = line.substring(0, 4)

      if (tranCode === '6133') {
        header = this.parseHeader(line)
      } else if (tranCode === '6134') {
        details.push(this.parseDetail(line))
      } else if (tranCode === '6135') {
        trailer = this.parseTrailer(line)
      }
    }

    return { header, details, trailer }
  }
}

// test parsing
// const outputPath = 'output_cra_file.txt'
// const creator = new FileDecodeService()
// const parsed = creator.parseFile(outputPath)
// console.log('parsed file', JSON.stringify(parsed, null, 2))
