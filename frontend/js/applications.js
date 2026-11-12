(function (root) {
    function initializeApplications({ document, request }) {
        const get = id => document.getElementById(id);
        let historyVersion = 0;
        let analyticsVersion = 0;
        let sessionExpired = false;
        function element(tag, text, className) {
            const node = document.createElement(tag);
            if (text !== undefined) node.textContent = text;
            if (className) node.className = className;
            return node;
        }
        function failure(error, target) {
            if (error.status === 401) {
                sessionExpired = true;
                get('application-content').hidden = true;
                get('login-link').hidden = false;
                get('session-status').textContent = error.message;
            } else target.textContent = error.message || 'Unable to load applications. Use Refresh to try again.';
        }
        function date(value) { return new Date(value).toLocaleString(); }
        function applicationCard(application) {
            const item = element('li', undefined, 'job-card');
            const heading = element('h3');
            const link = element('a', application.jobTitle);
            link.href = `job.html?id=${encodeURIComponent(application.jobId)}`;
            heading.append(link);
            item.append(heading, element('p', application.company, 'job-company'), element('p', application.status, 'job-type'));
            item.append(element('p', `Applied: ${date(application.appliedAt)} · Updated: ${date(application.updatedAt)}`, 'application-dates'));
            if (application.coverLetter) {
                const details = element('details');
                details.append(element('summary', 'Your cover letter'), element('p', application.coverLetter, 'application-letter'));
                item.append(details);
            }
            return item;
        }
        async function loadHistory() {
            const version = ++historyVersion;
            const status = get('history-status');
            status.textContent = 'Loading applications...';
            get('application-list').replaceChildren();
            try {
                const filter = get('status-filter').value;
                const data = await request(`/me${filter ? `?status=${encodeURIComponent(filter)}` : ''}`);
                if (version !== historyVersion || sessionExpired) return;
                get('application-list').replaceChildren(...data.applications.map(applicationCard));
                status.textContent = data.applications.length ? `${data.applications.length} application(s), newest first.` : filter ? 'No applications match this status.' : 'No applications yet. Find a job to get started.';
            } catch (error) { if (version === historyVersion) failure(error, status); }
        }
        async function loadAnalytics() {
            const version = ++analyticsVersion;
            const status = get('analytics-status');
            status.textContent = 'Loading overview...';
            get('summary').replaceChildren();
            get('timeline').replaceChildren();
            try {
                const { analytics } = await request(`/me/analytics?bucket=${get('bucket').value}`);
                if (version !== analyticsVersion || sessionExpired) return;
                for (const [label, count] of [['Total', analytics.total], ...Object.entries(analytics.byStatus)]) {
                    const card = element('p');
                    card.append(element('strong', String(count)), element('span', label));
                    get('summary').append(card);
                }
                const table = element('table');
                table.append(element('caption', 'Applications submitted over time'));
                const header = element('tr');
                for (const text of ['Period starting (UTC)', 'Applications']) {
                    const th = element('th', text); th.scope = 'col'; header.append(th);
                }
                const head = element('thead'); head.append(header); table.append(head);
                const body = element('tbody');
                for (const { period, count } of analytics.overTime) {
                    const row = element('tr'); row.append(element('td', period), element('td', String(count))); body.append(row);
                }
                table.append(body);
                get('timeline').append(table);
                status.textContent = analytics.total ? '' : 'Your overview will appear when you apply for a job.';
            } catch (error) { if (version === analyticsVersion) failure(error, status); }
        }
        const refresh = () => Promise.all([loadHistory(), loadAnalytics()]);
        get('application-content').hidden = false;
        get('status-filter').addEventListener('change', loadHistory);
        get('bucket').addEventListener('change', loadAnalytics);
        get('refresh').addEventListener('click', refresh);
        return { ready: refresh(), refresh, loadHistory, loadAnalytics };
    }
    if (typeof module === 'object' && module.exports) module.exports = { initializeApplications };
    else initializeApplications({ document: root.document, request: root.applicationRequest });
})(globalThis);
