// Visual QA: node scripts/screenshots.mjs [baseUrl] [outDir]
// Uses the preinstalled Chromium (/opt/pw-browsers); never downloads browsers.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:8765';
const out = process.argv[3] ?? '../docs/screenshots';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
mkdirSync(out, { recursive: true });
const exe = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const RACE = process.env.RACE ?? 'BEL-20260606-13';
const shots = [
  { name: 'board-desktop-light', path: '/', w: 1280, h: 900, theme: 'light' },
  { name: 'board-phone-light', path: '/', w: 375, h: 812, theme: 'light' },
  { name: 'board-desktop-dark', path: '/', w: 1280, h: 900, theme: 'dark' },
  { name: 'track-desktop-light', path: '/t/BEL-20260606', w: 1280, h: 900, theme: 'light' },
  { name: 'track-phone-dark', path: '/t/BEL-20260606', w: 375, h: 812, theme: 'dark' },
  { name: 'race-desktop-light', path: `/r/${RACE}`, w: 1280, h: 1000, theme: 'light' },
  { name: 'race-desktop-dark', path: `/r/${RACE}`, w: 1280, h: 1000, theme: 'dark' },
  { name: 'race-phone-light', path: `/r/${RACE}`, w: 375, h: 812, theme: 'light', full: true },
  { name: 'race-phone-dark', path: `/r/${RACE}`, w: 375, h: 812, theme: 'dark' },
  { name: 'race-ml-whatif-desktop', path: '/r/CD-20260606-7?whatif=2', w: 1280, h: 1000, theme: 'light', expand: true },
  { name: 'tickets-desktop-light', path: '/tickets', w: 1280, h: 900, theme: 'light' },
  { name: 'model-desktop-light', path: '/model', w: 1280, h: 1800, theme: 'light' },
  { name: 'model-phone-dark', path: '/model', w: 375, h: 812, theme: 'dark' },
];

const browser = await chromium.launch({ executablePath: exe });
for (const s of shots) {
  if (only && !only.some((o) => s.name.includes(o))) continue;
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, colorScheme: s.theme, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((theme) => {
    localStorage.setItem('ee.settings', JSON.stringify({ theme, pinned: ['CD', 'BEL'] }));
  }, s.theme);
  await page.goto(base + s.path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  if (s.expand) {
    const row = page.locator('tr.runner').nth(2);
    if (await row.count()) { await row.click(); await page.waitForTimeout(300); }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: `${out}/${s.name}.png`, fullPage: !!s.full });
  console.log(`${s.name}: overflowX=${overflow}${errors.length ? ' ERR ' + errors.join(' | ') : ''}`);
  await ctx.close();
}
await browser.close();
