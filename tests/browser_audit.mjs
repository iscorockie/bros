import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const port = 8765;
const origin = `http://127.0.0.1:${port}`;
const server = spawn('python3', ['server.py'], {
  cwd: process.cwd(),
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk; });
server.stderr.on('data', chunk => { serverLog += chunk; });

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Server did not start.\n${serverLog}`);
}

function observe(page, label) {
  const failures = [];
  page.on('pageerror', error => failures.push(`${label} page error: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') failures.push(`${label} console error: ${message.text()}`);
  });
  page.on('response', response => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      failures.push(`${label} ${response.status()} response: ${response.url()}`);
    }
  });
  return failures;
}

async function runAxe(page, label) {
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
  }));
  assert.deepEqual(
    result.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map(node => node.target.join(' ')),
    })),
    [],
    `${label} accessibility violations`,
  );
}

async function assertLayout(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(
    dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1,
    `${label} has horizontal page overflow: ${JSON.stringify(dimensions)}`,
  );
}

async function assertImages(page, selector, label) {
  const images = page.locator(selector);
  const count = await images.count();
  assert.ok(count > 0, `${label} did not render images`);
  await Promise.all(Array.from({ length: Math.min(count, 8) }, async (_, index) => {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(element => {
      if (element.complete) return;
      return new Promise(resolve => {
        element.addEventListener('load', resolve, { once: true });
        element.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 20_000);
      });
    });
    const state = await image.evaluate(element => ({
      src: element.currentSrc || element.src,
      complete: element.complete,
      width: element.naturalWidth,
      height: element.naturalHeight,
    }));
    assert.ok(state.complete && state.width > 0 && state.height > 0, `${label} broken image: ${JSON.stringify(state)}`);
  }));
}

async function auditDesktopHome(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const failures = observe(page, 'desktop home');
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });

  await page.locator('#ageGate').waitFor({ state: 'visible' });
  await runAxe(page, 'age gate');
  await page.locator('[data-age-confirm]').click();
  await page.locator('#ageGate').waitFor({ state: 'hidden' });

  await page.locator('#productsGrid .product-card').first().waitFor();
  assert.equal(await page.locator('#productsGrid .product-card').count(), 24, 'initial catalogue page size');
  assert.equal(await page.locator('#featuredProducts .product-card').count(), 6, 'featured product count');
  await assertLayout(page, 'desktop home');
  await assertImages(page, '#productsGrid .product-card img', 'desktop catalogue');
  await runAxe(page, 'desktop home light');

  const search = page.locator('#searchInput');
  await search.fill('tugboat');
  await page.locator('#searchSuggestions [role="option"]').first().waitFor();
  assert.equal(await search.getAttribute('aria-expanded'), 'true');
  await search.press('ArrowDown');
  assert.ok(await search.getAttribute('aria-activedescendant'));
  await search.press('Enter');
  await page.locator('#resultsCount').waitFor();
  assert.match(await page.locator('#resultsCount').innerText(), /result/i);

  await page.goto(`${origin}/index.html?category=Lighters#catalogue`, { waitUntil: 'domcontentloaded' });
  await page.locator('#catalogueTitle').waitFor();
  assert.equal((await page.locator('#catalogueTitle').innerText()).trim(), 'Lighters.');
  assert.match(page.url(), /category=Lighters/);

  await page.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded' });
  const firstCard = page.locator('#productsGrid .product-card').first();
  await firstCard.locator('[data-action="add"]').click();
  assert.equal(await page.locator('#cartCount').innerText(), '1');
  await firstCard.locator('[data-action="wishlist"]').click();
  assert.equal(await page.locator('#wishlistCount').innerText(), '1');
  const storedCart = await page.evaluate(() => JSON.parse(localStorage.getItem('bros_cart')));
  assert.ok(Array.isArray(storedCart) && storedCart.length === 1, 'cart uses the shared array format');

  await firstCard.locator('[data-action="quick"]').click();
  await page.locator('#quickView[open]').waitFor();
  await page.locator('#quickView [data-close-dialog]').click();
  await page.locator('#quickView[open]').waitFor({ state: 'detached' });

  const compareButtons = page.locator('#productsGrid [data-action="compare"]');
  await compareButtons.nth(0).click();
  await compareButtons.nth(1).click();
  await page.locator('#compareOpen').click();
  await page.locator('#compareDialog[open]').waitFor();
  assert.equal(await page.locator('#compareContent tbody tr').count(), 4);
  await page.locator('#compareDialog [data-close-dialog]').click();

  await page.locator('#themeToggle').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await runAxe(page, 'desktop home dark');
  assert.deepEqual(failures, [], failures.join('\n'));
  return context;
}

async function auditMobileHome(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => localStorage.setItem('bros_age_verified', '1'));
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const failures = observe(page, 'mobile home');
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('#productsGrid .product-card').first().waitFor();
  await assertLayout(page, 'mobile home 390px');
  await page.locator('#mobileMenuToggle').click();
  await page.locator('#mobileMenu').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#mobileMenuToggle').getAttribute('aria-expanded'), 'true');
  await page.locator('[data-mobile-departments]').click();
  await page.locator('#mobileDepartments').waitFor({ state: 'visible' });
  await runAxe(page, 'mobile home');
  assert.deepEqual(failures, [], failures.join('\n'));

  await page.setViewportSize({ width: 320, height: 700 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertLayout(page, 'mobile home 320px');
  await context.close();
}

async function auditProductPage(context) {
  await context.addInitScript(() => {
    localStorage.setItem('bros_age_verified', '1');
    localStorage.setItem('bros_theme', 'light');
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const failures = observe(page, 'product page');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/product.html?id=0`, { waitUntil: 'domcontentloaded' });
  await page.locator('#pdpAddToCart').waitFor();
  assert.match(await page.title(), /Tugboat/);
  assert.equal(await page.locator('#cartCount').innerText(), '1', 'homepage cart carries to product page');
  await assertLayout(page, 'desktop product');
  await assertImages(page, '#pdpMainImage', 'product hero');
  await runAxe(page, 'desktop product light');

  await page.locator('#pdpQtyPlus').click();
  await page.locator('#pdpAddToCart').click();
  assert.equal(await page.locator('#cartCount').innerText(), '3');
  const storedCart = await page.evaluate(() => JSON.parse(localStorage.getItem('bros_cart')));
  assert.ok(Array.isArray(storedCart) && storedCart[0].quantity === 3, 'product page preserves shared cart format');

  await page.locator('#pdpImageContainer').click();
  await page.locator('#pdpZoom:not([hidden])').waitFor();
  await page.locator('#pdpZoomClose').click();
  await page.locator('#pdpZoom').waitFor({ state: 'hidden' });

  await page.locator('#cartToggle').click();
  await page.locator('#cartDialog[open]').waitFor();
  await page.locator('#openCheckoutModal').click();
  await page.locator('#checkoutDialog[open]').waitFor();
  await page.locator('#orderCustomerName').fill('Browser Audit');
  await page.locator('#orderCustomerPhone').fill('+256 700 000 000');
  await page.locator('#orderDeliveryArea').fill('Kampala');
  await page.locator('#checkoutForm').evaluate(form => form.requestSubmit());
  await page.locator('#orderConfirmationBox:not([hidden])').waitFor();
  assert.match(await page.locator('#orderConfirmationBox').innerText(), /Order Reference/i);
  await page.locator('#orderConfirmationBox [data-close-dialog]').click();
  await page.locator('#checkoutDialog[open]').waitFor({ state: 'detached' });

  await page.locator('#themeToggle').click();
  await runAxe(page, 'desktop product dark');
  assert.deepEqual(failures, [], failures.join('\n'));

  await page.goto(`${origin}/product.html?id=9999`, { waitUntil: 'domcontentloaded' });
  assert.match(await page.locator('#pdpHero').innerText(), /Product not found/i);
  await context.close();
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const sharedContext = await auditDesktopHome(browser);
  await auditProductPage(sharedContext);
  await auditMobileHome(browser);
  console.log('Browser audit passed: desktop/mobile layout, product images, interactions, storage, checkout, runtime, and WCAG A/AA.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
