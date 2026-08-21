import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';

/**
 * Global config module. AppConfigService parses process.env once and is then
 * injectable everywhere without re-importing this module.
 */
@Global()
@Module({
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigModule {}
