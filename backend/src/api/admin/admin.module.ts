import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { KeycloakAuthModule } from 'src/common/auth/keycloak-auth.module'
import { adminConfig } from 'src/config/admin.config'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [adminConfig],
    }),
    HttpModule,
    KeycloakAuthModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
