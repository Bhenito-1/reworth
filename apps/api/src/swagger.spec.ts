import { isSwaggerDocsPath, swaggerEnabled } from './swagger';

describe('swagger gate', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.SWAGGER_ENABLED;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalFlag === undefined) delete process.env.SWAGGER_ENABLED;
    else process.env.SWAGGER_ENABLED = originalFlag;
  });

  it('is on outside production', () => {
    delete process.env.SWAGGER_ENABLED;
    process.env.NODE_ENV = 'development';
    expect(swaggerEnabled()).toBe(true);
  });

  it('stays off in production unless forced on', () => {
    delete process.env.SWAGGER_ENABLED;
    process.env.NODE_ENV = 'production';
    expect(swaggerEnabled()).toBe(false);
    process.env.SWAGGER_ENABLED = 'true';
    expect(swaggerEnabled()).toBe(true);
    process.env.SWAGGER_ENABLED = 'false';
    expect(swaggerEnabled()).toBe(false);
  });

  it('only matches the docs page and its assets', () => {
    expect(isSwaggerDocsPath('/docs')).toBe(true);
    expect(isSwaggerDocsPath('/docs/openapi.json')).toBe(true);
    expect(isSwaggerDocsPath('/api/v1/healthz')).toBe(false);
    expect(isSwaggerDocsPath('/documents')).toBe(false);
  });
});
