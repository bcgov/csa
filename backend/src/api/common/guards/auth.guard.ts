import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import * as jwt from 'jsonwebtoken'

interface JwtPayload {
  exp?: number
  iat?: number
  sub?: string
  [key: string]: unknown
}

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const authHeader = request.headers.authorization

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required')
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid token format. Expected: Bearer <token>')
    }

    // Extract the token (remove 'Bearer ' prefix)
    const token = authHeader.slice(7)

    // Decode and validate the token
    const decoded = this.decodeAndValidateToken(token)

    // Attach decoded token to request for use in route handlers
    ;(request as any).user = decoded

    return true
  }

  private decodeAndValidateToken(token: string): JwtPayload {
    try {
      const decoded = jwt.decode(token) as JwtPayload

      if (!decoded) {
        throw new UnauthorizedException('Invalid token: Unable to decode')
      }

      // Check if token has expiration claim
      if (decoded.exp) {
        const currentTime = Math.floor(Date.now() / 1000) // Current time in seconds

        if (decoded.exp < currentTime) {
          throw new UnauthorizedException('Token has expired. Please login again.')
        }
      }

      return decoded
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error
      }
      throw new UnauthorizedException('Invalid token: Failed to decode')
    }
  }
}
