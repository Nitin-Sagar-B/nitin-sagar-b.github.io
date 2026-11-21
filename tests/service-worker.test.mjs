import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const release = html.match(/scripts\.js\?v=(\d+)/)?.[1];
const currentCache = `abstractos-v${release}`;
const oldCacheName = `abstractos-v${Number(release) - 1}`;

function loadWorker() {
  const origin = 'https://portfolio.example';
  const url = path => new URL(path, origin).href;
  const oldCache = new Map([
    [url('/'), new Response('stale HTML')],
    [url('/scripts.js?v=5'), new Response('stale script')],
  ]);
  const storage = new Map([[oldCacheName, oldCache], ['unrelated-cache', new Map()]]);
  const listeners = new Map();
  let online = true;
  let status = 200;
  const cacheByName = name => {
    if (!storage.has(name)) storage.set(name, new Map());
    const entries = storage.get(name);
    return {
      addAll: requests => Promise.all(requests.map(request => {
        assert.equal(request.cache, 'reload');
        entries.set(request.url, new Response(`asset ${request.url.slice(origin.length)}`));
      })),
      match: request => entries.get(request.url ?? url(request))?.clone(),
      put: async (request, response) => entries.set(request.url, response),
    };
  };
  vm.runInNewContext(source, {
    self: {
      addEventListener: (name, listener) => listeners.set(name, listener),
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
    },
    caches: {
      open: async name => cacheByName(name),
      keys: async () => [...storage.keys()],
      delete: async name => storage.delete(name),
    },
    location: { origin },
    Request,
    URL,
    fetch: async request => {
      if (!online) throw new Error('offline');
      return new Response(`network ${request.url}`, { status });
    },
  });
  return {
    storage,
    setOffline: () => { online = false; },
    setStatus: value => { status = value; },
    lifecycle: name => {
      let pending;
      listeners.get(name)({ waitUntil: promise => { pending = promise; } });
      return pending;
    },
    request: (path, mode = 'navigate') => {
      let response;
      listeners.get('fetch')({
        request: { url: url(path), method: 'GET', mode },
        respondWith: value => { response = value; },
      });
      return response;
    },
  };
}

test('upgrades old caches and serves matching assets offline', async () => {
  assert.ok(release, 'The HTML should version its script URL.');
  assert.ok(html.includes(`assets/css/styles.css?v=${release}"`));
  const worker = loadWorker();
  await worker.lifecycle('install');
  await worker.lifecycle('activate');
  assert.equal(worker.storage.has(oldCacheName), false);
  assert.equal(worker.storage.has('unrelated-cache'), true);
  const page = await worker.request('/');
  assert.match(await page.text(), /^network/);
  worker.setOffline();
  assert.match(await (await worker.request('/?terminal=1')).text(), /^network|^asset/);
  for (const path of [`/assets/js/scripts.js?v=${release}`, `/assets/css/styles.css?v=${release}`]) {
    assert.equal(await (await worker.request(path, 'same-origin')).text(), `asset ${path}`);
  }
});

test('never caches unsuccessful responses or cross-origin requests', async () => {
  const worker = loadWorker();
  await worker.lifecycle('install');
  worker.setStatus(404);
  assert.equal((await worker.request('/does-not-exist', 'same-origin')).status, 404);
  assert.equal(worker.request('https://external.example/a', 'same-origin'), undefined);
  assert.equal(worker.storage.get(currentCache).has('https://portfolio.example/does-not-exist'), false);
});
