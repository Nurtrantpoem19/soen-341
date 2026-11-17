// AI-Powered Resume Feedback panel (Sprint 3). Uses POST/GET /api/resumes/:id/feedback.
// All AI text is written with textContent, never innerHTML.
(function () {
    const API_URL = "http://localhost:3000/api";
    const TOKEN_KEY = "careerconnect_token";

    const form = document.getElementById("feedback-form");
    const resumeSelect = document.getElementById("feedback-resume");
    const jobSelect = document.getElementById("feedback-job");
    const button = document.getElementById("feedback-button");
    const status = document.getElementById("feedback-status");
    const result = document.getElementById("feedback-result");
    const sections = document.getElementById("feedback-sections");

    function setStatus(message, state) {
        status.textContent = message;
        status.dataset.state = state || "error";
    }

    function authHeaders() {
        return { Authorization: "Bearer " + sessionStorage.getItem(TOKEN_KEY), "Content-Type": "application/json" };
    }

    async function readJson(response) {
        const data = await response.json().catch(function () { return {}; });
        if (response.status === 401) {
            sessionStorage.removeItem(TOKEN_KEY);
            throw new Error("Your session has expired. Please log in again.");
        }
        return data;
    }

    function scoreLevel(score) {
        if (score >= 80) return "high";
        if (score >= 60) return "medium";
        return "low";
    }

    function setScore(badgeId, valueId, score) {
        const badge = document.getElementById(badgeId);
        badge.hidden = score === null;
        if (score === null) return;
        badge.dataset.level = scoreLevel(score);
        document.getElementById(valueId).textContent = score;
    }

    function renderList(title, items, kind) {
        const section = document.createElement("section");
        section.className = "feedback-section";
        section.dataset.kind = kind;
        const heading = document.createElement("h3");
        heading.textContent = title;
        const list = document.createElement("ul");
        if (items.length === 0) {
            const empty = document.createElement("li");
            empty.className = "empty";
            empty.textContent = "Nothing to note.";
            list.append(empty);
        }
        items.forEach(function (text) {
            const item = document.createElement("li");
            item.textContent = text;
            list.append(item);
        });
        section.append(heading, list);
        return section;
    }

    function renderFeedback(entry) {
        const feedback = entry.feedback;
        setScore("overall-score-badge", "overall-score", feedback.overallScore);
        setScore("match-score-badge", "match-score", feedback.jobMatch ? feedback.jobMatch.score : null);
        const date = new Date(entry.createdAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
        document.getElementById("feedback-meta").textContent =
            (entry.jobTitle ? "Reviewed for " + entry.jobTitle : "General review") + " · " + date;
        document.getElementById("feedback-summary").textContent = feedback.summary;

        const blocks = [
            renderList("Strengths", feedback.strengths, "strengths"),
            renderList("Gaps to address", feedback.gaps, "gaps"),
            renderList("Formatting tips", feedback.formatting, "formatting")
        ];
        if (feedback.jobMatch) {
            blocks.push(
                renderList("Matches the job", feedback.jobMatch.matchedSkills, "strengths"),
                renderList("Missing for the job", feedback.jobMatch.missingSkills, "gaps")
            );
        }
        sections.replaceChildren.apply(sections, blocks);
        result.hidden = false;
    }

    // Shows the most recent saved review for the selected resume, if there is one.
    async function loadLatest() {
        result.hidden = true;
        setStatus("");
        if (!resumeSelect.value) return;
        try {
            const response = await fetch(API_URL + "/resumes/" + resumeSelect.value + "/feedback", { headers: authHeaders() });
            const data = await readJson(response);
            if (response.ok) renderFeedback(data);
        } catch (error) {
            setStatus(error.message);
        }
    }

    async function loadJobs() {
        try {
            const response = await fetch(API_URL + "/jobs");
            const data = await response.json();
            (data.jobs || []).forEach(function (job) {
                jobSelect.append(new Option(job.title + " — " + job.company, job.id));
            });
        } catch (error) {
            // Job targeting is optional; a general review still works.
        }
    }

    document.addEventListener("resumes:loaded", function (event) {
        const previous = resumeSelect.value;
        const resumes = event.detail;
        resumeSelect.replaceChildren();
        if (resumes.length === 0) {
            resumeSelect.append(new Option("Upload a resume first", ""));
        }
        resumes.forEach(function (resume) {
            resumeSelect.append(new Option(resume.original_name, resume.id));
        });
        resumeSelect.disabled = resumes.length === 0;
        button.disabled = resumes.length === 0;
        if (resumes.some(function (resume) { return String(resume.id) === previous; })) {
            resumeSelect.value = previous;
        }
        loadLatest();
    });

    resumeSelect.addEventListener("change", loadLatest);

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!resumeSelect.value) return;
        button.disabled = true;
        button.textContent = "Analyzing your resume…";
        setStatus("This usually takes 20 to 60 seconds.", "info");
        try {
            const response = await fetch(API_URL + "/resumes/" + resumeSelect.value + "/feedback", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify(jobSelect.value ? { jobId: Number(jobSelect.value) } : {})
            });
            const data = await readJson(response);
            if (!response.ok) throw new Error(data.message || "Unable to get AI feedback. Please try again.");
            renderFeedback(data);
            setStatus("Feedback ready.", "success");
        } catch (error) {
            setStatus(error.message || "Unable to connect to the server. Please try again.");
        } finally {
            button.disabled = false;
            button.textContent = "Get AI feedback";
        }
    });

    if (sessionStorage.getItem(TOKEN_KEY)) {
        loadJobs();
    } else {
        setStatus("Please log in to get AI feedback on your resume.");
    }
})();
