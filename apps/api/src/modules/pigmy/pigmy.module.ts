import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { PigmyController } from './pigmy.controller';
import { PigmyService } from './pigmy.service';

@Module({
  imports: [LedgerModule],
  controllers: [PigmyController],
  providers: [PigmyService],
  exports: [PigmyService],
})
export class PigmyModule {}
