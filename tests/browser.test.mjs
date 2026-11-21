import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  const filename = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!filename.startsWith(resolve(root) + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': types[extname(filename)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});

let chrome;
let profile;
let page;
let site;
let sequence = 0;
const pending = new Map();
const exceptions = [];

function command(method, params = {}) {
  const id = ++sequence;
  page.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true });
  assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function waitFor(probe, description, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await probe();
    if (result) return result;
    await delay(50);
  }
  assert.fail(`Timed out waiting for ${description}`);
}

async function navigate(path) {
  const url = site + path;
  await command('Page.navigate', { url });
  await waitFor(() => evaluate(`document.readyState === 'complete' && location.href === ${JSON.stringify(url)}`), url);
}

async function press(key, windowsVirtualKeyCode) {
  const event = { key, code: key, windowsVirtualKeyCode };
  const keyDown = key === 'Enter' ? { type: 'keyDown', text: '\r' } : { type: 'rawKeyDown' };
  await command('Input.dispatchKeyEvent', { ...keyDown, ...event });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
}

before(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  site = `http://127.0.0.1:${server.address().port}`;
  profile = await mkdtemp(join(tmpdir(), 'abstractos-chrome-'));
  const windowsChrome = join(process.env.ProgramFiles ?? 'C:/Program Files', 'Google/Chrome/Application/chrome.exe');
  const candidates = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', windowsChrome];
  const executable = process.env.CHROME_PATH ?? candidates.find(path => existsSync(path));
  assert.ok(executable, 'Install Chrome or Chromium, or set CHROME_PATH.');
  let spawnError;
  chrome = spawn(executable, ['--headless=new', '--disable-gpu', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let diagnostics = '';
  chrome.stderr.on('data', data => { diagnostics = (diagnostics + data).slice(-2000); });
  chrome.on('error', error => { spawnError = error; });
  const portFile = join(profile, 'DevToolsActivePort');
  const targets = await waitFor(async () => {
    if (spawnError) throw spawnError;
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with code ${chrome.exitCode}. ${diagnostics}`);
    if (!existsSync(portFile)) return;
    const port = (await readFile(portFile, 'utf8')).split('\n')[0].trim();
    try {
      const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
      if (tabs.some(target => target.type === 'page')) return tabs;
    } catch (error) {
      if (error.cause?.code === 'EACCES') {
        throw new Error('The environment denies access to the Chrome DevTools loopback port.', { cause: error });
      }
    }
  }, 'Chrome DevTools page');
  page = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  page.addEventListener('message', event => {
    const { id, method, params, result, error } = JSON.parse(event.data);
    if (method === 'Runtime.exceptionThrown') exceptions.push(params.exceptionDetails);
    if (!pending.has(id)) return;
    const callback = pending.get(id);
    pending.delete(id);
    if (error) callback.reject(new Error(error.message));
    else callback.resolve(result);
  });
  await once(page, 'open');
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Network.setBlockedURLs', { urls: ['https://fonts.*/*', 'https://cdnjs.cloudflare.com/*'] });
});

after(async () => {
  page?.close();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    const closed = once(chrome, 'close');
    chrome.kill();
    await closed;
  }
  if (server.listening) await new Promise(resolve => server.close(resolve));
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('first visit exposes projects and the timeline without waiting for the terminal', async () => {
  await navigate('/');
  assert.equal(await evaluate(`!!document.querySelector('#projects').getClientRects().length`), true);
  assert.equal(await evaluate(`!!document.querySelector('#timeline').getClientRects().length`), true);
  assert.equal(await evaluate(`document.querySelector('#projects a[href*="receptionist"]').hostname`), 'github.com');
  await press('Tab', 9);
  assert.equal(await evaluate(`document.activeElement.getAttribute('href')`), '#main-content');
  await navigate('/#projects');
  assert.equal(await evaluate(`document.querySelector(':target').id`), 'projects');
});

test('terminal boot is dismissible and reduced motion bypasses it', async () => {
  const visibleBoot = `Boolean(document.querySelector('#boot-screen')?.getClientRects().length)`;
  await navigate('/?terminal=1&check=deep#projects');
  assert.equal(await evaluate(visibleBoot), false);
  assert.equal(await evaluate(`document.querySelector(':target').id`), 'projects');
  await navigate('/?terminal=1');
  assert.equal(await evaluate(visibleBoot), true);
  assert.equal(await evaluate(`document.activeElement.id`), 'skip-intro');
  await press('Enter', 13);
  await waitFor(() => evaluate(`!(${visibleBoot})`), 'keyboard dismissal', 20);
  assert.equal(await evaluate(`document.activeElement.id`), 'terminal-exit');
  assert.equal(await evaluate(`!!document.getElementById('tpl-2').content.querySelector('a[href*="receptionist"]')`), true);
  await evaluate(`sessionStorage.clear()`);
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate('/?terminal=1&check=reduced#projects');
  assert.equal(await evaluate(visibleBoot), false);
  await navigate('/?terminal=1&check=reduced');
  assert.equal(await evaluate(visibleBoot), false);
  assert.equal(await evaluate(`document.getElementById('terminal-view').hidden`), false);
  await command('Emulation.setEmulatedMedia', { features: [] });
});

test('projects and timeline render at mobile width with JavaScript disabled', async () => {
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 2 });
  await command('Emulation.setScriptExecutionDisabled', { value: true });
  await navigate('/?check=no-js#timeline');
  assert.equal(await evaluate(`document.querySelector('#projects').getClientRects().length > 0 &&
    document.querySelector('#timeline').getClientRects().length > 0`), true);
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
  await command('Emulation.setScriptExecutionDisabled', { value: false });
  await command('Emulation.clearDeviceMetricsOverride');
  assert.deepEqual(exceptions, []);
});
