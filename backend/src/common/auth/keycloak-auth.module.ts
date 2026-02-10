import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { KeycloakAuthService } from './keycloak-auth.service'

@Module({
  imports: [HttpModule],
  providers: [KeycloakAuthService],
  exports: [KeycloakAuthService],
})
export class KeycloakAuthModule {}
