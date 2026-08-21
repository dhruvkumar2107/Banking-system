import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { PigmyModule } from '../pigmy/pigmy.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { TransactionsAdminController } from './transactions-admin.controller';
import { PaymentsService } from './payments.service';
import { PaymentsScheduler } from './payments.scheduler';
import { RazorpayService } from './razorpay.service';
import { ReceiptService } from './receipt.service';

@Module({
  imports: [LedgerModule, PigmyModule, NotificationsModule],
  controllers: [PaymentsController, PaymentsWebhookController, TransactionsAdminController],
  providers: [PaymentsService, PaymentsScheduler, RazorpayService, ReceiptService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
