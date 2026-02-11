import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'

@Injectable()
export class KeycloakAuthService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getBearerToken(): Promise<string> {
    const keycloakTokenUrl = this.configService.get<string>('admin.keycloakTokenUrl')!
    const keycloakClientId = this.configService.get<string>('admin.keycloakClientId')!
    const keycloakClientSecret = this.configService.get<string>('admin.keycloakClientSecret')!

    const params = new URLSearchParams()
    params.append('grant_type', 'client_credentials')
    params.append('client_id', keycloakClientId)
    params.append('client_secret', keycloakClientSecret)

    const response = await firstValueFrom(
      this.httpService.post(keycloakTokenUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    )

    return response.data.access_token
  }
}
