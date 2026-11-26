import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-error';
import { loadApiConfig } from './common/config';

export async function configureVitsApp(
  app: Awaited<ReturnType<typeof NestFactory.create>>,
  enableRateLimit = true,
) {
  const cfg = loadApiConfig();

  app.setGlobalPrefix('v1');
  app.use(helmet());
  app.enableCors({
    origin: cfg.corsOrigins,
    credentials: false,
  });

  if (enableRateLimit) {
    app.use(
      '/v1/auth/login',
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many login attempts. Please wait before trying again.',
            correlationId: 'rate-limit',
            timestamp: new Date().toISOString(),
          },
        },
      }),
    );
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('VITS Library Duty & Scheduling API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('v1/docs', app, doc);

  return cfg;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const cfg = await configureVitsApp(app, cfgShouldLimit());
  await app.listen(cfg.port);
  console.log(`VITS API listening on http://localhost:${cfg.port}/v1 (OpenAPI: /v1/docs)`);
}

function cfgShouldLimit(): boolean {
  return process.env['NODE_ENV'] !== 'test';
}

const entryArg = process.argv[1]?.replace(/\\/g, '/') ?? '';
const isEntrypoint = entryArg.endsWith('main.ts') || entryArg.endsWith('main.cjs');

if (isEntrypoint || process.env['VITS_API_AUTOSTART'] === 'true') {
  void bootstrap();
}
