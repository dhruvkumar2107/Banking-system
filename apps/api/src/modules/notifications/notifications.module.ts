import { Module } from '@nestjs/common';
import { NotificationsAdminController, NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsScheduler } from './notifications.scheduler';

@Module({
  controllers: [NotificationsController, NotificationsAdminController],
  providers: [NotificationsService, NotificationsScheduler],
  exports: [NotificationsService],
})
export class NotificationsModule {}
