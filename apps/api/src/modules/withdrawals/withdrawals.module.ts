import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MaturityScheduler } from './maturity.scheduler';
import { SchemeService } from './scheme.service';
import { WithdrawalsAdminController } from './withdrawals-admin.controller';
import { WithdrawalsController } from './withdrawals.controller';
import { WithdrawalsService } from './withdrawals.service';

@Module({
  imports: [LedgerModule, NotificationsModule],
  controllers: [WithdrawalsController, WithdrawalsAdminController],
  providers: [WithdrawalsService, SchemeService, MaturityScheduler],
  exports: [WithdrawalsService, SchemeService],
})
export class WithdrawalsModule {}
