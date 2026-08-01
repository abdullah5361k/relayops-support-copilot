import { expect, test } from '@playwright/test';

async function layoutMetrics(page: import('@playwright/test').Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      width: bounds.width,
      left: bounds.left,
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth
    };
  });
}

test('public composition expands only beyond the approved 1300px layout', async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.goto('/');
  const approved = await layoutMetrics(page, '.hero-grid');

  await page.setViewportSize({ width: 1920, height: 1000 });
  const wide = await layoutMetrics(page, '.hero-grid');
  const proseWidth = await page.locator('.hero-copy > p').evaluate((element) => element.getBoundingClientRect().width);

  expect(approved.width).toBeLessThanOrEqual(1200);
  expect(wide.width).toBeGreaterThan(approved.width * 1.4);
  expect(wide.left / wide.viewport).toBeLessThan(0.05);
  expect(proseWidth).toBeLessThanOrEqual(620);
  expect(wide.scrollWidth).toBe(wide.viewport);
});

test('wide dashboard keeps a readable work surface without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1200 });
  await page.goto('/demo');
  await page.getByRole('button', { name: /Maya at Northstar HVAC/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/overview$/);

  const content = await layoutMetrics(page, '.dash-content');
  const proseWidth = await page.locator('.usage-box p').last().evaluate((element) => element.getBoundingClientRect().width);

  expect(content.width / (content.viewport - 250)).toBeGreaterThan(0.95);
  expect(proseWidth).toBeLessThan(700);
  expect(content.scrollWidth).toBe(content.viewport);
});
