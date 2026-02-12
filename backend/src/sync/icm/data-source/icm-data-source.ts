import { IcmApiConfig } from '../icm.config'

export interface IcmApiRecord {
  [label: string]: string | number | null
}

export abstract class IcmDataSource {
  abstract fetchAll(
    config: IcmApiConfig,
    bearerToken: string,
    lastUpdated?: Date,
  ): Promise<IcmApiRecord[]>
}
