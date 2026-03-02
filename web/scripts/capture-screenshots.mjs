#!/usr/bin/env node
/**
 * Capture App Store screenshots from a running MiniDock frontend.
 * Requires: npm install -D playwright (in web/) then npx playwright install chromium
 * Usage: BASE_URL=http://localhost:23000 node scripts/capture-screenshots.mjs
 * Optional: SCREENSHOT_USER, SCREENSHOT_PASSWORD for auto-login
 */

import { mkdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const baseUrl = process.env.BASE_URL || 'http://localhost:23000';
const user = process.env.SCREENSHOT_USER;
const password = process.env.SCREENSHOT_PASSWORD;

const routes = [
  { path: '/', name: '01-dashboard' },
  { path: '/docker', name: '02-docker' },
  { path: '/vms', name: '03-vms' },
  { path: '/automation', name: '04-automation' },
  { path: '/files', name: '05-files' },
  { path: '/settings', name: '06-settings' },
  { path: '/remote', name: '07-remote' },
];

const MASK_IP = '•••.•••.•••.•••';

const mockAutomationTasks = [
  {
    id: 'mock-1',
    name: 'Daily Backup',
    triggerType: 'cron',
    cronExpression: '0 2 * * *',
    scriptType: 'shell',
    scriptContent: '#!/bin/zsh\n# Backup critical data\ntar -czf ~/backups/$(date +%Y%m%d).tar.gz ~/Documents',
    isEnabled: true,
    lastRunAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'mock-2',
    name: 'Sync Repos on Change',
    triggerType: 'watch',
    watchPath: '/Users/shared/Projects',
    scriptType: 'shell',
    scriptContent: '#!/bin/zsh\nrsync -av --delete ./dist/ user@nas:/backup/',
    isEnabled: true,
    lastRunAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'mock-3',
    name: 'Deploy on Webhook',
    triggerType: 'event',
    eventType: 'deploy',
    scriptType: 'shell',
    scriptContent: '#!/bin/zsh\ncd /app && git pull && ./build.sh',
    isEnabled: true,
    lastRunAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

const viewport = { width: 2560, height: 1600 };
const outDir = join(__dirname, '../..', 'docs', 'app-store-screenshots');

async function main() {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    console.error('Playwright not found. Run: cd web && npm install -D playwright && npx playwright install chromium');
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for the warming up/establishing mask to disappear if it exists
    try {
      await page.waitForSelector('text="Warming up servers..."', { state: 'detached', timeout: 10000 });
    } catch {
      // If it doesn't exist or doesn't disappear, just continue
    }
    await page.waitForLoadState('networkidle');
  } catch (e) {
    console.error('Could not reach', baseUrl, '- is the app running? (e.g. ./dev-app.sh)');
    await browser.close();
    process.exit(1);
  }

  // Detect login form more robustly
  await page.waitForSelector('form, [class*="Dashboard"]', { timeout: 10000 });
  const isLogin = await page.locator('form').filter({ has: page.locator('input[type="password"]') }).count() > 0;
  
  if (isLogin && user && password) {
    console.log('Logging in...');
    await page.waitForSelector('input[type="text"], input[name="username"]');
    await page.fill('input[type="text"], input[name="username"]', user);
    await page.fill('input[type="password"]', password);
    
    await page.click('button[type="submit"]');
    
    try {
      await page.waitForURL(u => !u.pathname.includes('/login') && !u.pathname.includes('/register'), { timeout: 15000 });
      console.log('Login successful.');
    } catch (e) {
      // Check for error message on page
      const errorMsg = await page.locator('[class*="text-red-400"]').textContent().catch(() => null);
      if (errorMsg) {
        console.warn(`Login failed with error: ${errorMsg.trim()}. Attempting to register...`);
        // Attempt to register
        await page.goto(`${baseUrl}/register`, { waitUntil: 'networkidle' });
        await page.fill('input[type="text"], input[name="username"]', user);
        await page.fill('input[type="password"]', password);
        // Assuming there is a confirm password or similar? Let's check register page.
        // Actually, let's just try to fill all password inputs.
        const passwordInputs = await page.locator('input[type="password"]').all();
        for (const input of passwordInputs) {
          await input.fill(password);
        }
        await page.click('button[type="submit"]');
        try {
          await page.waitForURL(u => !u.pathname.includes('/login') && !u.pathname.includes('/register'), { timeout: 15000 });
          console.log('Registration and login successful.');
        } catch (regErr) {
          const regErrorMsg = await page.locator('[class*="text-red-400"]').textContent().catch(() => null);
          throw new Error(`Registration failed: ${regErrorMsg ? regErrorMsg.trim() : regErr.message}`);
        }
      } else {
        throw new Error('Login timed out. Still on login/register page.');
      }
    }
  } else if (isLogin) {
    console.error('Login page detected but no credentials provided (SCREENSHOT_USER/SCREENSHOT_PASSWORD).');
    await browser.close();
    process.exit(1);
  } else {
    console.log('Already logged in or no login required.');
  }

  await page.addStyleTag({ content: 'aside { display: none !important; }' });

  for (const { path, name } of routes) {
    const url = `${baseUrl}${path}`;
    try {
      if (path === '/automation') {
        await page.route('**/automation/tasks', (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockAutomationTasks),
          });
        });
      }

      console.log(`Navigating to ${url}...`);
      const gotoTimeout = path === '/' ? 40000 : 20000;
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: gotoTimeout });
      } catch (e) {
        console.warn(`Initial navigate to ${url} timed out, retrying with domcontentloaded...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      }
      await page.waitForLoadState('networkidle').catch(() => console.warn('Networkidle wait failed, continuing...'));
      await new Promise((r) => setTimeout(r, 2000)); // Extra buffer for animations

      if (path === '/') {
        await page.evaluate((mask) => {
          const cards = document.querySelectorAll('[class*="glass-card"]');
          for (const card of cards) {
            const label = card.textContent || '';
            if (label.includes('外网') || label.includes('公网') || label.includes('Public') || label.includes('公网 IP')) {
              const monos = card.querySelectorAll('.font-mono');
              for (const el of monos) {
                if (el.textContent && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(el.textContent.trim())) {
                  el.textContent = mask;
                }
              }
            }
          }
        }, MASK_IP);
        await new Promise((r) => setTimeout(r, 300));
      }

      const file = join(outDir, `${name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log('Saved', file);

      if (path === '/automation') {
        await page.unroute('**/automation/tasks');
      }
    } catch (e) {
      console.warn('Skip', url, e.message);
      if (path === '/automation') {
        try { await page.unroute('**/automation/tasks'); } catch (_) {}
      }
    }
  }

  await browser.close();
  console.log('Screenshots saved to', outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
