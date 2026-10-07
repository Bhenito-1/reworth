import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, raw } from 'express';
import express from 'express';
import helmet from 'helmet';
import { existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { defaultMediaRoot } from './providers/local-fs-storage.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));

  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const adminOrigin = process.env.ADMIN_ORIGIN ?? 'http://localhost:3002';
  app.enableCors({
    origin: [webOrigin, adminOrigin],
    credentials: true,
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
          connectSrc: ["'self'", webOrigin, adminOrigin],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(helmet.hidePoweredBy());
  app.use(helmet.noSniff());
  app.use(helmet.frameguard({ action: 'deny' }));
  app.use(helmet.hsts({ maxAge: 15552000, includeSubDomains: true }));

  // Preserve raw body for Paystack webhook HMAC (ADR-002)
  app.use(
    '/api/v1/webhooks/paystack',
    raw({ type: '*/*' }),
    (
      req: { body?: Buffer | unknown; rawBody?: Buffer },
      _res: unknown,
      next: () => void,
    ) => {
      if (Buffer.isBuffer(req.body)) {
        req.rawBody = req.body;
        try {
          req.body = JSON.parse(req.body.toString('utf8'));
        } catch {
          /* leave as-is if not JSON */
        }
      }
      next();
    },
  );
  // Estate partner membership sync HMAC (Phase 3.2)
  app.use(
    '/api/v1/partner/members/sync',
    raw({ type: '*/*' }),
    (
      req: { body?: Buffer | unknown; rawBody?: Buffer },
      _res: unknown,
      next: () => void,
    ) => {
      if (Buffer.isBuffer(req.body)) {
        req.rawBody = req.body;
        try {
          req.body = JSON.parse(req.body.toString('utf8'));
        } catch {
          /* leave as-is if not JSON */
        }
      }
      next();
    },
  );
  // Local media uploads (STORAGE_DRIVER=local) — binary PUT body
  app.use('/api/v1/media/upload', raw({ type: '*/*', limit: '12mb' }));

  app.use(json({ limit: '2mb' }));

  // Local disk media (replaces adobe/s3mock when STORAGE_DRIVER=local)
  const storageDriver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (storageDriver === 'local' || storageDriver === 'fs') {
    const bucket = process.env.S3_BUCKET ?? 'reworth-media';
    const root = process.env.MEDIA_LOCAL_DIR
      ? resolve(process.env.MEDIA_LOCAL_DIR)
      : defaultMediaRoot();
    const serveRoot = join(root, bucket);
    if (!existsSync(serveRoot)) mkdirSync(serveRoot, { recursive: true });
    app.use(
      '/api/v1/media/files',
      express.static(serveRoot, {
        fallthrough: true,
        setHeaders: (res) => {
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Cache-Control', 'public, max-age=86400');
        },
      }),
    );
  }

  // All routes under /api/v1 including healthz (PRD §43 / Phase 0 brief)
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

bootstrap();
