(function () {
    async function refreshInterviews() {
        const list = document.getElementById('interview-list');
        const status = document.getElementById('interviews-status');
        list.replaceChildren();
        const token = sessionStorage.getItem('careerconnect_token');
        if (!token) return;
        status.textContent = 'Loading interviews...';
        try {
            const response = await fetch('http://localhost:3000/api/interviews/me', { headers: { Authorization: `Bearer ${token}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Unable to load interviews.');
            for (const interview of data.interviews) {
                const item = document.createElement('li');
                item.textContent = `${interview.jobTitle} at ${interview.company}: ${new Date(interview.scheduledAt).toLocaleString()} - ${interview.location}`;
                list.append(item);
            }
            status.textContent = data.interviews.length ? 'Times are shown in your local timezone.' : 'No interviews scheduled.';
        } catch (error) { status.textContent = error.message; }
    }
    document.getElementById('refresh').addEventListener('click', refreshInterviews);
    refreshInterviews();
})();
