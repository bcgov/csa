import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { JwtVerificationModule } from 'src/common/auth/jwt-verification.module'
import { KeycloakAuthModule } from 'src/common/auth/keycloak-auth.module'
import { adminConfig } from 'src/config/admin.config'
import { icmConfig } from 'src/config/icm.config'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [adminConfig, icmConfig],
    }),
    HttpModule,
    KeycloakAuthModule,
    JwtVerificationModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService, JwtVerificationModule],
})
export class AdminModule {}
