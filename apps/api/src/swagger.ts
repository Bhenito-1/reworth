import { INestApplication, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const DOCS_PATH = 'docs';

/** Interactive OpenAPI UI. Off in production unless SWAGGER_ENABLED=true. */
export function setupSwagger(app: INestApplication): void {
  if (!swaggerEnabled()) return;

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
