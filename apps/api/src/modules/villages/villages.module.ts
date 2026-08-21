import { Module } from '@nestjs/common';
import { PublicVillagesController } from './public-villages.controller';
import { VillagesController } from './villages.controller';
import { VillagesService } from './villages.service';

@Module({
  controllers: [VillagesController, PublicVillagesController],
  providers: [VillagesService],
  exports: [VillagesService],
})
export class VillagesModule {}
