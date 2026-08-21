import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppConfigService } from '../../config/app-config.service';
import { CustomersModule } from '../customers/customers.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { OtpService } from './otp.service';
import { SmsService } from './sms.service';
import { TokensService } from './tokens.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => ({
        secret: cfg.config.jwt.accessSecret,
        signOptions: { expiresIn: cfg.config.jwt.accessTtl },
      }),
    }),
    CustomersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService, TokensService, SmsService, JwtStrategy],
  exports: [TokensService, JwtStrategy, JwtModule, PassportModule],
})
export class AuthModule {}
