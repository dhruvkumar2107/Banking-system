import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { PaymentsModule } from '../payments/payments.module';
import { PigmyModule } from '../pigmy/pigmy.module';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [CustomersModule, PaymentsModule, PigmyModule, LedgerModule, NotificationsModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
