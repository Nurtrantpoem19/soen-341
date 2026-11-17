const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApplicationApi } = require('../frontend/js/application-api');
const { initializeApplications } = require('../frontend/js/applications');
const vm = require('node:vm');
const fs = require('node:fs');

function documentStub() {
    function node(tag = 'div') {
        return { tag, children: [], value: '', textContent: '', hidden: false, dataset: {}, listeners: {},
            append(...children) { this.children.push(...children); },
            replaceChildren(...children) { this.children = children; },
            addEventListener(event, listener) { this.listeners[event] = listener; },
            set innerHTML(value) { throw new Error('Untrusted HTML must not be interpreted'); }
        };
    }
    const nodes = new Map();
    return { createElement: node, getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); } };
}
const analytics = { total: 1, byStatus: { Applied: 1 }, overTime: [{ period: '2026-11-01', count: 1 }] };
const application = { jobId: 2, jobTitle: '<img src=x onerror=alert(1)>', company: 'Example', status: 'Applied', coverLetter: '<script>test</script>', appliedAt: '2026-11-12', updatedAt: '2026-11-12' };

test('application client requires login, sends bearer token and clears an expired session', async () => {
    let token = null, calls = 0;
    const environment = { sessionStorage: { getItem: () => token, removeItem: () => { token = null; } },
        fetch: async (url, options) => {
            calls++;
            assert.equal(options.headers.Authorization, 'Bearer session-token');
            assert.equal(url, 'http://localhost:3000/api/applications');
            return { status: 401, ok: false };
        } };
    const request = createApplicationApi(environment);
    await assert.rejects(request(''), { status: 401 });
    assert.equal(calls, 0);
    token = 'session-token';
    await assert.rejects(request('', { method: 'POST', body: '{"jobId":2}' }), { status: 401 });
    assert.equal(token, null);
});

test('history safely renders saved fields and filters independently of analytics', async () => {
    const document = documentStub(), paths = [];
    document.getElementById('bucket').value = 'month';
    const ui = initializeApplications({ document, request: async path => {
        paths.push(path);
        return path.includes('analytics') ? { analytics } : { applications: path.includes('?') ? [] : [application] };
    } });
    await ui.ready;
    const item = document.getElementById('application-list').children[0];
    assert.equal(item.children[0].children[0].textContent, application.jobTitle);
    assert.equal(item.children.at(-1).children[1].textContent, application.coverLetter);
    document.getElementById('status-filter').value = 'Under Review';
    await ui.loadHistory();
    assert.equal(paths.at(-1), '/me?status=Under%20Review');
    assert.match(document.getElementById('history-status').textContent, /No applications match/);
    assert.equal(document.getElementById('summary').children.length, 2);
    document.getElementById('bucket').value = 'week';
    await ui.loadAnalytics();
    assert.equal(paths.at(-1), '/me/analytics?bucket=week');
});

test('late history responses cannot overwrite a newer filter selection', async () => {
    const document = documentStub();
    let resolveOld;
    const ui = initializeApplications({ document, request: async path => {
        if (path.includes('analytics')) return { analytics };
        if (path === '/me') return new Promise(resolve => { resolveOld = resolve; });
        return { applications: [] };
    } });
    document.getElementById('status-filter').value = 'Rejected';
    await ui.loadHistory();
    resolveOld({ applications: [application] });
    await ui.ready;
    assert.equal(document.getElementById('application-list').children.length, 0);
    assert.match(document.getElementById('history-status').textContent, /No applications match/);
});

test('dashboard supports retry after failure and hides private content after 401', async () => {
    const document = documentStub();
    let mode = 'offline';
    const ui = initializeApplications({ document, request: async path => {
        if (mode === 'offline') throw new Error('Offline. Please retry.');
        if (mode === 'expired') throw Object.assign(new Error('Please log in again.'), { status: 401 });
        return path.includes('analytics') ? { analytics } : { applications: [] };
    } });
    await ui.ready;
    assert.match(document.getElementById('history-status').textContent, /Offline/);
    mode = 'ready'; await ui.refresh();
    assert.match(document.getElementById('history-status').textContent, /No applications yet/);
    mode = 'expired'; await ui.refresh();
    assert.equal(document.getElementById('application-content').hidden, true);
    assert.equal(document.getElementById('login-link').hidden, false);
});

test('apply submits only job ID and cover letter; duplicate and authentication errors have recoverable UI', async () => {
    for (const status of [201, 409, 401, 500]) {
        const document = documentStub();
        document.referrer = '';
        let payload;
        const context = { document, URL, URLSearchParams, window: { location: { search: '?id=2' } },
            fetch: async () => ({ ok: true, json: async () => ({ job: { id: 2, title: 'Developer', requirements: '', postedAt: '2026-11-12' } }) }),
            applicationRequest: async (path, options) => {
                payload = JSON.parse(options.body);
                if (status !== 201) throw Object.assign(new Error('Request failed'), { status });
                return { application };
            } };
        vm.runInNewContext(fs.readFileSync(require.resolve('../frontend/js/job-details'), 'utf8'), context);
        await new Promise(resolve => setImmediate(resolve));
        document.getElementById('cover-letter').value = '  My experience  ';
        const button = document.getElementById('apply-button');
        await button.listeners.click();
        assert.deepEqual(payload, { jobId: 2, coverLetter: 'My experience' });
        assert.equal(button.disabled, status === 201 || status === 409);
        if (status === 401) assert.equal(document.getElementById('application-link').href, 'login.html');
        if (status === 201 || status === 409) assert.equal(document.getElementById('application-link').href, 'applications.html');
    }
});
