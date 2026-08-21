import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { VillagesService } from './villages.service';

/**
 * Unauthenticated, read-only endpoints consumed by the customer app before the
 * user has a token (e.g. the village picker on the registration screen).
 * Kept on a separate controller with no class-level @Roles so the global
 * RolesGuard does not require an admin principal.
 */
@ApiTags('public')
@Controller('public')
export class PublicVillagesController {
  constructor(private readonly villages: VillagesService) {}

  @Get('villages')
  @Public()
  @ApiOperation({ summary: 'List villages for registration (public, id/name/code only)' })
  listVillages() {
    return this.villages.listPublic();
  }
}
