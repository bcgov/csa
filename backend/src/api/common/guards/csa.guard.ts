import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { JwtVerificationService } from 'src/common/auth/jwt-verification.service'
import { extractUsernameFromPayload } from 'src/common/auth/token-utils'
import { AdminService } from '../../admin/admin.service'
import { isValidUserProfile, UserProfile } from '../../admin/constants/user-profile.constants'

interface JwtPayload {
  exp?: number
  iat?: number
  sub?: string
  idir_username?: string
  preferred_username?: string
  email?: string
  [key: string]: unknown
}

// In-memory cache for CSA access results
// Key: username, Value: { hasAccess: boolean, userProfile: UserProfile | null, expiresAt: number }
const csaAccessCache = new Map<
  string,
  { hasAccess: boolean; userProfile?: UserProfile; expiresAt: number }
>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes cache TTL

export const SKIP_CSA_CHECK_KEY = 'skipCSACheck'

/**
 * Guard that validates JWT token and verifies CSA access via ICM
 * Uses caching to avoid hitting ICM on every request
 */
@Injectable()
export class CSAGuard implements CanActivate {
  private readonly logger = new Logger(CSAGuard.name)

  constructor(
    private readonly adminService: AdminService,
    private readonly reflector: Reflector,
    private readonly jwtVerificationService: JwtVerificationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked to skip CSA check
    const skipCSACheck = this.reflector.getAllAndOverride<boolean>(SKIP_CSA_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    const request = context.switchToHttp().getRequest<Request>()
    const authHeader = request.headers.authorization

    // Validate Authorization header exists
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required')
    }

    // Validate Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid token format. Expected: Bearer <token>')
    }

    // Extract and verify token signature using JWKS
    const token = authHeader.slice(7)
    const decoded = await this.verifyAndDecodeToken(token)

    // Attach decoded token and extracted username to request for use in route handlers
    const username = extractUsernameFromPayload(decoded as Record<string, unknown>)
    ;(request as any).user = decoded
    ;(request as any).username = username

    // If skipCSACheck is set, only validate token (don't check ICM)
    if (skipCSACheck) {
      return true
    }

    // Check cache first
    const cached = csaAccessCache.get(username)
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`CSA access cache hit for user: ${username}`)
      if (!cached.hasAccess) {
        throw new UnauthorizedException('User does not have CSA access')
      }
      // Attach cached user profile to request
      ;(request as any).userProfile = cached.userProfile ?? null
      return true
    }

    // Verify CSA access and fetch user profile from ICM
    this.logger.debug(`Verifying CSA access for user: ${username}`)
    const csaAccessResult = await this.adminService.verifyCSAAccess(username)
    const userProfile =
      csaAccessResult.userProfile && isValidUserProfile(csaAccessResult.userProfile)
        ? csaAccessResult.userProfile
        : null

    // Cache the result
    csaAccessCache.set(username, {
      hasAccess: csaAccessResult.hasAccess,
      ...(userProfile && { userProfile }),
      expiresAt: Date.now() + CACHE_TTL_MS,
    })

    if (!csaAccessResult.hasAccess) {
      this.logger.warn(`CSA access denied for user: ${username} - ${csaAccessResult.message}`)
      throw new UnauthorizedException(csaAccessResult.message || 'User does not have CSA access')
    }

    // Attach user profile to request for use in route handlers
    ;(request as any).userProfile = userProfile

    return true
  }

  /**
   * Verify token signature using JWKS and return decoded payload
   * This ensures the token was actually issued by our SSO Keycloak server
   */
  private async verifyAndDecodeToken(token: string): Promise<JwtPayload> {
    try {
      // Verify signature and decode using JWKS
      const payload = await this.jwtVerificationService.verifyToken(token)

      // Map jwt.JwtPayload to our JwtPayload interface
      return {
        exp: payload.exp,
        iat: payload.iat,
        sub: payload.sub,
        idir_username: payload.idir_username as string,
        preferred_username: payload.preferred_username as string,
        email: payload.email as string,
        ...payload,
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error
      }
      this.logger.error(`Token verification failed: ${error}`)
      throw new UnauthorizedException('Invalid token: Verification failed')
    }
  }
}

/**
 * Clear CSA access cache for a specific user or all users
 * Useful for testing or when user permissions change
 */
export function clearCSAAccessCache(username?: string): void {
  if (username) {
    csaAccessCache.delete(username.toUpperCase())
  } else {
    csaAccessCache.clear()
  }
}
