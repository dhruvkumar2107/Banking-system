import 'dotenv/config';
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { DB_BUNDLE } from './db/database.constants';
import type { DbBundle } from './db/client';
import { applyMigrations } from './db/run-migrations';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // rawBody: true lets the Razorpay webhook verify the HMAC over the exact bytes.
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: false });
  const appConfig = app.get(AppConfigService);
  const cfg = appConfig.config;

  // Fail fast: never boot a production deploy that would echo OTP codes or run
  // on dev-default secrets. With DEMO_MODE=true the mock gateway and console SMS
  // are downgraded to warnings so a hosted demo can still run under
  // NODE_ENV=production (keeping strict CORS and OTP secrecy).
  const readiness = appConfig.productionReadiness();
  for (const warning of readiness.warnings) {
    logger.warn(`DEMO_MODE: ${warning}`);
  }
  if (readiness.warnings.length > 0) {
    logger.warn('Running in DEMO_MODE — not suitable for real customer money.');
  }
  if (readiness.fatal.length > 0) {
    for (const issue of readiness.fatal) logger.error(`Production readiness: ${issue}`);
    throw new Error(
      `Refusing to start in production with ${readiness.fatal.length} configuration issue(s) — see logs above.`,
    );
  }

  // Apply DB migrations on boot so the app is runnable out of the box (idempotent).
  const bundle = app.get<DbBundle>(DB_BUNDLE);
  try {
    await applyMigrations(bundle);
    logger.log(`Migrations applied (dialect=${bundle.dialect})`);
  } catch (err) {
    logger.error('Migration failed on boot', err as Error);
    throw err;
  }

  // Security headers.
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS for the admin panel / app.
  app.enableCors({
    origin: cfg.isProd ? cfg.security.corsOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global validation: strip unknown props, transform payloads to DTO types.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Everything the app serves lives under `/api`.
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  // Friendly landing + liveness OUTSIDE the /api prefix, registered directly on
  // the underlying Express instance. Without these, a browser hitting the bare
  // host (or /health) gets "Cannot GET /" — which reads to a human as the API
  // "showing a not-found error". These are public by design (no auth/RBAC).
  const startedAt = Date.now();
  const http = app.getHttpAdapter().getInstance();
  http.get('/', (_req: unknown, res: { json: (b: unknown) => void }) =>
    res.json({
      name: 'Digital Pigmee API',
      status: 'ok',
      version: '0.1.0',
      docs: '/docs',
      health: '/health',
      api: '/api',
    }),
  );
  http.get('/health', (_req: unknown, res: { json: (b: unknown) => void }) =>
    res.json({
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      env: cfg.env,
      paymentsMode: cfg.razorpay.mode,
      time: new Date().toISOString(),
    }),
  );

  // OpenAPI docs at /docs.
  const swaggerCfg = new DocumentBuilder()
    .setTitle('Digital Pigmee API')
    .setDescription('Corporate Bank daily micro-savings platform — REST API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerCfg);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // Bind 0.0.0.0 explicitly: managed hosts (Render, Koyeb, Fly) route to the
  // container's external interface and treat a loopback-only bind as a failed
  // health check.
  await app.listen(cfg.port, '0.0.0.0');
  logger.log(`Digital Pigmee API listening on ${cfg.apiBaseUrl}`);
  logger.log(`Swagger docs at ${cfg.apiBaseUrl}/docs`);
  logger.log(`Payments mode: ${cfg.razorpay.mode}`);

  // Free tiers on managed hosts give you no shell, so `npm run seed` can never
  // be run after a deploy. SEED_ON_BOOT covers that: idempotent, and started
  // only after listen() so a multi-second seed cannot fail the health check.
  if (cfg.seed.onBoot) {
    // Imported lazily so the seed module (and its demo data) stays out of the
    // server process entirely unless it is actually asked for.
    const { runSeed } = await import('./db/seed');
    runSeed(app)
      .then(() => logger.log('SEED_ON_BOOT complete'))
      .catch((err) => logger.error('SEED_ON_BOOT failed — API stays up', err as Error));
  }
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
