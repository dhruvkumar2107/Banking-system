import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { paginate } from '../../common/dto/pagination.dto';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import {
  AdminListQueryDto,
  ChangePasswordDto,
  CreateAdminDto,
  ResetPasswordDto,
  UpdateAdminDto,
} from './admins.dto';
import { AdminsService } from './admins.service';

@ApiTags('admins')
@ApiBearerAuth()
@Controller('admins')
@Roles('superadmin')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get()
  @ApiOperation({ summary: 'List admin users (superadmin)' })
  async list(@Query() q: AdminListQueryDto) {
    const { rows, total } = await this.admins.list(q);
    return paginate(rows, total, q.page, q.limit);
  }

  @Post()
  @ApiOperation({ summary: 'Create an admin user (superadmin)' })
  create(@Body() dto: CreateAdminDto, @CurrentUser() user: AdminPrincipal, @Ip() ip: string) {
    return this.admins.create(dto, user, ip);
  }

  // Self-service password change — any authenticated admin. Declared before ":id"
  // routes so "me" is never captured as a uuid param.
  @Patch('me/password')
  @Roles('superadmin', 'admin', 'agent')
  @ApiOperation({ summary: 'Change your own password' })
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.admins.changeOwnPassword(user, dto.currentPassword, dto.newPassword, ip);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin detail (superadmin)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.admins.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an admin (role, villages, active)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.admins.update(id, dto, user, ip);
  }

  @Patch(':id/password')
  @ApiOperation({ summary: "Reset an admin's password (superadmin)" })
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.admins.resetPassword(id, dto.newPassword, user, ip);
  }
}
