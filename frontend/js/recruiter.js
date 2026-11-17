// Recruiter dashboard and posting management (Sprint 3).
// Talks to /api/recruiter/*, which only accepts logged-in recruiters. All text is written with textContent.
const API_URL = "http://localhost:3000/api/recruiter";
const TOKEN_KEY = "careerconnect_token";
const STATUSES = ["Applied", "Under Review", "Interview", "Offered", "Rejected"];

const pageStatus = document.getElementById("page-status");
const dashboard = document.getElementById("dashboard");
const postingList = document.getElementById("posting-list");
const postingsEmpty = document.getElementById("postings-empty");
const applicationsSection = document.getElementById("applications-section");
const applicationsHeading = document.getElementById("applications-heading");
const applicationsJob = document.getElementById("applications-job");
const applicationsCount = document.getElementById("applications-count");
const applicationsStatus = document.getElementById("applications-status");
const applicationList = document.getElementById("application-list");
const filterForm = document.getElementById("filter-form");
const filterStatus = document.getElementById("filter-status");
const dialog = document.getElementById("posting-dialog");
const postingForm = document.getElementById("posting-form");
const postingError = document.getElementById("posting-error");
const postingSave = document.getElementById("posting-save");

let postings = [];
let view = "active";
let editingId = null;
let selectedJobId = null;

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function formatDate(value) {
    return new Date(value).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function showPageMessage(message, link) {
    dashboard.hidden = true;
    pageStatus.hidden = false;
    pageStatus.textContent = message + " ";
    if (link) {
        const anchor = element("a", "", link.label);
        anchor.href = link.href;
        pageStatus.append(anchor);
    }
}

// Sends an authenticated request. Returns the JSON body, or throws an Error with the server's message.
async function api(path, options = {}) {
    const token = sessionStorage.getItem(TOKEN_KEY);
    let response;
    try {
        response = await fetch(API_URL + path, {
            method: options.method || "GET",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: options.body === undefined ? undefined : JSON.stringify(options.body)
        });
    } catch (error) {
        throw new Error("Unable to connect to the server. Please try again.");
    }
    const data = await response.json().catch(function () { return {}; });
    if (response.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        showPageMessage("Your session has expired.", { label: "Log in again", href: "login.html" });
    }
    if (response.status === 403) {
        showPageMessage("This page is only available to recruiter accounts.", { label: "Browse jobs instead", href: "jobs.html" });
    }
    if (!response.ok) {
        throw new Error(data.message || "Something went wrong. Please try again.");
    }
    return data;
}

// ---------- Postings ----------

function renderPostings() {
    const active = postings.filter(function (job) { return job.isOpen; });
    const archived = postings.filter(function (job) { return !job.isOpen; });
    document.getElementById("active-count").textContent = "(" + active.length + ")";
    document.getElementById("archived-count").textContent = "(" + archived.length + ")";
    document.querySelectorAll(".tab").forEach(function (tab) {
        tab.setAttribute("aria-pressed", String(tab.dataset.view === view));
    });

    const visible = view === "active" ? active : archived;
    postingsEmpty.hidden = visible.length > 0;
    postingsEmpty.textContent = view === "active"
        ? "You have no active postings. Use “New posting” to create one."
        : "You have no archived postings.";
    postingList.replaceChildren(...visible.map(renderPosting));
}

function renderPosting(job) {
    const card = element("li", "job-card posting-card");
    if (job.id === selectedJobId) card.classList.add("selected");

    const header = element("div", "job-card-header");
    const heading = element("div");
    heading.append(element("h3", "", job.title), element("p", "job-company", job.company + " · " + job.location));
    header.append(heading, element("span", "job-type", job.isOpen ? job.employmentType : "Archived"));

    const tags = element("div", "job-tags");
    tags.append(element("span", "job-tag", job.category));
    if (job.salary) tags.append(element("span", "job-tag", job.salary));
    STATUSES.forEach(function (status) {
        const count = job.applicationsByStatus[status];
        if (count) tags.append(element("span", "job-tag status-tag", count + " " + status));
    });

    const footer = element("div", "job-card-footer");
    footer.append(element("span", "job-posted", "Posted " + formatDate(job.postedAt)));
    const actions = element("div", "card-actions");

    const applicationsButton = element("button", "link-button strong", "Applications (" + job.applicationCount + ")");
    applicationsButton.type = "button";
    applicationsButton.addEventListener("click", function () { openApplications(job.id); });

    const editButton = element("button", "link-button", "Edit");
    editButton.type = "button";
    editButton.addEventListener("click", function () { openPostingDialog(job); });

    const archiveButton = element("button", "link-button", job.isOpen ? "Archive" : "Restore");
    archiveButton.type = "button";
    archiveButton.addEventListener("click", async function () {
        archiveButton.disabled = true;
        try {
            await api("/jobs/" + job.id + "/archive", { method: "PATCH", body: { archived: job.isOpen } });
            await loadPostings();
        } catch (error) {
            archiveButton.disabled = false;
            archiveButton.textContent = error.message;
        }
    });

    actions.append(applicationsButton, editButton, archiveButton);
    footer.append(actions);
    card.append(header, tags, footer);
    return card;
}

async function loadPostings() {
    const data = await api("/jobs");
    postings = data.jobs;
    pageStatus.hidden = true;
    dashboard.hidden = false;
    renderPostings();
}

function openPostingDialog(job) {
    editingId = job ? job.id : null;
    postingForm.reset();
    postingError.textContent = "";
    document.getElementById("posting-dialog-title").textContent = job ? "Edit posting" : "New posting";
    if (job) {
        ["title", "company", "location", "category", "employmentType", "salary", "description", "requirements"].forEach(function (name) {
            postingForm.elements[name].value = job[name];
        });
    }
    dialog.showModal();
}

postingForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(postingForm));
    postingError.textContent = "";
    if (["title", "company", "location", "category", "description"].some(function (name) { return !body[name].trim(); })) {
        postingError.textContent = "Please fill in the title, company, location, category and description.";
        return;
    }
    postingSave.disabled = true;
    try {
        await api(editingId ? "/jobs/" + editingId : "/jobs", { method: editingId ? "PUT" : "POST", body: body });
        dialog.close();
        if (!editingId) view = "active";
        await loadPostings();
        if (selectedJobId) await loadApplications();
    } catch (error) {
        postingError.textContent = error.message;
    } finally {
        postingSave.disabled = false;
    }
});

document.getElementById("posting-cancel").addEventListener("click", function () { dialog.close(); });
document.getElementById("new-posting").addEventListener("click", function () { openPostingDialog(null); });
document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
        view = tab.dataset.view;
        renderPostings();
    });
});

// ---------- Applications ----------

function openApplications(jobId) {
    selectedJobId = jobId;
    filterForm.reset();
    renderPostings();
    applicationsSection.hidden = false;
    loadApplications().then(function () {
        applicationsHeading.focus();
        applicationsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });
}

async function loadApplications() {
    const params = new URLSearchParams();
    new FormData(filterForm).forEach(function (value, name) {
        if (value) params.set(name, value);
    });
    const filtered = params.size > 0;
    applicationsStatus.hidden = true;
    try {
        const data = await api("/jobs/" + selectedJobId + "/applications" + (filtered ? "?" + params : ""));
        applicationsJob.textContent = data.job.title + " · " + data.job.company;
        const count = data.applications.length;
        applicationsCount.textContent = count + (count === 1 ? " application" : " applications");
        applicationList.replaceChildren(...data.applications.map(renderApplication));
        if (!count) {
            applicationsStatus.hidden = false;
            applicationsStatus.textContent = filtered
                ? "No applications match these filters."
                : "No one has applied to this posting yet.";
        }
    } catch (error) {
        applicationList.replaceChildren();
        applicationsCount.textContent = "";
        applicationsStatus.hidden = false;
        applicationsStatus.textContent = error.message;
    }
}

function renderApplication(application) {
    const card = element("li", "job-card application-card");
    const name = application.firstName ? application.firstName + " " + application.lastName : application.email;

    const header = element("div", "job-card-header");
    const heading = element("div");
    heading.append(element("h3", "", name));
    if (application.headline) heading.append(element("p", "job-company", application.headline));
    header.append(heading, element("span", "job-type", "Applied " + formatDate(application.appliedAt)));

    const tags = element("div", "job-tags");
    const email = element("a", "job-tag", application.email);
    email.href = "mailto:" + application.email;
    tags.append(email);
    if (application.phone) tags.append(element("span", "job-tag", application.phone));
    if (application.location) tags.append(element("span", "job-tag", application.location));

    const letter = element("p", "cover-letter", application.coverLetter || "No cover letter provided.");
    if (!application.coverLetter) letter.classList.add("muted");

    const footer = element("div", "job-card-footer");
    const label = element("label", "status-label", "Status");
    const select = element("select", "status-select");
    select.id = "status-" + application.id;
    label.htmlFor = select.id;
    STATUSES.forEach(function (status) { select.append(new Option(status, status)); });
    select.value = application.status;
    const feedback = element("span", "status-feedback");
    feedback.setAttribute("role", "status");

    select.addEventListener("change", async function () {
        select.disabled = true;
        feedback.textContent = "Saving…";
        try {
            const data = await api("/applications/" + application.id + "/status", { method: "PATCH", body: { status: select.value } });
            application.status = data.application.status;
            feedback.textContent = "Saved";
            // Refresh the per-status counts on the posting cards.
            loadPostings().catch(function () {});
        } catch (error) {
            select.value = application.status;
            feedback.textContent = error.message;
        } finally {
            select.disabled = false;
        }
    });

    const control = element("div", "status-control");
    control.append(label, select, feedback);
    footer.append(control);
    card.append(header, tags, letter, footer);
    return card;
}

STATUSES.forEach(function (status) { filterStatus.append(new Option(status, status)); });
filterForm.addEventListener("submit", function (event) {
    event.preventDefault();
    loadApplications();
});
document.getElementById("clear-filters").addEventListener("click", function () {
    filterForm.reset();
    loadApplications();
});

// ---------- Start ----------

if (!sessionStorage.getItem(TOKEN_KEY)) {
    showPageMessage("Please log in with a recruiter account to manage postings.", { label: "Log in", href: "login.html" });
} else {
    pageStatus.hidden = false;
    pageStatus.textContent = "Loading your postings…";
    loadPostings().catch(function (error) {
        if (dashboard.hidden && pageStatus.querySelector("a")) return; // 401/403 message already shown
        showPageMessage(error.message);
    });
}
