import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createDb, type DbBundle } from './client';
import { DATABASE, DB_BUNDLE } from './database.constants';

@Injectable()
class DbLifecycle implements OnApplicationShutdown {
  private readonly logger = new Logger('Database');
  constructor(@Inject(DB_BUNDLE) private readonly bundle: DbBundle) {
    this.logger.log(`Connected (dialect=${bundle.dialect})`);
  }
  async onApplicationShutdown() {
    await this.bundle.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DB_BUNDLE,
      inject: [AppConfigService],
      useFactory: async (cfg: AppConfigService): Promise<DbBundle> =>
        createDb({ url: cfg.config.db.url, pglitePath: cfg.config.db.pglitePath }),
    },
    {
      provide: DATABASE,
      inject: [DB_BUNDLE],
      useFactory: (bundle: DbBundle) => bundle.db,
    },
    DbLifecycle,
  ],
  exports: [DATABASE, DB_BUNDLE],
})
export class DatabaseModule {}
