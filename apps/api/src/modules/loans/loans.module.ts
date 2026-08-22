import { Module } from '@nestjs/common';
import { KycModule } from '../kyc/kyc.module';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoanOverdueScheduler } from './loan-overdue.scheduler';
import { LoanSettingsService } from './loan-settings.service';
import { LoansAdminController } from './loans-admin.controller';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

/**
 * The loan book. Imports LedgerModule because a `from_savings` repayment posts a
 * real ledger debit, and KycModule because an unverified customer may not borrow.
 */
@Module({
  imports: [LedgerModule, NotificationsModule, KycModule],
  controllers: [LoansController, LoansAdminController],
  providers: [LoansService, LoanSettingsService, LoanOverdueScheduler],
  exports: [LoansService, LoanSettingsService],
})
export class LoansModule {}
