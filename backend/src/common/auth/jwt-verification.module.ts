import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { adminConfig } from 'src/config/admin.config'
import { JwtVerificationService } from './jwt-verification.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [adminConfig],
    }),
  ],
  providers: [JwtVerificationService],
  exports: [JwtVerificationService],
})
export class JwtVerificationModule {}
