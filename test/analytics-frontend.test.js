const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { initializeApplications } = require('../frontend/js/applications');
const { createApplicationApi } = require('../frontend/js/application-api');
const html = fs.readFileSync(path.join(__dirname, '../frontend/applications.html'), 'utf8');
const analytics = { total: 4, byStatus: { Applied: 2, 'Under Review': 1, Interview: 1, Offered: 0, Rejected: 0 }, overTime: [{ period: '2026-10-01', count: 1 }, { period: '2026-11-01', count: 3 }] };
const application = { jobId: 1, jobTitle: '<img src=x onerror=alert(1)>', company: 'Demo company', status: 'Interview', appliedAt: '2026-11-01', updatedAt: '2026-11-02', coverLetter: '<script>bad()</script>' };
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(t, request) {
  const dom = new JSDOM(html, { url: 'http://localhost:3000/frontend/applications.html' });
  t.after(() => dom.window.close());
  return { document: dom.window.document, window: dom.window, ui: initializeApplications({ document: dom.window.document, request }) };
}
test('AC-AN-01: Given saved applications, when dashboard loads, then totals, status bars, activity and safe history agree', async t => {
  const { document, ui } = setup(t, async p => p.includes('analytics') ? { analytics } : { applications: [application] });
  await ui.ready;
  assert.equal(document.querySelector('#summary strong').textContent, '4');
  assert.equal(document.querySelectorAll('#status-chart .analytics-bar').length, 5);
  assert.equal(document.querySelector('#status-chart .analytics-bar').style.width, '50%');
  assert.equal(document.querySelectorAll('#activity-chart .analytics-bar')[1].style.width, '100%');
  assert.equal(document.querySelectorAll('#timeline tbody tr').length, 2);
  assert.equal(document.querySelector('#application-list h3').textContent, application.jobTitle);
  assert.equal(document.querySelectorAll('#application-list img, #application-list script').length, 0);
});
test('AC-AN-02: Given a dashboard, when week grouping or status filter changes, then correct requests update independent sections', async t => {
  const paths = [];
  const { document, window, ui } = setup(t, async p => { paths.push(p); return p.includes('analytics') ? { analytics } : { applications: [] }; });
  await ui.ready;
  document.querySelector('#bucket').value = 'week';
  document.querySelector('#bucket').dispatchEvent(new window.Event('change')); await tick();
  assert.equal(paths.at(-1), '/me/analytics?bucket=week');
  document.querySelector('#status-filter').value = 'Under Review';
  document.querySelector('#status-filter').dispatchEvent(new window.Event('change')); await tick();
  assert.equal(paths.at(-1), '/me?status=Under%20Review');
  assert.match(document.querySelector('#history-status').textContent, /No applications match/);
  assert.equal(document.querySelector('#summary strong').textContent, '4');
});
test('AC-AN-03: Given no applications, when dashboard loads, then zero totals and helpful empty states appear', async t => {
  const empty = { ...analytics, total: 0, byStatus: Object.fromEntries(Object.keys(analytics.byStatus).map(s => [s, 0])), overTime: [] };
  const { document, ui } = setup(t, async p => p.includes('analytics') ? { analytics: empty } : { applications: [] }); await ui.ready;
  assert.match(document.querySelector('#history-status').textContent, /No applications yet/);
  assert.match(document.querySelector('#activity-chart').textContent, /No application activity/);
  assert.equal(document.querySelector('#summary strong').textContent, '0');
  assert.equal(document.querySelector('#status-chart .analytics-bar').style.width, '0%');
});
test('AC-AN-04: Given a failed request, when Refresh succeeds, then the error clears; expired sessions hide private data', async t => {
  let mode = 'offline';
  const { document, window, ui } = setup(t, async p => {
    if (mode === 'offline') throw new Error('Offline. Retry.');
    if (mode === 'expired') throw Object.assign(new Error('Log in again.'), { status: 401 });
    return p.includes('analytics') ? { analytics } : { applications: [] };
  }); await ui.ready;
  assert.match(document.querySelector('#analytics-status').textContent, /Offline/);
  mode = 'ok'; document.querySelector('#refresh').click(); await tick();
  assert.equal(document.querySelector('#analytics-status').textContent, '');
  mode = 'expired'; document.querySelector('#bucket').dispatchEvent(new window.Event('change')); await tick();
  assert.equal(document.querySelector('#application-content').hidden, true);
  assert.equal(document.querySelector('#login-link').hidden, false);
});
test('AC-AN-05: Given overlapping analytics requests, when an old response arrives late, then the newest selection stays visible', async t => {
  let finishOld;
  const { document, ui } = setup(t, async p => {
    if (p.endsWith('month')) return new Promise(resolve => { finishOld = resolve; });
    return p.includes('analytics') ? { analytics: { ...analytics, total: 9 } } : { applications: [] };
  });
  document.querySelector('#bucket').value = 'week'; await ui.loadAnalytics();
  finishOld({ analytics }); await ui.ready;
  assert.equal(document.querySelector('#summary strong').textContent, '9');
});
test('AC-AN-06: Given no token or an expired session, when requesting analytics, then private requests are blocked or session is cleared', async () => {
  let token = null, calls = 0;
  const request = createApplicationApi({ sessionStorage: { getItem: () => token, removeItem: () => { token = null; } }, fetch: async (_url, options) => { calls++; assert.equal(options.headers.Authorization, 'Bearer test'); return { status: 401 }; } });
  await assert.rejects(request('/me/analytics'), { status: 401 }); assert.equal(calls, 0);
  token = 'test'; await assert.rejects(request('/me/analytics'), { status: 401 }); assert.equal(token, null);
});
test('AC-AN-07: Given the app server, when public pages or private files are requested, then only public assets are served', async t => {
  const { createApp } = require('../server');
  const server = createApp({ query: async () => ({ rows: [] }) }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/frontend/applications.html')).status, 200);
  assert.match(await (await fetch(base + '/')).text(), /href="frontend\/applications.html"/);
  for (const file of ['/.env', '/server.js', '/package.json']) assert.equal((await fetch(base + file)).status, 404);
});
