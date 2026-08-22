import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { paginate } from '../../common/dto/pagination.dto';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { BypassKycDto, KycListQueryDto, RejectKycDto } from './kyc.dto';
import { KycService } from './kyc.service';

/**
 * Admin KYC review. An `agent` may read the queue and open a submission but
 * cannot decide — verify/reject/bypass are restricted to admin and superadmin,
 * for the same reason withdrawals are: the person who takes the papers at the
 * counter should not be the person who clears them.
 */
@ApiTags('kyc (admin)')
@ApiBearerAuth()
@Controller('kyc')
@Roles('superadmin', 'admin', 'agent')
export class KycAdminController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  @ApiOperation({ summary: 'KYC queue (village-scoped; defaults to submissions awaiting review)' })
  async list(@Query() q: KycListQueryDto, @CurrentUser() user: AdminPrincipal) {
    const { rows, total } = await this.kyc.listForAdmin(user, q);
    return paginate(rows, total, q.page, q.limit);
  }

  @Get('pending-count')
  @ApiOperation({ summary: 'How many KYC submissions await review' })
  pendingCount(@CurrentUser() user: AdminPrincipal) {
    return this.kyc.pendingCount(user);
  }

  @Get(':customerId')
  @ApiOperation({ summary: 'One submission: photo, Aadhaar (masked), nominees, documents' })
  detail(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @CurrentUser() user: AdminPrincipal,
  ) {
    return this.kyc.detailForAdmin(customerId, user);
  }

  @Post(':customerId/verify')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Approve a submission — unlocks deposits, loans and withdrawals' })
  verify(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.kyc.verify(customerId, user, ip);
  }

  @Post(':customerId/reject')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Reject a submission with a reason the customer will see' })
  reject(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: RejectKycDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.kyc.reject(customerId, dto, user, ip);
  }

  @Post(':customerId/bypass')
  @Roles('superadmin', 'admin')
  @ApiOperation({
    summary: 'Bypass the KYC requirement (manual override — reason mandatory, fully audited)',
    description:
      'The only way past the gate without a verified submission. Use when the documents ' +
      'have been checked in person at the branch. Recorded as kyc.bypassed, never as a ' +
      'verification, so the audit trail always distinguishes the two.',
  })
  bypass(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: BypassKycDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.kyc.bypass(customerId, dto, user, ip);
  }
}
