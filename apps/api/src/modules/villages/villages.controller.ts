import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import { CreateVillageDto, UpdateVillageDto } from './villages.dto';
import { VillagesService } from './villages.service';

@ApiTags('villages')
@ApiBearerAuth()
@Controller('villages')
@Roles('superadmin', 'admin', 'agent')
export class VillagesController {
  constructor(private readonly villages: VillagesService) {}

  @Post()
  @Roles('superadmin')
  @ApiOperation({ summary: 'Create a village (superadmin)' })
  create(@Body() dto: CreateVillageDto, @CurrentUser() user: AdminPrincipal, @Ip() ip: string) {
    return this.villages.create(dto, user, ip);
  }

  @Get()
  @ApiOperation({ summary: 'List villages (scoped to the admin)' })
  findAll(@CurrentUser() user: AdminPrincipal) {
    return this.villages.findAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Village detail with stats' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AdminPrincipal) {
    return this.villages.findOne(id, user);
  }

  @Patch(':id')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Update a village' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVillageDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.villages.update(id, dto, user, ip);
  }
}
