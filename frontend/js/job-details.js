const API_URL = "http://localhost:3000/api/jobs";

const detailsStatus = document.getElementById("details-status");
const jobDetails = document.getElementById("job-details");
const backLink = document.getElementById("back-to-search");
const applyButton = document.getElementById("apply-button");
const applyStatus = document.getElementById("apply-status");
const requirementsSection = document.getElementById("requirements-section");
const requirementsList = document.getElementById("job-requirements");

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
