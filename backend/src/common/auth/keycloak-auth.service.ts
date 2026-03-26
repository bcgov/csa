import { HttpService } from '@nestjs/axios'
import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { AppLogger } from 'src/common/logger/app-logger'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'

interface TokenCache {
  accessToken: string
  refreshToken: string | null
  expiresAt: number // Unix timestamp in milliseconds
}

@Injectable()
export class KeycloakAuthService {
  private readonly logger = new AppLogger(KeycloakAuthService.name)
  private tokenCache: TokenCache | null = null
  // Refresh token 60 seconds before expiry to avoid race conditions
  private readonly TOKEN_EXPIRY_BUFFER_MS = 60 * 1000

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getBearerToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.tokenCache && this.isTokenValid()) {
      this.logger.debug('Using cached access token')
      return this.tokenCache.accessToken
    }

    // Try to refresh if we have a refresh token
    if (this.tokenCache?.refreshToken) {
      try {
        this.logger.log('Access token expired, attempting to refresh...')
        return await this.refreshAccessToken()
      } catch (error) {
        this.logger.warn('Failed to refresh token, falling back to client_credentials:', error)
        // Fall through to get a new token
      }
    }

    // Get a new token using client_credentials
    return await this.fetchNewToken()
  }

  private isTokenValid(): boolean {
    if (!this.tokenCache) return false
    const now = Date.now()
    return this.tokenCache.expiresAt - this.TOKEN_EXPIRY_BUFFER_MS > now
  }

  private async fetchNewToken(): Promise<string> {
    const keycloakTokenUrl = this.configService.get<string>('admin.keycloakTokenUrl')!
    const keycloakClientId = this.configService.get<string>('admin.keycloakClientId')!
    const keycloakClientSecret = this.configService.get<string>('admin.keycloakClientSecret')!

    const params = new URLSearchParams()
    params.append('grant_type', 'client_credentials')
    params.append('client_id', keycloakClientId)
    params.append('client_secret', keycloakClientSecret)

    try {
      this.logger.log('Requesting new Keycloak token from:', keycloakTokenUrl)
      const response = await firstValueFrom(
        this.httpService.post(keycloakTokenUrl, params, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      )

      this.cacheTokenResponse(response.data)
      this.logger.log('New Keycloak token obtained successfully')

      return response.data.access_token
    } catch (error) {
      this.logger.alert('Failed to obtain Keycloak bearer token', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw new HttpException(
        'Failed to authenticate with ICM service',
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  private async refreshAccessToken(): Promise<string> {
    const keycloakTokenUrl = this.configService.get<string>('admin.keycloakTokenUrl')!
    const keycloakClientId = this.configService.get<string>('admin.keycloakClientId')!
    const keycloakClientSecret = this.configService.get<string>('admin.keycloakClientSecret')!

    const params = new URLSearchParams()
    params.append('grant_type', 'refresh_token')
    params.append('refresh_token', this.tokenCache!.refreshToken!)
    params.append('client_id', keycloakClientId)
    params.append('client_secret', keycloakClientSecret)

    this.logger.log('Refreshing Keycloak token...')
    const response = await firstValueFrom(
      this.httpService.post(keycloakTokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }),
    )

    this.cacheTokenResponse(response.data)
    this.logger.log('Keycloak token refreshed successfully')

    return response.data.access_token
  }

  private cacheTokenResponse(data: {
    access_token: string
    refresh_token?: string
    expires_in: number
  }): void {
    const now = Date.now()
    // expires_in is in seconds, convert to milliseconds
    const expiresAt = now + data.expires_in * 1000

    this.tokenCache = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.tokenCache?.refreshToken || null,
      expiresAt,
    }

    this.logger.debug(
      `Token cached, expires at ${new Date(expiresAt).toISOString()} (in ${data.expires_in} seconds)`,
    )
  }

  /**
   * Force clear the token cache. Useful for testing or when token is revoked.
   */
  clearTokenCache(): void {
    this.tokenCache = null
    this.logger.log('Token cache cleared')
  }
}
