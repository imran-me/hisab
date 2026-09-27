/**
 * Hisab · signed-in phone screenshots
 *
 *   HISAB_DEV_TOOLS=1 php -S 127.0.0.1:8000 -t . tools/serve.php
 *   node tools/shoot-mobile.mjs [out-dir]
 *
 * Why this exists next to shot.html: shot.html frames a page in an iframe of
 * an exact width, which is right for layout, but it cannot sign in, so every
 * screen that reads from the server shows skeletons or a redirect. This drives
 * Chrome over the DevTools protocol with real MOBILE emulation (touch, DPR 2,
 * the viewport at exactly W px), signs in first, waits for the data, and then
 * captures the screen one viewport at a time by scrolling. A single
 * full-page capture paints the fixed tab bar and FAB in the middle of the
 * image, which reads as a bug that is not there.
 *
 * Environment:
 *   BASE      http://127.0.0.1:8000
 *   EMAIL     owner email       PASSWORD  owner password   (omit: no sign-in)
 *   W, H      viewport, default 360 x 780
 *   PAGES     comma list of paths, default every screen
 *   WAIT      ms to wait after navigation, default 6000 (php -S is serial)
 *   SCREENS   viewports to capture per page, default 3
 *   THEME     dark | light (prefers-color-scheme)
 *   CHROME    path to chrome.exe
 *   BEFORE    a JS expression run on each page before capturing (open a
 *             sheet, tap a button); captures then wait 700ms for it to settle
 *   PROBE     a JS expression evaluated on each page after the wait; its
 *             JSON result is printed (measure a width instead of guessing)
 *   CDP_PORT  Chrome debug port, default random 9400-9799 (fix it when
 *             several people shoot on one machine)
 *
 * Prints, per page, the document's scroll width: anything above W is a
 * horizontal overflow and a failed acceptance check.
 *
 * No dependencies: Node 22+ has fetch and WebSocket built in.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = process.env;
const BASE = env.BASE || 'http://127.0.0.1:8000';
const W = Number(env.W || 360);
const H = Number(env.H || 780);
const WAIT = Number(env.WAIT || 6000);
const SCREENS = Number(env.SCREENS || 3);
const OUT = process.argv[2] || join(tmpdir(), 'hisab-shots');
const CHROME = env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(env.CDP_PORT) || 9400 + Math.floor(Math.random() * 400);
const PROFILE = join(tmpdir(), `hisab-shoot-${PORT}`);

const PAGES = (env.PAGES || [
  'index.html',
  'modules/ledger/list.html',
  'modules/accounts/list.html',
  'modules/reports/insights.html',
  'modules/vault/list.html',
  'modules/settings/index.html',
  'modules/business/list.html',
  'modules/investments/list.html',
  'modules/budgets/list.html',
  'modules/categories/list.html',
].join(',')).split(',');

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`,
  '--remote-allow-origins=*', 'about:blank',
], { stdio: 'ignore' });

let target;
for (let i = 0; i < 50 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { /* not up yet */ }
  if (!target) await sleep(200);
}
if (!target) { console.error('Chrome did not start:', CHROME); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const waiting = new Map();
const problems = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg.result || {}); waiting.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    problems.push(`exception: ${(d.exception?.description || d.text || '').split('\n')[0]}`);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    problems.push(`console: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq;
  waiting.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

await send('Page.enable');
await send('Runtime.enable');
await send('Page.setBypassCSP', { enabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
if (env.THEME) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: env.THEME }] });
}

const go = async (path) => { await send('Page.navigate', { url: `${BASE}/${path}` }); await sleep(WAIT); };

if (env.EMAIL && env.PASSWORD) {
  await go('404.html');
  const result = await evaluate(`import('/shared/js/core/session.js')
    .then((m) => m.signIn(${JSON.stringify(env.EMAIL)}, ${JSON.stringify(env.PASSWORD)}))
    .then((r) => r.ok ? 'signed in' : 'sign-in FAILED')`);
  console.log(result);
}

for (const path of PAGES) {
  problems.length = 0;
  await go(path);
  // Everything outside [A-Za-z0-9_-] becomes _, so a path with a query string
  // (?compose=expense) is still a legal file name on Windows.
  const name = path.replace(/\.html(?=$|[?#])/, '').replace(/[^A-Za-z0-9_-]/g, '_');
  const size = await evaluate('[document.documentElement.scrollWidth, document.documentElement.scrollHeight]');
  const [sw, sh] = size || [0, 0];
  if (env.BEFORE) { await evaluate(env.BEFORE); await sleep(700); }
  const count = Math.min(SCREENS, Math.max(1, Math.ceil(sh / H)));
  for (let i = 0; i < count; i++) {
    await evaluate(`window.scrollTo(0, ${i * (H - 120)})`);
    await sleep(250);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `${name}-${i + 1}.png`), Buffer.from(shot.data, 'base64'));
  }
  if (env.PROBE) {
    await evaluate('window.scrollTo(0, 0)');
    console.log(`  probe: ${JSON.stringify(await evaluate(env.PROBE))}`);
  }
  const overflow = sw > W ? `  OVERFLOW ${sw}px` : '';
  console.log(`${path}  ${sw}x${sh}  ${count} screen(s)${overflow}${problems.length ? `\n    ${problems.join('\n    ')}` : ''}`);
}

console.log(`\n${OUT}`);
ws.close();
chrome.kill();
await sleep(300);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* chrome still holds it */ }
process.exit(0);
