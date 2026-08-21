import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCustomerId } from '../../common/decorators/current-customer.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { paginate } from '../../common/dto/pagination.dto';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { BroadcastDto, NotificationListQueryDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my notifications' })
  async list(@Query() q: NotificationListQueryDto, @CurrentCustomerId() customerId: string) {
    const { rows, total, unread } = await this.notifications.listForCustomer(
      customerId,
      q.page,
      q.limit,
      q.unreadOnly,
    );
    return { ...paginate(rows, total, q.page, q.limit), unread };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count my unread notifications' })
  unreadCount(@CurrentCustomerId() customerId: string) {
    return this.notifications.unreadCount(customerId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all my notifications read' })
  markAllRead(@CurrentCustomerId() customerId: string) {
    return this.notifications.markAllRead(customerId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentCustomerId() customerId: string) {
    return this.notifications.markRead(customerId, id);
  }
}

@ApiTags('notifications (admin)')
@ApiBearerAuth()
@Controller('admin/notifications')
@Roles('superadmin', 'admin')
export class NotificationsAdminController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('broadcast')
  @ApiOperation({ summary: 'Broadcast a notification to customers (village-scoped)' })
  broadcast(@Body() dto: BroadcastDto, @CurrentUser() user: AdminPrincipal, @Ip() ip: string) {
    return this.notifications.broadcast(dto, user, ip);
  }
}
