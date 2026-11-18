const API_URL = "http://localhost:3000/api/jobs";

const detailsStatus = document.getElementById("details-status");
const jobDetails = document.getElementById("job-details");
const backLink = document.getElementById("back-to-search");
const applyButton = document.getElementById("apply-button");
const applyStatus = document.getElementById("apply-status");
const requirementsSection = document.getElementById("requirements-section");
const requirementsList = document.getElementById("job-requirements");
const matchForm = document.getElementById("match-form");
const matchResume = document.getElementById("match-resume");
const matchButton = document.getElementById("match-button");
const matchStatus = document.getElementById("match-status");
const matchResult = document.getElementById("match-result");
const matchScore = document.getElementById("match-score");
const matchSummary = document.getElementById("match-summary");
const matchedSkills = document.getElementById("matched-skills");
const missingSkills = document.getElementById("missing-skills");
const matchForm = document.getElementById("match-form");
const matchResume = document.getElementById("match-resume");
const matchButton = document.getElementById("match-button");
const matchStatus = document.getElementById("match-status");
const matchResult = document.getElementById("match-result");
const matchScore = document.getElementById("match-score");
const matchSummary = document.getElementById("match-summary");
const matchedSkills = document.getElementById("matched-skills");
const missingSkills = document.getElementById("missing-skills");

// Proposed integration point for Job Application Submission and Tracking (feature/sprint2-application-tracking-jack).
// That branch adds POST /api/applications with { jobId, jobTitle, company, coverLetter } and returns { application }.
// Replace this stub with the real request once that API and login tokens are available on main.
const applicationApi = {
    async submitApplication(job) {
        void job;
        throw new Error("Job applications will be available once application tracking is connected.");
    }
};

let currentJob = null;
const TOKEN_KEY = "careerconnect_token";
function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
const TOKEN_KEY = "careerconnect_token";

function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
}

function formatDate(value) {
    return new Date(value).toLocaleDateString("en-CA", {
        month: "long",
        day: "numeric",
        year: "numeric"
    });
}

function setText(id, text) {
    document.getElementById(id).textContent = text;
}

function showError(message) {
    detailsStatus.textContent = message;
    detailsStatus.hidden = false;
    jobDetails.hidden = true;
}

function showApplyStatus(message, state = "error") {
    applyStatus.textContent = message;
    applyStatus.dataset.state = state;
}

function renderJob(job) {
    currentJob = job;
    document.title = `${job.title} at ${job.company} | CareerConnect`;

    setText("job-category", job.category);
    setText("job-title", job.title);
    setText("job-company", job.company);
    setText("job-type", job.employmentType);
    setText("job-location", job.location);
    setText("job-salary", job.salary || "Not specified");
    setText("job-posted", formatDate(job.postedAt));
    setText("job-description", job.description);

    const requirements = job.requirements
        .split("\n")
        .map(function (line) { return line.trim(); })
        .filter(Boolean);

    requirementsList.replaceChildren(...requirements.map(function (requirement) {
        const item = document.createElement("li");
        item.textContent = requirement;
        return item;
    }));
    requirementsSection.hidden = requirements.length === 0;

    detailsStatus.hidden = true;
    jobDetails.hidden = false;
    loadMatchData(job.id);
}

function setMatchStatus(message, state = "error") {
    matchStatus.textContent = message;
    matchStatus.dataset.state = state;
}

function renderMatch(match) {
    const feedback = match.feedback || {};
    const jobMatch = feedback.jobMatch;
    if (!jobMatch) return;
    matchScore.textContent = `${jobMatch.score}%`;
    matchSummary.textContent = feedback.summary || "";
    matchedSkills.replaceChildren(...jobMatch.matchedSkills.map(function (skill) {
        const item = document.createElement("li"); item.textContent = skill; return item;
    }));
    missingSkills.replaceChildren(...jobMatch.missingSkills.map(function (skill) {
        const item = document.createElement("li"); item.textContent = skill; return item;
    }));
    matchResult.hidden = false;
}

async function loadMatchData(jobId) {
    const token = getToken();
    if (!token) { setMatchStatus("Log in and save profile skills before matching a resume."); return; }
    try {
        const resumesResponse = await fetch("http://localhost:3000/api/resumes", { headers: { Authorization: `Bearer ${token}` } });
        const resumesData = await resumesResponse.json();
        if (!resumesResponse.ok) { setMatchStatus(resumesData.message || "Unable to load your resumes."); return; }
        matchResume.replaceChildren();
        if (!resumesData.resumes.length) {
            const option = document.createElement("option"); option.value = ""; option.textContent = "Upload a resume first";
            matchResume.append(option); setMatchStatus("Upload a resume to enable AI matching."); return;
        }
        resumesData.resumes.forEach(function (resume) {
            const option = document.createElement("option"); option.value = resume.id; option.textContent = resume.original_name;
            matchResume.append(option);
        });
        matchResume.disabled = false; matchButton.disabled = false; setMatchStatus("");
        const matchResponse = await fetch(`http://localhost:3000/api/jobs/${jobId}/match`, { headers: { Authorization: `Bearer ${token}` } });
        if (matchResponse.ok) renderMatch(await matchResponse.json());
    } catch (error) { setMatchStatus("Unable to load your resume or previous match."); }
    loadMatchData(job.id);
}

function setMatchStatus(message, state = "error") {
    matchStatus.textContent = message;
    matchStatus.dataset.state = state;
}

function renderMatch(match) {
    const feedback = match.feedback || {};
    const jobMatch = feedback.jobMatch;
    if (!jobMatch) {
        matchResult.hidden = true;
        return;
    }
    matchScore.textContent = `${jobMatch.score}%`;
    matchSummary.textContent = feedback.summary || "";
    matchedSkills.replaceChildren(...jobMatch.matchedSkills.map(function (skill) {
        const item = document.createElement("li");
        item.textContent = skill;
        return item;
    }));
    missingSkills.replaceChildren(...jobMatch.missingSkills.map(function (skill) {
        const item = document.createElement("li");
        item.textContent = skill;
        return item;
    }));
    matchResult.hidden = false;
}

async function loadMatchData(jobId) {
    const token = getToken();
    if (!token) {
        setMatchStatus("Log in and save profile skills before matching a resume.");
        return;
    }
    try {
        const resumesResponse = await fetch("http://localhost:3000/api/resumes", {
            headers: { Authorization: `Bearer ${token}` }
        });
        const resumesData = await resumesResponse.json();
        if (!resumesResponse.ok) {
            setMatchStatus(resumesData.message || "Unable to load your resumes.");
            return;
        }
        matchResume.replaceChildren();
        if (!resumesData.resumes.length) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "Upload a resume first";
            matchResume.append(option);
            setMatchStatus("Upload a resume to enable AI matching.");
            return;
        }
        resumesData.resumes.forEach(function (resume) {
            const option = document.createElement("option");
            option.value = resume.id;
            option.textContent = resume.original_name;
            matchResume.append(option);
        });
        matchResume.disabled = false;
        matchButton.disabled = false;
        setMatchStatus("");

        const matchResponse = await fetch(`http://localhost:3000/api/jobs/${jobId}/match`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (matchResponse.ok) {
            renderMatch(await matchResponse.json());
        }
    } catch (error) {
        setMatchStatus("Unable to load your resume or previous match.");
    }
}

async function loadJob() {
    const id = new URLSearchParams(window.location.search).get("id");

    if (!id || !/^\d+$/.test(id)) {
        showError("This job link is not valid. Return to job search to find another opportunity.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/${id}`);
        const data = await response.json();

        if (response.status === 404) {
            showError("This job is no longer available. Return to job search to find another opportunity.");
            return;
        }

        if (!response.ok) {
            showError(data.message || "Unable to load this job. Please try again.");
            return;
        }

        renderJob(data.job);
    } catch (error) {
        showError("Unable to connect to the server. Please try again.");
    }
}

// Return to the same search results the user came from, when they came from job search.
try {
    const referrer = new URL(document.referrer);
    if (referrer.origin === window.location.origin && referrer.pathname.endsWith("/jobs.html")) {
        backLink.href = `jobs.html${referrer.search}`;
    }
} catch (error) {
    // No referrer: keep the default link to job search.
}

matchForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!currentJob || !matchResume.value) { setMatchStatus("Select a resume before matching."); return; }
    const token = getToken();
    if (!token) { setMatchStatus("Log in to match a resume."); return; }
    matchButton.disabled = true; matchButton.textContent = "Matching...";
    setMatchStatus("Analyzing this job and your resume...", "success");
    try {
        const response = await fetch(`http://localhost:3000/api/jobs/${currentJob.id}/match`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ resumeId: Number(matchResume.value) })
        });
        const data = await response.json();
        if (!response.ok) { setMatchStatus(data.message || "Unable to match this resume."); return; }
        setMatchStatus("Match complete.", "success");
        renderMatch(data);
    } catch (error) { setMatchStatus("Unable to connect to the AI matcher. Please try again."); }
    finally { matchButton.disabled = false; matchButton.textContent = "Match my resume"; }
});

matchForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!currentJob || !matchResume.value) {
        setMatchStatus("Select a resume before matching.");
        return;
    }
    const token = getToken();
    if (!token) {
        setMatchStatus("Log in to match a resume.");
        return;
    }
    matchButton.disabled = true;
    matchButton.textContent = "Matching...";
    setMatchStatus("Analyzing this job and your resume...", "success");
    try {
        const response = await fetch(`http://localhost:3000/api/jobs/${currentJob.id}/match`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ resumeId: Number(matchResume.value) })
        });
        const data = await response.json();
        if (!response.ok) {
            setMatchStatus(data.message || "Unable to match this resume.");
            return;
        }
        setMatchStatus("Match complete.", "success");
        renderMatch(data);
    } catch (error) {
        setMatchStatus("Unable to connect to the AI matcher. Please try again.");
    } finally {
        matchButton.disabled = false;
        matchButton.textContent = "Match my resume";
    }
});

applyButton.addEventListener("click", async function () {
    if (!currentJob) {
        return;
    }

    applyButton.disabled = true;
    applyButton.textContent = "Submitting...";
    showApplyStatus("");

    try {
        await applicationApi.submitApplication({
            jobId: currentJob.id,
            jobTitle: currentJob.title,
            company: currentJob.company
        });
        showApplyStatus("Your application was submitted successfully.", "success");
    } catch (error) {
        showApplyStatus(error.message || "Your application could not be submitted. Please try again.");
    } finally {
        applyButton.disabled = false;
        applyButton.textContent = "Apply for this job";
    }
});

loadJob();
