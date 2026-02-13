import { IcmApiConfig } from '../icm.config'

export interface IcmApiRecord {
  [label: string]: string | number | null
}

export abstract class IcmDataSource {
  abstract fetchAll(config: IcmApiConfig, lastUpdated?: Date): Promise<IcmApiRecord[]>
}
