/**
 * scripts/generate-pwa-icons.mjs
 *
 * Renders the PWA icons in frontend/public/icons/ from the app's favicon artwork using a
 * locally installed Chrome or Edge in headless mode — no image library dependency.
 * Run by hand only when the logo changes (and rename the files so caches pick them up):
 *
 *   node scripts/generate-pwa-icons.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'frontend', 'public', 'icons');

const PIN = `
  <path d="M16 7c-3.6 0-6.5 2.9-6.5 6.5C9.5 18.3 16 25 16 25s6.5-6.7 6.5-11.5C22.5 9.9 19.6 7 16 7z" fill="#fff"/>
  <circle cx="16" cy="13.3" r="2.4" fill="#4f46e5"/>`;

/** Same artwork as frontend/public/favicon.svg: a rounded indigo tile with a map pin. */
const ROUNDED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#4f46e5"/>${PIN}</svg>`;

/**
 * Full-bleed square for maskable (Android crops it to a circle/squircle) and Apple
 * (iOS rounds the corners itself). The pin already sits inside the central 80% safe zone.
 */
const FULL_BLEED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#4f46e5"/>${PIN}</svg>`;

const ICONS = [
  { file: 'icon-192.png', size: 192, svg: ROUNDED },
  { file: 'icon-512.png', size: 512, svg: ROUNDED },
  { file: 'icon-maskable-512.png', size: 512, svg: FULL_BLEED },
  { file: 'apple-touch-icon.png', size: 180, svg: FULL_BLEED },
];

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const browser = BROWSERS.find((candidate) => fs.existsSync(candidate));
if (!browser) {
  console.error('No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser and retry.');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-icons-'));

for (const icon of ICONS) {
  const html = path.join(work, `${icon.file}.html`);
  fs.writeFileSync(
    html,
    `<!doctype html><html><body style="margin:0;background:transparent">` +
      icon.svg.replace('<svg ', `<svg width="${icon.size}" height="${icon.size}" style="display:block" `) +
      `</body></html>`,
  );

  const target = path.join(outDir, icon.file);
  execFileSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--window-size=${icon.size},${icon.size}`,
    `--screenshot=${target}`,
    pathToFileURL(html).href,
  ], { stdio: 'ignore' });

  console.log(`${icon.file.padEnd(24)} ${icon.size}x${icon.size}  ${fs.statSync(target).size} bytes`);
}

fs.rmSync(work, { recursive: true, force: true });
