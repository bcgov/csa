import { HttpModule, HttpService } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { KeycloakAuthModule } from 'src/common/auth/keycloak-auth.module'
import { KeycloakAuthService } from 'src/common/auth/keycloak-auth.service'
import { PrismaModule } from 'src/common/database/prisma.module'
import { adminConfig } from 'src/config/admin.config'
import { icmConfig } from 'src/config/icm.config'
import { syncConfig } from 'src/config/sync.config'
import { IcmApiDataSource } from './data-source/icm-api-data-source'
import { IcmDataSource } from './data-source/icm-data-source'
import { MockIcmDataSource } from './data-source/mock-icm-data-source'
import { IcmSyncBackService } from './icm-sync-back.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [syncConfig, adminConfig, icmConfig],
    }),
    HttpModule,
    PrismaModule,
    KeycloakAuthModule,
  ],
  providers: [
    {
      provide: IcmDataSource,
      useFactory: (
        configService: ConfigService,
        httpService: HttpService,
        keycloakAuthService: KeycloakAuthService,
      ) => {
        return configService.get<boolean>('sync.useMockData')
          ? new MockIcmDataSource()
          : new IcmApiDataSource(httpService, configService, keycloakAuthService)
      },
      inject: [ConfigService, HttpService, KeycloakAuthService],
    },
    IcmSyncBackService,
  ],
  exports: [IcmSyncBackService, IcmDataSource],
})
export class IcmSyncBackModule {}
