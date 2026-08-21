import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppConfigService } from './config/app-config.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './db/database.module';

import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { VillagesModule } from './modules/villages/villages.module';
import { CustomersModule } from './modules/customers/customers.module';
import { PigmyModule } from './modules/pigmy/pigmy.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { WithdrawalsModule } from './modules/withdrawals/withdrawals.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AdminsModule } from './modules/admins/admins.module';
import { MeModule } from './modules/me/me.module';
import { UploadsModule } from './modules/uploads/uploads.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Root module. Global cross-cutting modules (config, database, audit) are
 * registered first, followed by the feature modules. Three global guards run in
 * order on every request: throttler → JWT auth → RBAC. A single exception filter
 * shapes all error responses.
 */
@Module({
  imports: [
    // Cross-cutting (all @Global)
    ConfigModule,
    DatabaseModule,
    AuditModule,

    // Cron / interval scheduling (drives the daily notifications scheduler).
    ScheduleModule.forRoot(),

    // Rate limiting — default bucket applied to every route; tightened per-route
    // via @Throttle (e.g. on OTP endpoints).
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => ({
        throttlers: [
          {
            ttl: cfg.config.security.throttleTtl * 1000,
            limit: cfg.config.security.throttleLimit,
          },
        ],
      }),
    }),

    // Feature modules
    AuthModule,
    VillagesModule,
    CustomersModule,
    PigmyModule,
    LedgerModule,
    PaymentsModule,
    WithdrawalsModule,
    NotificationsModule,
    ReportsModule,
    AdminsModule,
    MeModule,
    UploadsModule,
  ],
  providers: [
    // Order matters: throttle first, then authenticate, then authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
