// Run the localhost server first, then: node scripts/browser-check.mjs
// Uses a disposable Chrome profile; never connects to a user's browser.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { ORDERS, DRIVER, LEDGER } from '../src/data.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = join(root, 'docs', 'screenshots');
const base = process.env.BROWSER_TEST_URL || 'http://127.0.0.1:5173';
const captureOnly = process.argv.includes('--capture-only');
const prefix = process.argv.find(arg => arg.startsWith('--prefix='))?.split('=')[1] || (captureOnly ? 'initial' : 'final');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), 'hw-hayoon-browser-'));
const downloadOut = join(profile, 'downloads');
await mkdir(downloadOut, { recursive: true });
await mkdir(out, { recursive: true });
let chrome;
let cdp;
const downloads = new Set();
const primaryOrder = ORDERS.find(order => order.id === 1);
const compatibleOrders = ORDERS.filter(order => order.ton <= DRIVER.capacityTon);
const isoDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const report = { date: new Date().toISOString(), base, browser: 'Isolated headless Google Chrome, CDP via Node built-in WebSocket', checks: [], screenshots: [], exceptions: [], consoleErrors: [], failedRequests: [], badResponses: [] };

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.next = 0; this.pending = new Map(); this.events = [];
    this.ready = new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, { once: true }); this.ws.addEventListener('error', reject, { once: true }); });
    this.ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const item = this.pending.get(message.id); if (!item) return;
        this.pending.delete(message.id); clearTimeout(item.timer);
        message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result);
      } else {
        this.events.push(message);
        if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails);
        if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') report.consoleErrors.push(message.params.args.map(arg => arg.value || arg.description).join(' '));
        if (message.method === 'Network.loadingFailed') report.failedRequests.push(message.params);
        if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) report.badResponses.push({ url: message.params.response.url, status: message.params.response.status });
      }
    });
  }
  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function waitFor(expression, label = expression) {
  for (let count = 0; count < 100; count++) { if (await evaluate(expression)) return; await pause(50); }
  throw new Error(`Timed out waiting for ${label}`);
}
async function viewport(width, height) { await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 760 }); }
async function navigate(hash = 'calls', fresh = false) {
  if (fresh) { await evaluate('localStorage.clear()'); }
  await cdp.send('Page.navigate', { url: `${base}/#${hash}` });
  if (fresh) { await cdp.send('Page.reload'); await pause(150); }
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('#app .app-body')`, 'app render');
  await evaluate('document.fonts.ready');
  await pause(350);
}
async function click(selector) {
  await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Missing click target: ' + ${JSON.stringify(selector)}); element.click(); })()`);
  await pause(80);
}
async function fill(selector, value, event = 'input') {
  await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Missing fill target'); element.value = ${JSON.stringify(value)}; element.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })); })()`);
  await pause(80);
}
async function escape() { await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await pause(60); }
async function state() { return evaluate("JSON.parse(localStorage.getItem('hw-hayoon-partner-v1'))"); }
async function ids() { return evaluate("[...document.querySelectorAll('.order-card')].map(card => Number(card.dataset.orderId))"); }
async function routeTo(route) { await click(`a[href="#${route}"]`); await waitFor(`location.hash === '#${route}'`); await pause(100); }
async function capture(name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const path = join(out, `${name}.png`); await writeFile(path, Buffer.from(data, 'base64'));
  report.screenshots.push(path); console.log(`Screenshot: ${path}`);
}
async function submit(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);
  await pause(90);
}
async function downloaded(filename, action) {
  const path = join(downloadOut, filename);
  downloads.add(path);
  await rm(path, { force: true });
  await action();
  for (let count = 0; count < 60; count++) {
    try { const value = await readFile(path, 'utf8'); await rm(path); downloads.delete(path); return value; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await pause(50);
  }
  throw new Error(`Download did not finish: ${filename}`);
}
async function comparisonValues(id) {
  return evaluate(`(() => {
    const card = document.querySelector('[data-comparison-card][data-order-id="${id}"]');
    if (!card) return null;
    const value = selector => Number(card.querySelector(selector).textContent.replace(/[^0-9.\\-]/g, ''));
    const facts = Object.fromEntries([...card.querySelectorAll('.comparison-facts > div')].map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]));
    return { facts, drivingCost: value('.comparison-estimate > div:first-child strong'), remainder: value('.comparison-remainder strong'), negative: card.querySelector('.comparison-remainder').classList.contains('is-negative') };
  })()`);
}
async function modalReachable(name, targetSelector) {
  const result = await evaluate(`(() => {
    const dialog = document.querySelector('#app-dialog');
    const target = dialog?.querySelector(${JSON.stringify(targetSelector)});
    if (!dialog || !target) return false;
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    target.focus({ preventScroll: true });
    const rect = target.getBoundingClientRect();
    const bounds = dialog.getBoundingClientRect();
    return dialog.open && dialog.scrollWidth <= dialog.clientWidth + 1 && bounds.left >= -1 && bounds.right <= innerWidth + 1
      && rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.right <= innerWidth + 1
      && rect.top >= -1 && rect.bottom <= innerHeight + 1 && dialog.contains(document.activeElement);
  })()`);
  check(name, result);
}
async function recordDownload() {
  return JSON.parse(await downloaded(`HW-${String(primaryOrder.id).padStart(4, '0')}-운송기록.json`, () => click(`[data-action="download-record"][data-id="${primaryOrder.id}"]`)));
}
function check(name, details = true) { report.checks.push({ name, passed: Boolean(details), details }); assert.ok(details, name); console.log(`PASS ${name}`); }

try {
  chrome = spawn(process.env.BROWSER_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--disable-extensions', '--disable-default-apps', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let endpoint;
  for (let count = 0; count < 100; count++) { try { endpoint = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; if (endpoint) break; } catch {} await pause(100); }
  assert.ok(endpoint, 'Chrome starts with isolated temporary profile');
  const targets = await (await fetch(`http://127.0.0.1:${endpoint}/json/list`)).json();
  cdp = new CDP(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await Promise.all(['Page.enable', 'Runtime.enable', 'Network.enable'].map(method => cdp.send(method)));
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadOut });
  await viewport(1440, 1050);
  await cdp.send('Page.navigate', { url: base });
  await waitFor('document.readyState === "complete" && !!document.querySelector("#app")');
  await evaluate('localStorage.clear()');
  await navigate('calls');
  await capture(`${prefix}-desktop`);
  await viewport(390, 844);
  await navigate('calls', true);
  await capture(`${prefix}-mobile`);
  if (!captureOnly) {
    await viewport(1440, 1050);
    await navigate('calls');
    await click('[data-action="set-view"][data-view="split"]');
    check('Fresh state shows all vehicle-compatible calls', JSON.stringify(await ids()) === JSON.stringify([...compatibleOrders].sort((a, b) => Number(b.recommended) - Number(a.recommended) || Number(b.urgent) - Number(a.urgent) || a.emptyKm - b.emptyKm || b.rating - a.rating || a.id - b.id).map(order => order.id)));

    await click('a.skip-link');
    check('Skip link focuses main without changing route hash', await evaluate("location.hash === '#calls' && document.activeElement.id === 'main-content'"));
    await evaluate("(() => { const input = document.querySelector('#call-search'); window.__testComposingInput = input; input.focus(); input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '구' })); input.value = '구'; input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '구', isComposing: true, inputType: 'insertCompositionText' })); })()");
    check('Korean IME composition preserves live input node and focus', await evaluate(`document.querySelector('#call-search') === window.__testComposingInput && document.activeElement === window.__testComposingInput && document.querySelectorAll('.order-card').length === ${compatibleOrders.length}`));
    await evaluate("(() => { const input = document.querySelector('#call-search'); input.value = '구포동'; input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '구포동' })); delete window.__testComposingInput; })()");
    check('Korean composition end applies completed search', JSON.stringify((await ids()).sort((a, b) => a - b)) === '[2,8]');
    await click('[data-action="clear-search"]');
    await fill('#call-search', '#175101 약목');
    check('Search matches shipper identity and destination', JSON.stringify(await ids()) === '[1]');
    await fill('#call-search', '존재하지않는콜x');
    check('Search with no match shows empty state', (await ids()).length === 0 && await evaluate("!!document.querySelector('.empty-state')"));
    await click('[data-action="clear-search"]');
    check('Clear search restores compatible calls', (await ids()).length === compatibleOrders.length);

    for (const category of ['추천', '급송', '독차', '묶음']) {
      await click(`[data-action="category"][data-category="${category}"]`);
      const visible = await ids();
      const expected = ORDERS.filter(order => order.ton <= DRIVER.capacityTon && (category === '추천' ? order.recommended : category === '급송' ? order.urgent || order.category === '급송' : order.category === category)).map(order => order.id).sort((a, b) => a - b);
      check(`Category ${category} filters calls`, JSON.stringify(visible.sort((a, b) => a - b)) === JSON.stringify(expected));
    }
    await click('[data-action="category"][data-category="전체"]');
    await fill('#call-sort', 'fare', 'change');
    const fareIds = await ids();
    check('Fare sort orders descending', fareIds.every((id, index) => index === 0 || ORDERS.find(order => order.id === fareIds[index - 1]).fare >= ORDERS.find(order => order.id === id).fare));
    await fill('#call-sort', 'nearby', 'change');
    const nearbyIds = await ids();
    check('Nearby sort orders ascending empty distance', nearbyIds.every((id, index) => index === 0 || ORDERS.find(order => order.id === nearbyIds[index - 1]).emptyKm <= ORDERS.find(order => order.id === id).emptyKm));
    await click('[data-action="filters"]');
    await fill('#min-fare', '80000');
    await fill('#max-empty', '7');
    await evaluate("document.querySelector('#filters-form').requestSubmit()");
    await pause(100);
    const filtered = await ids();
    check('Detailed fare and distance filters apply', filtered.length > 0 && filtered.every(id => { const order = ORDERS.find(order => order.id === id); return order.fare >= 80000 && order.emptyKm <= 7 && order.ton <= DRIVER.capacityTon; }));
    const appliedFilterIds = await ids();
    await click('[data-action="filters"]');
    await click('[data-action="reset-filter-dialog"]');
    check('Dialog reset only changes draft controls', await evaluate("document.querySelector('#min-fare').value === '0' && document.querySelector('#max-empty').value === '100' && document.querySelector('#filters-form [name=\"matched\"]').checked"));
    await escape();
    check('Canceling filter reset preserves applied filters', JSON.stringify(await ids()) === JSON.stringify(appliedFilterIds));
    await click('[data-action="filters"]');
    check('Reopening canceled filter restores applied values', await evaluate("document.querySelector('#min-fare').value === '80000' && document.querySelector('#max-empty').value === '7'"));
    await click('[data-action="reset-filter-dialog"]');
    await evaluate("document.querySelector('#filters-form').requestSubmit()"); await pause(100);
    check('Applying draft reset restores compatible calls', (await ids()).length === compatibleOrders.length);
    await click('[data-action="reset-filters"]');
    await fill('#call-sort', 'recommended', 'change');

    check('Fresh comparison preference defaults to 450 won per km', (await state()).preferences.costPerKm === 450);
    for (const id of [1, 2, 3]) await click(`[data-action="toggle-comparison"][data-id="${id}"]`);
    check('Three comparison selections persist and expose pressed state', JSON.stringify((await state()).comparisonIds) === '[1,2,3]' && await evaluate("[1,2,3].every(id => document.querySelector('[data-action=\"toggle-comparison\"][data-id=\"' + id + '\"]').getAttribute('aria-pressed') === 'true')"));
    await click('[data-action="toggle-comparison"][data-id="4"]');
    check('Fourth comparison selection is refused without changing choices', JSON.stringify((await state()).comparisonIds) === '[1,2,3]' && await evaluate("document.querySelector('[data-action=\"toggle-comparison\"][data-id=\"4\"]').getAttribute('aria-pressed') === 'false' && document.querySelector('#toast').textContent.includes('최대 3')"));
    await evaluate("document.querySelector('.comparison-toolbar[data-action=\"open-comparison\"]').focus({ preventScroll: true })");
    await click('[data-action="open-comparison"]');
    await waitFor("!!document.querySelector('#comparison-cost-form')");
    check('Comparison dialog presents exactly selected order identities', JSON.stringify(await evaluate("[...document.querySelectorAll('[data-comparison-card]')].map(card => Number(card.dataset.orderId))")) === '[1,2,3]');
    for (const id of [1, 2, 3]) {
      const order = ORDERS.find(order => order.id === id);
      const totalKm = order.emptyKm + order.loadedKm;
      const values = await comparisonValues(id);
      check(`Comparison ${id} includes empty distance and correctly rounded driving cost`, values.facts['공차 포함 거리'] === `${totalKm.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}km` && values.drivingCost === Math.round(totalKm * 450) && values.remainder === order.fare - Math.round(totalKm * 450));
    }
    check('Comparison distinguishes reference remainder from profit or confirmed fare', await evaluate("document.querySelector('.comparison-disclaimer').textContent.includes('실제 수익이나 확정 운임이 아닙니다') && document.querySelector('.comparison-disclaimer').textContent.includes('인건비')"));
    await fill('#cost-per-km', '0');
    check('Zero per-km cost is a valid assumption', await evaluate("document.querySelector('#comparison-cost-form').checkValidity()"));
    await submit('#comparison-cost-form');
    check('Zero per-km assumption preserves entire fare as reference remainder', (await state()).preferences.costPerKm === 0 && (await comparisonValues(1)).drivingCost === 0 && (await comparisonValues(1)).remainder === primaryOrder.fare);
    await fill('#cost-per-km', '10000');
    check('Maximum per-km cost is valid', await evaluate("document.querySelector('#comparison-cost-form').checkValidity()"));
    await submit('#comparison-cost-form');
    const highCostValues = await comparisonValues(1);
    check('Negative after-cost reference amount stays negative and marked', highCostValues.remainder === primaryOrder.fare - Math.round((primaryOrder.emptyKm + primaryOrder.loadedKm) * 10000) && highCostValues.remainder < 0 && highCostValues.negative);
    for (const invalid of ['-1', '1.5', '', '10001']) {
      await fill('#cost-per-km', invalid);
      check(`Invalid cost assumption ${JSON.stringify(invalid)} fails native form validity`, !await evaluate("document.querySelector('#comparison-cost-form').checkValidity()"));
      await submit('#comparison-cost-form');
      check(`Invalid cost assumption ${JSON.stringify(invalid)} cannot change saved preference`, (await state()).preferences.costPerKm === 10000);
    }
    await fill('#cost-per-km', '725');
    await submit('#comparison-cost-form');
    await escape();
    await cdp.send('Page.reload'); await pause(160); await waitFor("!!document.querySelector('[data-action=\"open-comparison\"]')");
    check('Comparison selections and custom cost persist after reload', JSON.stringify((await state()).comparisonIds) === '[1,2,3]' && (await state()).preferences.costPerKm === 725);
    await evaluate("document.querySelector('.comparison-toolbar[data-action=\"open-comparison\"]').focus({ preventScroll: true })");
    await click('[data-action="open-comparison"]');
    check('Persisted custom cost is restored in the comparison form', await evaluate("document.querySelector('#cost-per-km').value === '725'"));
    await capture(`${prefix}-comparison-desktop`);
    for (const width of [390, 375]) {
      await viewport(width, 844);
      await modalReachable(`Comparison cost controls remain reachable at ${width}px`, '#cost-per-km');
      await modalReachable(`Third comparison detail action remains reachable at ${width}px`, '[data-action="comparison-detail"][data-id="3"]');
      await evaluate("document.querySelector('#app-dialog .dialog-content').scrollTop = 0");
      await capture(`${prefix}-comparison-${width}`);
    }
    await viewport(1440, 1050);
    await click('[data-action="comparison-detail"][data-id="1"]');
    check('Comparison detail opens matching resource and return action', await evaluate("!!document.querySelector('[data-resource-passport]') && document.querySelector('[data-resource-passport]').textContent.includes('HW-0001') && !!document.querySelector('#app-dialog [data-action=\"open-comparison\"]')"));
    await click('#app-dialog [data-action="open-comparison"]');
    check('Returning from comparison detail retains selected orders and cost', await evaluate("document.querySelectorAll('[data-comparison-card]').length === 3 && document.querySelector('#cost-per-km').value === '725'"));
    for (const id of [2, 3, 1]) await click(`[data-action="remove-comparison"][data-id="${id}"]`);
    check('Removing all comparison orders shows a usable empty state', (await state()).comparisonIds.length === 0 && await evaluate("!!document.querySelector('.comparison-empty') && document.querySelectorAll('[data-comparison-card]').length === 0"));
    await escape();
    check('Closing comparison after removals restores the header comparison opener', await evaluate("document.activeElement === document.querySelector('.comparison-toolbar[data-action=\"open-comparison\"]')"));
    await click('[data-action="detail"][data-id="1"]');
    await click('[data-action="compare-from-detail"][data-id="1"]');
    await waitFor("!!document.querySelector('#comparison-cost-form')");
    check('Detail comparison action selects its order and opens the comparison', JSON.stringify((await state()).comparisonIds) === '[1]' && await evaluate("!!document.querySelector('[data-comparison-card][data-order-id=\"1\"]')"));
    await click('[data-action="clear-comparison"]');
    check('Clear all comparison choices preserves the custom cost assumption', (await state()).comparisonIds.length === 0 && (await state()).preferences.costPerKm === 725 && await evaluate("!!document.querySelector('.comparison-empty') && document.querySelector('#cost-per-km').value === '725'"));
    await escape();
    for (const id of [1, 2]) await click(`[data-action="toggle-comparison"][data-id="${id}"]`);
    await click('[data-action="detail"][data-id="3"]');
    check('Manual loading remains a separate review condition without capacity block', await evaluate("document.querySelector('[data-readiness-condition=\"handling\"]').classList.contains('status-review') && document.querySelector('[data-readiness-condition=\"capacity\"]').classList.contains('status-ok') && !document.querySelector('[data-action=\"accept-confirm\"]').disabled"));
    await escape();

    await click('[data-action="save"][data-id="1"]');
    check('Save toggles call state', (await state()).savedIds.includes(1));
    await routeTo('saved');
    check('Saved route lists saved call only', JSON.stringify(await ids()) === '[1]');
    await cdp.send('Page.reload'); await pause(180); await waitFor("!!document.querySelector('.order-card')");
    check('Saved call persists across reload', JSON.stringify(await ids()) === '[1]' && (await state()).savedIds.includes(1));
    await capture(`${prefix}-saved`);
    await routeTo('calls');

    await click('[data-action="toggle-online"]');
    await click('[data-action="detail"][data-id="1"]');
    check('Offline call detail blocks acceptance', await evaluate("document.querySelector('[data-action=\"accept-confirm\"]').disabled && document.querySelector('.inline-warning').textContent.includes('운행')"));
    await click('[data-action="accept-confirm"]');
    check('Offline blocked click leaves no trip', !(await state()).trip && !await evaluate("!!document.querySelector('#accept-form')"));
    await escape();
    await click('[data-action="toggle-online"]');
    await click('#vehicle-matched');
    const overweight = ORDERS.find(order => order.ton === 7.5);
    check('Disabling vehicle filter reveals 7.5t call', (await ids()).includes(overweight.id));
    await click(`[data-action="detail"][data-id="${overweight.id}"]`);
    check('Incompatible 7.5t call cannot be accepted', await evaluate("document.querySelector('[data-action=\"accept-confirm\"]').disabled && document.querySelector('.inline-warning').textContent.includes('7.5')"));
    check('Overweight preflight blocks capacity while keeping permit review distinct', await evaluate("document.querySelector('[data-readiness-condition=\"capacity\"]').classList.contains('status-blocked') && document.querySelector('[data-readiness-condition=\"permit\"]').classList.contains('status-review')"));
    await escape();
    await click('#vehicle-matched');

    const opener = '[data-action="detail"][data-id="1"]';
    await evaluate(`document.querySelector(${JSON.stringify(opener)}).focus()`);
    await click(opener);
    check('Native modal opens with focus inside dialog', await evaluate("document.querySelector('#app-dialog').open && document.querySelector('#app-dialog').contains(document.activeElement)"));
    await escape();
    check('Escape closes dialog and restores opener focus', await evaluate(`!document.querySelector('#app-dialog') && document.activeElement === document.querySelector(${JSON.stringify(opener)})`));
    await click(opener);
    check('Resource passport reports source material and declared quantities', await evaluate(`(() => { const text = document.querySelector('[data-resource-passport]').textContent; return text.includes(${JSON.stringify(primaryOrder.material)}) && text.includes(${JSON.stringify(primaryOrder.shipper)}) && text.includes(${JSON.stringify(primaryOrder.consignee)}) && text.includes(${JSON.stringify((primaryOrder.ton * 1000).toLocaleString('ko-KR') + 'kg')}) && text.includes(${JSON.stringify('마대 ' + primaryOrder.bags + '개')}); })()`));
    await click('[data-resource-passport] details summary');
    check('Unknown passport information is expandable and remains unverified', await evaluate("document.querySelector('[data-resource-passport] details').open && document.querySelector('[data-resource-passport] details').textContent.includes('미등록') && document.querySelector('[data-resource-passport]').textContent.includes('법정 인증이 아닙니다')"));
    check('Compatible preflight separates capacity and handling checks from permit review', await evaluate("['capacity','handling'].every(id => document.querySelector('[data-readiness-condition=\"' + id + '\"]').classList.contains('status-ok')) && document.querySelector('[data-readiness-condition=\"permit\"]').classList.contains('status-review')"));
    for (const width of [390, 375]) {
      await viewport(width, 844);
      await modalReachable(`Resource detail acceptance action remains reachable at ${width}px`, '[data-action="accept-confirm"]');
      await evaluate("document.querySelector('#app-dialog .dialog-content').scrollTop = 0");
      await capture(`${prefix}-resource-detail-${width}`);
    }
    await viewport(1440, 1050);
    await capture(`${prefix}-call-detail`);
    await click('[data-action="accept-confirm"][data-id="1"]');
    check('Acceptance form requires condition confirmation', !await evaluate("document.querySelector('#accept-form').checkValidity()"));
    check('Acceptance preflight is informational and preserves one required agreement', await evaluate("!!document.querySelector('#app-dialog [data-readiness]') && document.querySelectorAll('#accept-form input[type=\"checkbox\"][required]').length === 1"));
    await click('#accept-terms');
    await fill('#accepted-fare', String(primaryOrder.fare + 1));
    check('Above-ceiling fare is invalid', !await evaluate("document.querySelector('#accepted-fare').checkValidity()"));
    await evaluate("document.querySelector('#accept-form').requestSubmit()");
    check('Invalid fare cannot create trip through form', !(await state()).trip && await evaluate("!!document.querySelector('#accept-form')"));
    await fill('#accepted-fare', '0');
    check('Zero fare is invalid', !await evaluate("document.querySelector('#accepted-fare').checkValidity()"));
    await fill('#accepted-fare', '1');
    check('One won is a valid minimum fare', await evaluate("document.querySelector('#accepted-fare').checkValidity()"));
    await fill('#accepted-fare', '1.5');
    check('Fractional fare fails integer step validity', !await evaluate("document.querySelector('#accepted-fare').checkValidity()"));
    await fill('#accepted-fare', '-1');
    check('Negative fare is invalid', !await evaluate("document.querySelector('#accepted-fare').checkValidity()"));
    await fill('#accepted-fare', String(primaryOrder.fare));
    check('Confirmed valid fare satisfies native form validity', await evaluate("document.querySelector('#accept-form').checkValidity()"));
    await evaluate("document.querySelector('#accept-form').requestSubmit()");
    await waitFor("location.hash === '#trips' && !!document.querySelector('.trip-workspace')");
    check('Accepting call 1 creates to-pickup trip', (await state()).trip?.orderId === 1 && (await state()).trip?.stage === 'to-pickup');
    check('Accepting a selected order removes only that comparison entry', JSON.stringify((await state()).comparisonIds) === '[2]');
    await click('[data-action="detail"][data-id="1"]');
    check('Active trip detail cannot re-add its accepted order to comparison', !await evaluate("!!document.querySelector('#app-dialog [data-action=\"compare-from-detail\"]')") && !(await state()).comparisonIds.includes(primaryOrder.id));
    await escape();
    const acceptedTrip = (await state()).trip;
    check('Accepted trip records acceptance time without fabricating later events', isoDate(acceptedTrip.acceptedAt) && ['pickupAt', 'departedAt', 'arrivedAt'].every(field => !acceptedTrip[field]));
    await click('[data-action="record"][data-id="1"]');
    check('Active transport record shows actual progress and unmeasured resource status', await evaluate("document.querySelector('[data-record-step=\"accepted\"]').classList.contains('record-done') && document.querySelector('[data-record-step=\"pickup\"]').classList.contains('record-current') && document.querySelector('[data-record-step=\"inspection\"]').classList.contains('record-pending') && document.querySelector('[data-resource-passport]').textContent.includes('상차 확인 전')"));
    const activeRecord = await recordDownload();
    check('Active JSON download identifies demo and preserves unknown actual weight', activeRecord.demo === true && activeRecord.status === 'to-pickup' && activeRecord.acceptedFare === primaryOrder.fare && activeRecord.declaredWeightKg === primaryOrder.ton * 1000 && activeRecord.actualWeightKg === null && activeRecord.bagWeights.length === 0 && activeRecord.note.includes('법정 인계서') && activeRecord.timestamps.acceptedAt === acceptedTrip.acceptedAt && activeRecord.timestamps.pickupAt === null && activeRecord.timestamps.completedAt === null);
    for (const width of [390, 375]) {
      await viewport(width, 844);
      await modalReachable(`Active record download remains reachable at ${width}px`, '[data-action="download-record"]');
      await evaluate("document.querySelector('#app-dialog .dialog-content').scrollTop = 0");
      await capture(`${prefix}-active-record-${width}`);
    }
    await viewport(1440, 1050);
    await escape();
    await capture(`${prefix}-trip-pickup`);
    await click('[data-action="advance-trip"]');
    check('Pickup arrival advances to loading', (await state()).trip.stage === 'loading');
    check('Pickup timestamp is recorded when loading begins', isoDate((await state()).trip.pickupAt) && !(await state()).trip.departedAt);
    await click('[data-action="bag-weights"]');
    check('Loading requires exactly 18 individual weight inputs', await evaluate(`document.querySelectorAll('#weights-form input[name="weight"]').length === ${primaryOrder.bags}`));
    await fill('#weights-form input[name="weight"]', '0');
    check('Zero bag weight fails native validity', !await evaluate("document.querySelector('#weights-form input[name=\"weight\"]').checkValidity()"));
    await evaluate("document.querySelector('#weights-form').requestSubmit()");
    check('Invalid bag data cannot advance transport', (await state()).trip.stage === 'loading');
    await fill('#weights-form input[name="weight"]', String(Math.floor(primaryOrder.ton * 1000 / primaryOrder.bags * 100) / 100));
    await click('#weights-form input[type="checkbox"]');
    check('All 18 weights and confirmation validate', await evaluate("document.querySelector('#weights-form').checkValidity() && [...document.querySelectorAll('#weights-form input[name=\"weight\"]')].every(input => input.checkValidity())"));
    await capture(`${prefix}-bag-weights`);
    await evaluate("document.querySelector('#weights-form').requestSubmit()"); await pause(100);
    check('Confirmed weights advance to in-transit', (await state()).trip.stage === 'in-transit' && (await state()).trip.bagWeights.length === primaryOrder.bags);
    check('Departure timestamp is recorded after all weights are confirmed', isoDate((await state()).trip.departedAt) && !(await state()).trip.arrivedAt);
    await click('[data-action="advance-trip"]');
    check('Dropoff arrival advances to arrived', (await state()).trip.stage === 'arrived');
    check('Arrival timestamp is recorded at dropoff', isoDate((await state()).trip.arrivedAt));
    await click('[data-action="record"][data-id="1"]');
    check('Physical arrival waits for driver confirmation before buyer inspection', await evaluate("document.querySelector('[data-record-step=\"confirmation\"]').classList.contains('record-current') && document.querySelector('[data-record-step=\"inspection\"]').classList.contains('record-pending')"));
    const arrivedRecord = await recordDownload();
    check('Pre-confirmation JSON remains arrived with no completed timestamp', arrivedRecord.status === 'arrived' && arrivedRecord.timestamps.completedAt === null && isoDate(arrivedRecord.timestamps.arrivedAt) && (await state()).completedTrips.length === 0);
    await escape();
    await click('[data-action="advance-trip"]');
    const completed = await state();
    check('Final confirmation completes trip as inspection-pending', completed.trip === null && completed.completedTrips.length === 1 && completed.completedTrips[0].status === 'inspection-pending');
    check('Completed trip displays buyer inspection waiting state', await evaluate("document.querySelector('.history-row').textContent.includes('구매자 검사 대기')"));
    const completedDetailHasNoComparison = await evaluate(`(async () => {
      const { orderDetail } = await import('/src/views.js');
      const { ORDERS } = await import('/src/data.js');
      const savedState = JSON.parse(localStorage.getItem('hw-hayoon-partner-v1'));
      const template = document.createElement('template');
      template.innerHTML = orderDetail(ORDERS.find(order => order.id === ${primaryOrder.id}), savedState);
      return !template.content.querySelector('[data-action="compare-from-detail"]');
    })()`);
    // Completed rows expose handoff only; exercise the stale-action guard with a detached-control fixture.
    await evaluate(`(() => {
      const button = document.createElement('button');
      button.dataset.action = 'compare-from-detail'; button.dataset.id = '${primaryOrder.id}'; button.hidden = true;
      document.body.append(button);
      try { button.click(); } finally { button.remove(); }
    })()`);
    check('Completed trip detail and stale action cannot re-add its order to comparison', completedDetailHasNoComparison && !(await state()).comparisonIds.includes(primaryOrder.id));
    await capture(`${prefix}-trip-completed`);
    await click('[data-action="handoff"][data-id="1"]');
    check('Handoff shows 18 bags and inspection boundary', await evaluate("document.querySelector('#app-dialog').textContent.includes('18개') && document.querySelector('#app-dialog').textContent.includes('구매자의 도착 검사')"));
    const completedTrip = completed.completedTrips[0];
    check('Driver confirmation is recorded separately from buyer inspection', await evaluate("document.querySelector('[data-record-step=\"confirmation\"]').classList.contains('record-done')"));
    check('Completed trip retains all recorded stage timestamps in sequence', ['acceptedAt','pickupAt','departedAt','arrivedAt','completedAt'].every(field => isoDate(completedTrip[field])) && ['acceptedAt','pickupAt','departedAt','arrivedAt','completedAt'].map(field => Date.parse(completedTrip[field])).every((value, index, values) => index === 0 || value >= values[index - 1]));
    check('Completed record keeps buyer inspection waiting instead of driver approval', await evaluate("document.querySelector('[data-transport-record] [data-record-step=\"inspection\"]').classList.contains('record-current') && document.querySelector('[data-transport-record]').textContent.includes('구매자 검사와 정산을 기사 화면에서 승인할 수 없어요')"));
    const completedRecord = await recordDownload();
    check('Completed JSON exports exact weights and pending inspection status', completedRecord.demo === true && completedRecord.order.id === primaryOrder.id && completedRecord.acceptedFare === completedTrip.fare && completedRecord.status === 'inspection-pending' && completedRecord.declaredWeightKg === primaryOrder.ton * 1000 && completedRecord.actualWeightKg === completedTrip.bagWeights.reduce((sum, weight) => sum + weight, 0) && JSON.stringify(completedRecord.bagWeights) === JSON.stringify(completedTrip.bagWeights) && ['acceptedAt','pickupAt','departedAt','arrivedAt','completedAt'].every(field => completedRecord.timestamps[field] === completedTrip[field]));
    for (const width of [390, 375]) {
      await viewport(width, 844);
      await modalReachable(`Completed record download remains reachable at ${width}px`, '[data-action="download-record"]');
      await evaluate("document.querySelector('#app-dialog .dialog-content').scrollTop = 0");
      await capture(`${prefix}-completed-record-${width}`);
    }
    await viewport(1440, 1050);
    await escape();

    await routeTo('earnings');
    await click('[data-action="earnings-filter"][data-filter="inspection"]');
    check('Inspection ledger filter shows completed call separately', await evaluate("document.querySelectorAll('.ledger-table tbody tr').length === 1 && document.querySelector('.ledger-table tbody').textContent.includes('구매자 검사 대기')"));
    await click('[data-action="earnings-filter"][data-filter="pending"]');
    check('Pending ledger filter excludes inspection records', await evaluate(`document.querySelectorAll('.ledger-table tbody tr').length === ${LEDGER.filter(row => row.status === 'pending').length} && !document.querySelector('.ledger-table tbody').textContent.includes('구매자 검사 대기')`));
    await click('[data-action="earnings-filter"][data-filter="paid"]');
    check('Paid ledger filter shows paid records', await evaluate(`document.querySelectorAll('.ledger-table tbody tr').length === ${LEDGER.filter(row => row.status === 'paid').length} && [...document.querySelectorAll('.ledger-table tbody .badge')].every(item => item.textContent === '정산 완료')`));
    await click('[data-action="earnings-filter"][data-filter="all"]');
    const csv = await downloaded('HW-하윤-정산내역.csv', () => click('[data-action="download-ledger"]'));
    check('CSV download includes inspection-pending trip', csv.includes('구매자 검사 대기') && csv.includes(primaryOrder.from));

    for (const width of [1440, 768, 390, 375]) {
      await viewport(width, width < 760 ? 844 : 1050);
      for (const page of ['calls', 'trips', 'earnings', 'saved', 'profile']) {
        await routeTo(page);
        await evaluate('document.fonts.ready');
        const geometry = await evaluate('({ scroll: document.documentElement.scrollWidth, width: innerWidth })');
        check(`No document horizontal overflow on ${page} at ${width}px`, geometry.scroll <= geometry.width + 1);
        if (page === 'trips') check(`Completed handoff action remains visible at ${width}px`, await evaluate("(() => { const button = document.querySelector('[data-action=\"handoff\"]'); const rect = button.getBoundingClientRect(); return getComputedStyle(button).display !== 'none' && rect.width > 0 && rect.right <= innerWidth + 1; })()"));
        if (width === 1440 || width === 390) await capture(`${prefix}-${page}-${width}`);
      }
    }
    await viewport(1440, 1050);
    // Migration fixture: legacy completed records have no intermediate timestamps.
    const legacyState = await state();
    for (const field of ['pickupAt', 'departedAt', 'arrivedAt']) delete legacyState.completedTrips[0][field];
    await evaluate(`localStorage.setItem('hw-hayoon-partner-v1', ${JSON.stringify(JSON.stringify(legacyState))})`);
    await cdp.send('Page.reload'); await pause(160); await waitFor("!!document.querySelector('#main-content')");
    await routeTo('trips');
    await click('[data-action="handoff"][data-id="1"]');
    check('Legacy record displays missing intermediate times without fabricating them', await evaluate("['pickup','departed','arrived'].every(id => document.querySelector('[data-record-step=\"' + id + '\"]').textContent.includes('시각 미기록'))"));
    const legacyRecord = await recordDownload();
    check('Legacy JSON preserves unknown timestamps as null after reload', ['pickupAt','departedAt','arrivedAt'].every(field => legacyRecord.timestamps[field] === null) && legacyRecord.timestamps.acceptedAt === completedTrip.acceptedAt && legacyRecord.status === 'inspection-pending');
    await escape();
    await viewport(1440, 1050);
    await routeTo('profile');
    await click('[data-action="reset-demo"]');
    check('Profile reset requires explicit confirmation', (await state()).completedTrips.length === 1 && await evaluate("!!document.querySelector('[data-action=\"confirm-reset\"]')"));
    await escape();
    check('Dismissing reset retains stored data', (await state()).completedTrips.length === 1 && (await state()).savedIds.includes(1));
    await click('[data-action="reset-demo"]');
    await click('[data-action="confirm-reset"]');
    await waitFor("location.hash === '#calls'");
    const reset = await state();
    check('Confirmed profile reset restores fresh demo state', reset.savedIds.length === 0 && reset.trip === null && reset.completedTrips.length === 0 && reset.online && reset.comparisonIds.length === 0 && reset.preferences.costPerKm === 450);
    // 2026-11-05 추가: 메뉴 5개, 첫 화면 우선순위, 보조 글자 크기·대비, 오프라인 차단
    for (const [width, height] of [[375, 667], [390, 844], [768, 1024], [1440, 900]]) {
      await viewport(width, height);
      await navigate('calls', true);
      const first = await evaluate(`(() => {
        const nav = document.querySelector('.mobile-nav'); const bottom = nav && nav.offsetParent ? nav.getBoundingClientRect().top : innerHeight;
        const card = document.querySelector('.order-card');
        const seen = selector => card.querySelector(selector).getBoundingClientRect().bottom <= bottom;
        const menu = [...document.querySelectorAll(${JSON.stringify('.mobile-nav a, .sidebar .nav-item')})].filter(item => item.offsetParent).map(item => item.getAttribute('aria-label') || item.innerText.trim());
        return { route: seen('.order-route'), fare: seen('.order-fare'), weight: seen('.order-weight'), action: seen('[data-action="detail"]'), menu };
      })()`);
      check(`First call shows route, fare, weight and detail action without scrolling at ${width}x${height}`, first.route && first.fare && first.weight && first.action);
      check(`All five menus are reachable at ${width}px`, ['콜 찾기', '내 운송', '정산 관리', '저장한 콜', '내 정보'].every(name => first.menu.includes(name)));
    }
    await viewport(390, 844);
    for (const page of ['calls', 'trips', 'earnings', 'saved', 'profile']) {
      await navigate(page, true);
      const small = await evaluate(`(() => {
        const lum = c => { const m = c.match(/[\\d.]+/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
        const bg = el => { while (el) { const b = getComputedStyle(el).backgroundColor; if (b && !b.startsWith('rgba(0, 0, 0, 0)')) return b; el = el.parentElement; } return 'rgb(255, 255, 255)'; };
        return [...document.querySelectorAll('.main-content *, .mobile-nav *')].filter(el => el.offsetParent && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).filter(el => !el.closest('.chart-column, .leaflet-container, .sr-only')).map(el => {
          const cs = getComputedStyle(el); const a = lum(cs.color), b = lum(bg(el));
          return { text: el.textContent.trim().slice(0, 20), size: parseFloat(cs.fontSize), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
        }).filter(item => item.size < 12 || item.ratio < 4.5);
      })()`);
      if (small.length) console.log(`작거나 흐린 글자(${page}):`, JSON.stringify(small.slice(0, 12)));
      check(`Text on ${page} is at least 12px with 4.5:1 contrast at 390px`, small.length === 0);
    }
    await navigate('calls', true);
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await waitFor('!navigator.onLine', 'offline');
    check('Offline banner explains what still works', await evaluate("!document.getElementById('offline-banner').hidden && document.getElementById('offline-banner').innerText.includes('수락과 운송 단계 전송')"));
    await click(`[data-action="detail"][data-id="${primaryOrder.id}"]`);
    await click('[data-action="accept-confirm"]');
    await evaluate("document.getElementById('accept-terms') && (document.getElementById('accept-terms').checked = true)");
    await submit('#accept-form');
    check('Offline accept is blocked with a reason and keeps the fare input', await evaluate("document.getElementById('form-error').innerText.includes('인터넷 연결이 끊겨') && !!document.querySelector('#accept-form [name=fare]').value") && ((await state())?.trip ?? null) === null);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await waitFor('navigator.onLine', 'online');
    await submit('#accept-form');
    await waitFor("location.hash === '#trips'");
    const online = await state();
    check('Reconnected accept stores the real acceptance time', online.trip?.orderId === primaryOrder.id && isoDate(online.trip.acceptedAt));
    check('Offline banner hides after reconnecting', await evaluate("document.getElementById('offline-banner').hidden"));
    check('No browser exceptions', report.exceptions.length === 0);
    check('No console errors', report.consoleErrors.length === 0);
    check('No HTTP 404 or other failed responses', report.badResponses.length === 0);
    // Aborted tile requests during route changes are normal. Other network failures are errors.
    check('No unexpected failed network requests', report.failedRequests.filter(request => !request.canceled && request.errorText !== 'net::ERR_ABORTED').length === 0);
    report.summary = { passed: report.checks.length, screenshots: report.screenshots.length, errors: 0 };
  }
} catch (error) {
  report.failure = error.stack || String(error); console.error(report.failure); process.exitCode = 1;
} finally {
  report.summary = { passed: report.checks.filter(check => check.passed).length, failed: report.checks.filter(check => !check.passed).length, screenshots: report.screenshots.length, exceptions: report.exceptions.length, consoleErrors: report.consoleErrors.length, httpErrors: report.badResponses.length };
  if (!captureOnly) await writeFile(join(root, 'docs', 'BROWSER_TEST_RESULTS.json'), JSON.stringify(report, null, 2) + '\n');
  await Promise.all([...downloads].map(path => rm(path, { force: true })));
  cdp?.close();
  if (chrome && chrome.exitCode === null) { chrome.kill('SIGTERM'); await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), pause(2000)]); if (chrome.exitCode === null) chrome.kill('SIGKILL'); }
  await rm(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
}
