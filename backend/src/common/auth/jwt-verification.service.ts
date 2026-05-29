import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'

/**
 * Service for verifying JWT signatures using JWKS (JSON Web Key Set)
 * Fetches public keys from the SSO Keycloak server to verify frontend tokens
 *
 * When SKIP_SSO_VERIFICATION=true (local development), token signatures are not verified
 * but the token is still decoded to extract user information.
 */
@Injectable()
export class JwtVerificationService {
  private readonly logger = new Logger(JwtVerificationService.name)
  private readonly jwksClient: jwksClient.JwksClient | null = null
  private readonly skipVerification: boolean

  constructor(private readonly configService: ConfigService) {
    const nodeEnv = this.configService.get<string>('NODE_ENV')
    this.skipVerification = nodeEnv === 'local'

    if (this.skipVerification) {
      this.logger.warn(
        '⚠️  SSO verification is DISABLED (NODE_ENV=local). ' +
          'This should only be used for local development!',
      )
      return
    }

    const jwksUri = this.configService.get<string>('admin.ssoKeycloakJwksUrl')

    if (!jwksUri) {
      throw new Error('SSO_KEYCLOAK_JWKS_URL is required for JWT verification')
    }

    this.jwksClient = jwksClient({
      jwksUri,
      cache: true,
      cacheMaxAge: 600000, // 10 minutes
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    })

    this.logger.log(`JWT verification initialized with JWKS URI: ${jwksUri}`)
  }

  /**
   * Verify and decode a JWT token
   * @param token - The JWT token to verify
   * @returns The decoded token payload
   * @throws UnauthorizedException if verification fails
   */
  async verifyToken(token: string): Promise<jwt.JwtPayload> {
    // In local development mode, skip signature verification
    if (this.skipVerification) {
      return this.decodeTokenWithoutVerification(token)
    }

    try {
      // First decode the header to get the key ID (kid)
      const decodedHeader = jwt.decode(token, { complete: true })

      if (!decodedHeader || typeof decodedHeader === 'string') {
        throw new UnauthorizedException('Invalid token: Unable to decode')
      }

      const kid = decodedHeader.header.kid
      if (!kid) {
        throw new UnauthorizedException('Invalid token: Missing key ID (kid)')
      }

      // Get the signing key from JWKS
      const signingKey = await this.getSigningKey(kid)

      // Verify the token with the public key
      const payload = jwt.verify(token, signingKey, {
        algorithms: ['RS256', 'RS384', 'RS512'],
      }) as jwt.JwtPayload

      return payload
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Token has expired. Please login again.')
      }

      if (error instanceof jwt.JsonWebTokenError) {
        this.logger.error(`JWT verification failed: ${error.message}`)
        throw new UnauthorizedException(`Invalid token: ${error.message}`)
      }

      this.logger.error(`Token verification error: ${error}`)
      throw new UnauthorizedException('Token verification failed')
    }
  }

  /**
   * Decode token without signature verification (for local development only)
   * Still validates token structure and expiration
   */
  private decodeTokenWithoutVerification(token: string): jwt.JwtPayload {
    try {
      const decoded = jwt.decode(token, { complete: true })

      if (!decoded || typeof decoded === 'string') {
        throw new UnauthorizedException('Invalid token: Unable to decode')
      }

      const payload = decoded.payload as jwt.JwtPayload

      // Check expiration even in local mode
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedException('Token has expired. Please login again.')
      }

      this.logger.debug('Token decoded without verification (local development mode)')
      return payload
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error
      }
      this.logger.error(`Token decode error: ${error}`)
      throw new UnauthorizedException('Invalid token format')
    }
  }

  /**
   * Get the signing key for a given key ID
   */
  private async getSigningKey(kid: string): Promise<string> {
    if (!this.jwksClient) {
      throw new Error('JWKS client not initialized - SSO verification is disabled')
    }
    try {
      const key = await this.jwksClient.getSigningKey(kid)
      return key.getPublicKey()
    } catch (error) {
      this.logger.error(`Failed to get signing key for kid ${kid}: ${error}`)
      throw new UnauthorizedException('Unable to verify token: Key not found')
    }
  }
}
