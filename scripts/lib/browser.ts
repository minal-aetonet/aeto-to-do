import { existsSync } from 'node:fs';

/**
 * Finds a Chrome / Edge / Chromium browser already installed on this computer.
 * puppeteer-core does not download a browser, so we use the one you have.
 * Set the CHROME_PATH environment variable to use a specific browser.
 */
export function findBrowser(): string {
  const candidates = [
    process.env.CHROME_PATH,
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) {
    throw new Error('No Chrome, Edge or Chromium browser found. Set CHROME_PATH to the browser executable.');
  }
  return found;
}
