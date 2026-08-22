import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { KycAdminController } from './kyc-admin.controller';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

/**
 * KYC verification and the gate it drives. Exported so other modules (loans,
 * payments) can query the gate state, and so the globally-registered
 * KycVerifiedGuard can resolve it.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [KycController, KycAdminController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
