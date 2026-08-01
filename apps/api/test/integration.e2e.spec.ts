import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

const integration = process.env.RUN_INTEGRATION_TESTS === '1' ? describe : describe.skip;

integration('real PostgreSQL API session and tenant isolation', () => {
  let app: INestApplication; let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    base = `http://127.0.0.1:${address.port}/api`;
  });
  afterAll(async () => { await app?.close(); });

  async function signIn(identity: string) {
    const response = await fetch(`${base}/demo/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identity }) });
    expect(response.status).toBe(201);
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toContain('relayops_demo_session=');
    return cookie!;
  }
  async function get(path: string, cookie: string, organization = 'caller-controlled-other-tenant') {
    return fetch(`${base}${path}`, { headers: { cookie, 'x-organization-id': organization } });
  }

  it('persists each session and never honors a caller organization header', async () => {
    const northCookie = await signIn('northstar-owner'); const primeCookie = await signIn('primeflow-owner');
    const [northSession, primeSession] = await Promise.all([get('/demo/session', northCookie), get('/demo/session', primeCookie)]);
    expect((await northSession.json()).organizationName).toContain('Northstar');
    expect((await primeSession.json()).organizationName).toContain('PrimeFlow');

    const paths = ['/jobs', '/customers', '/subscription', '/support/tickets'];
    const north = await Promise.all(paths.map(async (path) => (await get(path, northCookie, 'primeflow')).json()));
    const prime = await Promise.all(paths.map(async (path) => (await get(path, primeCookie, 'northstar')).json()));
    expect(JSON.stringify(north)).toContain('NH-1042');
    expect(JSON.stringify(north)).toContain('Lakeview Bakery');
    expect(JSON.stringify(north)).toContain('SUP-310');
    expect(JSON.stringify(north)).not.toMatch(/PF-2088|Bluebonnet Cafe|SUP-422/);
    expect(JSON.stringify(prime)).toContain('PF-2088');
    expect(JSON.stringify(prime)).toContain('Bluebonnet Cafe');
    expect(JSON.stringify(prime)).toContain('SUP-422');
    expect(JSON.stringify(prime)).not.toMatch(/NH-1042|Lakeview Bakery|SUP-310/);
    expect(north[2]).toMatchObject({ planName: 'Growth Demo', seatsUsed: 3 });
    expect(prime[2]).toMatchObject({ planName: 'Starter', seatsUsed: 2 });
  });

  it('denies direct cross-tenant record lookup and missing sessions', async () => {
    const northCookie = await signIn('northstar-owner');
    expect((await get('/jobs/25000000-0000-4000-8000-000000000001', northCookie)).status).toBe(404);
    expect((await get('/customers/22000000-0000-4000-8000-000000000001', northCookie)).status).toBe(404);
    expect((await fetch(`${base}/customers`)).status).toBe(401);
  });
});
