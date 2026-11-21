import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const browser = process.env.CHROME_PATH ?? candidates.find(path => existsSync(path));
const run = promisify(execFile);
const [html, css, script, content] = await Promise.all(['index.html', 'assets/css/styles.css', 'assets/js/scripts.js', 'content/portfolio-content.json']
  .map(path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));
const projectCount = JSON.parse(content).projects.length;

async function render(checks, { suffix = '', width = 1100, scripts = true, reduced = false } = {}) {
  assert.ok(browser, 'Install Chrome, Chromium, or Edge, or set CHROME_PATH.');
  const directory = await mkdtemp(join(tmpdir(), 'abstractos-fixture-'));
  try {
    const fixture = join(directory, 'index.html');
    const page = html
      .replace(/<link\b[^>]*(?:https:\/\/|rel="(?:icon|apple-touch-icon|manifest)")[^>]*>/g, '')
      .replace(/<link\b[^>]*href="assets\/css\/styles\.css\?[^"]+"[^>]*>/, () => '<style>' + css + '</style>')
      .replace(/<script\b[^>]*src="assets\/js\/scripts\.js\?[^"]+"[^>]*><\/script>/, () => scripts ? '<script>' + script + '</script>' : '')
      .replace('</body>', () => `<script>
        window.addEventListener('load', () => {
          const check = (condition, message) => { if (!condition) throw new Error(message); };
          const visible = selector => Boolean(document.querySelector(selector)?.getClientRects().length);
          try {
            ${checks}
            document.body.dataset.smoke = 'passed';
          } catch (error) {
            document.body.dataset.smoke = error.message;
          }
        });
        </script></body>`);
    await writeFile(fixture, page);
    const flags = ['--headless=new', '--disable-gpu', '--disable-background-networking', '--mute-audio',
      '--dump-dom', `--user-data-dir=${join(directory, 'profile')}`, `--window-size=${width},900`];
    if (reduced) flags.push('--force-prefers-reduced-motion');
    const { stdout } = await run(browser, [...flags, pathToFileURL(fixture).href + suffix], {
      windowsHide: true, maxBuffer: 2 * 1024 * 1024, timeout: 20000,
    });
    const result = stdout.match(/<body[^>]*data-smoke="([^"]*)"/)?.[1];
    assert.equal(result, 'passed', result ?? 'The browser fixture did not report a result.');
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

test('first visit, deep link, and mobile layout expose the actual portfolio', async () => {
  await render(`
    check(visible('#projects') && visible('#timeline'), 'Projects or timeline is hidden');
    check(!visible('#boot-screen'), 'Boot obscures the initial portfolio');
    check(document.querySelectorAll('#projects .portfolio-card').length === ${projectCount}, 'Project card count differs from the content file');
  `);
  await render(`
    check(visible('#projects') && visible('#timeline'), 'Static content is hidden');
    check(location.hash === '#timeline' && document.getElementById(location.hash.slice(1)), 'Timeline deep link failed');
    check(innerWidth < 600 && document.documentElement.scrollWidth <= innerWidth, 'Mobile viewport overflows');
    check(!visible('[data-terminal-entry]'), 'Terminal entry requires the app script');
  `, { suffix: '#timeline', scripts: false, width: 390 });
});

test('optional terminal uses the shared projects and exposes a working intro skip', async () => {
  await render(`
    check(visible('#boot-screen'), 'Expected a first-visit intro');
    const skip = document.getElementById('skip-intro');
    check(document.activeElement === skip, 'Intro skip lacks keyboard focus');
    skip.click();
    check(!visible('#boot-screen'), 'The intro did not dismiss');
    check(document.activeElement?.id === 'terminal-exit', 'Focus did not return to the terminal');
    check(document.getElementById('tpl-2').content.querySelectorAll('.portfolio-card').length === ${projectCount},
      'Terminal projects do not match the portfolio');
  `, { suffix: '?terminal=1' });
  await render(`
    check(matchMedia('(prefers-reduced-motion: reduce)').matches, 'Browser did not apply the motion preference');
    check(visible('#terminal-view'), 'Terminal mode did not open');
    check(!visible('#boot-screen'), 'Reduced motion should bypass the intro');
  `, { suffix: '?terminal=1', reduced: true });
});
