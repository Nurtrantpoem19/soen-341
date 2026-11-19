(function () {
    async function refreshInterviews() {
        const list = document.getElementById('interview-list');
        const status = document.getElementById('interviews-status');
        list.replaceChildren();
        const token = sessionStorage.getItem('careerconnect_token');
        if (!token) return;
        status.textContent = 'Loading interviews...';
        try {
            const responses = await Promise.all(['/api/interviews/me', '/api/applications/me/interviews'].map(path =>
                fetch('http://localhost:3000' + path, { headers: { Authorization: `Bearer ${token}` } })));
            const payloads = await Promise.all(responses.map(response => response.json()));
            const failed = responses.findIndex(response => !response.ok);
            if (failed !== -1) throw new Error(payloads[failed].message || 'Unable to load interviews.');
            const data = { interviews: [...payloads[0].interviews, ...payloads[1].invitations]
                .sort((a,b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)) };
            for (const interview of data.interviews) {
                const item = document.createElement('li');
                item.textContent = `${interview.jobTitle} at ${interview.company}: ${new Date(interview.scheduledAt).toLocaleString()} - ${[interview.location, interview.meetingLink, interview.message].filter(Boolean).join(' - ')}`;
                list.append(item);
            }
            status.textContent = data.interviews.length ? 'Times are shown in your local timezone.' : 'No interviews scheduled.';
        } catch (error) { status.textContent = error.message; }
    }
    document.getElementById('refresh').addEventListener('click', refreshInterviews);
    refreshInterviews();
})();
