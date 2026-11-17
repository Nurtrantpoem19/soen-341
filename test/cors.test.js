const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

test('API CORS preflights allow configured origins and reject others', async t => {
  const previousAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS;
  process.env.CORS_ALLOWED_ORIGINS = 'https://staging.careerconnect.example';
  const app = createApp({ query: async () => ({ rows: [], rowCount: 0 }) });
  if (previousAllowedOrigins === undefined) {
    delete process.env.CORS_ALLOWED_ORIGINS;
  } else {
    process.env.CORS_ALLOWED_ORIGINS = previousAllowedOrigins;
  }

  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const preflight = async (path, method, origin) => fetch(`${base}${path}`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': 'authorization,content-type'
    }
  });

  for (const [path, method, origin] of [
    ['/api/auth/login', 'POST', 'http://localhost:5500'],
    ['/api/resumes', 'PUT', 'http://localhost:5500'],
    ['/api/applications/me', 'GET', 'https://staging.careerconnect.example']
  ]) {
    const response = await preflight(path, method, origin);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.ok(response.headers.get('access-control-allow-methods').includes(method));
    assert.deepEqual(
      response.headers.get('access-control-allow-headers').toLowerCase().split(',').map(value => value.trim()).sort(),
      ['authorization', 'content-type']
    );
  }

  const rejected = await preflight('/api/auth/login', 'POST', 'https://untrusted.example');
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
});
