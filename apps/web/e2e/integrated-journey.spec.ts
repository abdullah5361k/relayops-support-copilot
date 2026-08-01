import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, identityLabel: RegExp) {
  await page.goto('/demo');
  await page.getByRole('button', { name: identityLabel }).click();
  await expect(page).toHaveURL(/\/dashboard\/overview/);
}

async function visitDatabaseScreens(page: Page, expected: { organization: string; job: string; team: string; customer: string; plan: string; ticket: string }) {
  await expect(page.getByText(expected.organization).first()).toBeVisible();
  await page.goto('/dashboard/overview');
  await page.reload();
  await expect(page.getByRole('heading', { name: /Good morning/ })).toBeVisible();
  for (const [link, record] of [
    ['Jobs', expected.job], ['Team', expected.team], ['Customers', expected.customer],
    ['Subscription', expected.plan], ['Support tickets', expected.ticket]
  ] as const) {
    if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByText(record, { exact: false }).first()).toBeVisible();
  }
}

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ context, page }) => {
  await context.clearCookies();
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('response', (response) => { if (response.status() >= 500) errors.push(`server: ${response.status()} ${response.url()}`); });
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(`network: ${request.method()} ${request.url()} ${request.failure()?.errorText}`);
  });
});
test.afterEach(async ({ page }) => { expect(browserErrors.get(page) ?? []).toEqual([]); });

test('both identities persist, stay isolated, switch safely, and sign out', async ({ page }) => {
  await signIn(page, /Maya at Northstar HVAC/);
  await visitDatabaseScreens(page, { organization: 'Northstar HVAC', job: 'NH-1042', team: 'Jordan Lee', customer: 'Lakeview Bakery', plan: 'Growth Demo', ticket: 'SUP-310' });
  await expect(page.getByText(/PF-2088|Bluebonnet Cafe|SUP-422/)).toHaveCount(0);

  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: /Northstar HVAC/ }).click();
  await page.getByRole('button', { name: /Sofia at PrimeFlow Plumbing/ }).click();
  await expect(page.getByText('PrimeFlow Plumbing').first()).toBeVisible();
  await visitDatabaseScreens(page, { organization: 'PrimeFlow Plumbing', job: 'PF-2088', team: 'Marcus Green', customer: 'Bluebonnet Cafe', plan: 'Starter', ticket: 'SUP-422' });
  await expect(page.getByText(/NH-1042|Lakeview Bakery|SUP-310/)).toHaveCount(0);

  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/demo/);
  await page.goto('/dashboard/customers');
  await expect(page).toHaveURL(/\/demo/);
  await expect(page.getByText('Bluebonnet Cafe')).toHaveCount(0);
});

test('direct protected navigation without a session returns to demo entry', async ({ page }) => {
  await page.goto('/dashboard/overview');
  await expect(page).toHaveURL(/\/demo/);
  await expect(page.getByRole('heading', { name: 'Choose an identity' })).toBeVisible();
});

test('live same-origin support separates account evidence, offers handoff-only actions without generation, and confirms synthetic handoff only after review', async ({ page }) => {
  await signIn(page, /Maya at Northstar HVAC/);
  await page.goto('/dashboard/support');
  const input = page.getByRole('textbox', { name: /ask a support question/i });
  await input.fill('Why can’t I add another technician to my current subscription? I need a human handoff.');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('region', { name: /private account evidence/i })).toBeVisible();
  await expect(page.getByText(/3 of 10 seats/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /prepare handoff for review/i })).toBeVisible();
  await page.getByRole('button', { name: /prepare handoff for review/i }).click();
  await expect(page.getByRole('region', { name: /handoff confirmation/i })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('region', { name: /handoff confirmation/i })).toHaveCount(0);
  await page.getByRole('button', { name: /prepare handoff for review/i }).click();
  await page.getByRole('button', { name: /confirm and create synthetic ticket/i }).click();
  await expect(page.getByText(/Synthetic ticket confirmed/i)).toBeVisible();
  await page.getByRole('button', { name: /try another question/i }).click();
  await input.fill('I need a human handoff about urgent incident acknowledgement.');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByText(/A synthetic handoff can be prepared for your review/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /prepare handoff for review/i })).toBeVisible();
  await page.getByRole('button', { name: /prepare handoff for review/i }).click();
  await expect(page.getByRole('region', { name: /handoff confirmation/i })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('region', { name: /handoff confirmation/i })).toHaveCount(0);
  await page.getByRole('button', { name: /try another question/i }).click();
  await input.fill('How quickly is a confirmed urgent interruption acknowledged?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.state-message.failure')).toContainText(/Generation provider unavailable|No validated answer/i);
});

test('owner Knowledge console reads active local state, searches evidence, and only reindexes a committed source', async ({ page }) => {
  await signIn(page, /Maya at Northstar HVAC/);
  await page.goto('/dashboard/knowledge');
  await expect(page.getByText('Sources and active versions')).toBeVisible();
  await expect(page.getByText(/Configured local MiniLM cache|MiniLM cache is not configured/i)).toBeVisible();
  await page.getByRole('textbox', { name: /search evidence chunks/i }).fill('urgent incident acknowledgement');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText(/Incident response policy/i).first()).toBeVisible();
  await page.getByRole('button', { name: /Dispatch basics/ }).click();
  await page.getByRole('button', { name: /reindex committed source/i }).click();
  await expect(page.getByText(/Committed manifest reindex completed|previous active versions were retained/i)).toBeVisible({ timeout: 60_000 });
});
