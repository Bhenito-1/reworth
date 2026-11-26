import { INestApplication, Logger } from '@nestjs/common';

const DOCS_PATH = 'docs';

function loadSwagger(): Record<string, unknown> | null {
  try {
    // Optional at runtime when install is incomplete (e.g. offline dev).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@nestjs/swagger');
  } catch {
    return null;
  }
}

/** Interactive OpenAPI UI. Off in production unless SWAGGER_ENABLED=true. */
export function setupSwagger(app: INestApplication): void {
  if (!swaggerEnabled()) return;

  const swagger = loadSwagger();
  if (!swagger) {
    new Logger('Swagger').warn(
      '@nestjs/swagger not installed — API docs disabled',
    );
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { DocumentBuilder, SwaggerModule } = swagger as any;

  const apiUrl = (process.env.API_URL ?? 'http://localhost:3001').replace(
    /\/$/,
    '',
  );
  const config = new DocumentBuilder()
    .setTitle('ReWorth API')
    .setDescription(
      'ReWorth marketplace API (buy, sell, swap, give away). Every route is under /api/v1. Protected routes take an Authorization Bearer access token. Use Authorize to attach a token before trying a call.',
    )
    .setVersion('1.0')
    .addServer(apiUrl, 'This API')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token from POST /api/v1/auth/login',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(DOCS_PATH, app, document, {
    customSiteTitle: 'ReWorth API',
    jsonDocumentUrl: `${DOCS_PATH}/openapi.json`,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  new Logger('Swagger').log(`API docs at ${apiUrl}/${DOCS_PATH}`);
}

export function swaggerEnabled(): boolean {
  const flag = process.env.SWAGGER_ENABLED?.trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  if (flag === 'true' || flag === '1' || flag === 'on') return true;
  return process.env.NODE_ENV !== 'production';
}

/**
 * Swagger UI boots from a small inline script. Helmet's default script-src
 * blocks that, so docs routes get a slightly looser policy than the API.
 */
export function isSwaggerDocsPath(path: string): boolean {
  return path === `/${DOCS_PATH}` || path.startsWith(`/${DOCS_PATH}/`);
}
