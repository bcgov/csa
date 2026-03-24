import { IcmApiConfig } from '../icm.config'

export interface IcmApiRecord {
  [label: string]: string | number | null
}

export interface IcmContactUpdatePayload {
  Id: string
  'CSA Status': string
  'CSA Status Effective Date': string
  'CSA DIN'?: string
  'CSA Sent Date'?: string
}

export abstract class IcmDataSource {
  abstract fetchAll(config: IcmApiConfig, lastUpdated?: Date): Promise<IcmApiRecord[]>
  abstract updateContacts(contacts: IcmContactUpdatePayload[]): Promise<void>
}
