import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto, paginate } from '../../common/dto/pagination.dto';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { AuditService } from './audit.service';

class AuditQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() actorId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
@Roles('superadmin', 'admin')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit logs (read-only)' })
  async list(@Query() q: AuditQueryDto, @CurrentUser() user: AdminPrincipal) {
    // The audit trail is cross-village and carries PII in its before/after
    // payloads, and there is no single village column to filter on. To keep it
    // fail-closed, a non-superadmin only ever sees the actions it performed
    // itself (which are already village-gated); superadmins see everything.
    const actorId = user.role === 'superadmin' ? q.actorId : user.sub;
    const { rows, total } = await this.audit.list(
      {
        entity: q.entity,
        entityId: q.entityId,
        actorId,
        action: q.action,
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
      },
      q.page,
      q.limit,
    );
    return paginate(rows, total, q.page, q.limit);
  }
}
