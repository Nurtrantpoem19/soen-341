const API_BASE = "http://localhost:3000/api/recruiter";
const token = sessionStorage.getItem("careerconnect_token") || localStorage.getItem("careerconnect_token");

const authWarning = document.getElementById("auth-warning");
const dashboardContent = document.getElementById("dashboard-content");
const statusBanner = document.getElementById("status-banner");

const jobForm = document.getElementById("job-form");
const formTitle = document.getElementById("form-title");
const editJobIdInput = document.getElementById("edit-job-id");
const saveJobBtn = document.getElementById("save-job-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");

const postingStateFilter = document.getElementById("posting-state-filter");
const postingsList = document.getElementById("postings-list");

const applicationsPanel = document.getElementById("applications-panel");
const selectedJobHeading = document.getElementById("selected-job-heading");
const selectedJobMeta = document.getElementById("selected-job-meta");
const closeApplicationsBtn = document.getElementById("close-applications-btn");
const applicantFilterForm = document.getElementById("applicant-filter-form");
const clearFiltersBtn = document.getElementById("clear-filters-btn");
const applicationsList = document.getElementById("applications-list");

let currentPostings = [];
let activeJobId = null;

function showBanner(message, isError = false) {
  statusBanner.textContent = message;
  statusBanner.className = `alert ${isError ? "alert-error" : "alert-success"}`;
  statusBanner.classList.remove("hidden");
  setTimeout(() => {
    statusBanner.classList.add("hidden");
  }, 4000);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Request failed.");
  }
  return data;
}

function resetJobForm() {
  jobForm.reset();
  editJobIdInput.value = "";
  formTitle.textContent = "Create Job Posting";
  saveJobBtn.textContent = "Publish Posting";
  cancelEditBtn.classList.add("hidden");
}

function populateEditForm(job) {
  editJobIdInput.value = String(job.id);
  document.getElementById("job-title").value = job.title;
  document.getElementById("job-company").value = job.company;
  document.getElementById("job-location").value = job.location;
  document.getElementById("job-category").value = job.category;
  document.getElementById("job-type").value = job.employmentType;
  document.getElementById("job-salary").value = job.salary || "";
  document.getElementById("job-description").value = job.description;
  document.getElementById("job-requirements").value = job.requirements || "";

  formTitle.textContent = `Edit Posting #${job.id}`;
  saveJobBtn.textContent = "Save Changes";
  cancelEditBtn.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderPostings(jobs) {
  postingsList.innerHTML = "";

  if (!jobs.length) {
    postingsList.innerHTML = '<p class="muted-text">No job postings found. Use the form to create your first posting.</p>';
    return;
  }

  jobs.forEach(job => {
    const item = document.createElement("div");
    item.className = "posting-item";

    const top = document.createElement("div");
    top.className = "posting-top";

    const titleEl = document.createElement("h3");
    titleEl.className = "posting-title";
    titleEl.textContent = `${job.title} — ${job.company}`;

    const badges = document.createElement("div");
    const stateBadge = document.createElement("span");
    stateBadge.className = `badge ${job.isOpen ? "badge-open" : "badge-archived"}`;
    stateBadge.textContent = job.isOpen ? "Open" : "Archived";

    const countBadge = document.createElement("span");
    countBadge.className = "badge badge-count";
    countBadge.style.marginLeft = "0.4rem";
    countBadge.textContent = `${job.applicationCount || 0} Applicant(s)`;

    badges.append(stateBadge, countBadge);
    top.append(titleEl, badges);

    const meta = document.createElement("p");
    meta.className = "posting-meta";
    meta.textContent = `${job.location} • ${job.category} • ${job.employmentType}${job.salary ? ` • ${job.salary}` : ""}`;

    const actions = document.createElement("div");
    actions.className = "posting-actions";

    const viewAppsBtn = document.createElement("button");
    viewAppsBtn.type = "button";
    viewAppsBtn.className = "btn btn-primary btn-sm";
    viewAppsBtn.textContent = `Review Applicants (${job.applicationCount || 0})`;
    viewAppsBtn.addEventListener("click", () => {
      activeJobId = job.id;
      applicantFilterForm.reset();
      loadApplications(job.id);
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-secondary btn-sm";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => populateEditForm(job));

    const archiveBtn = document.createElement("button");
    archiveBtn.type = "button";
    archiveBtn.className = "btn btn-warning btn-sm";
    archiveBtn.textContent = job.isOpen ? "Archive" : "Restore";
    archiveBtn.addEventListener("click", () => toggleArchivePosting(job.id, !job.isOpen));

    actions.append(viewAppsBtn, editBtn, archiveBtn);
    item.append(top, meta, actions);
    postingsList.appendChild(item);
  });
}

async function loadPostings() {
  try {
    const state = postingStateFilter.value;
    const query = state ? `?state=${encodeURIComponent(state)}` : "";
    const data = await apiRequest(`/jobs${query}`);
    currentPostings = data.jobs || [];
    renderPostings(currentPostings);
  } catch (error) {
    showBanner(error.message, true);
  }
}

async function toggleArchivePosting(jobId, isOpen) {
  try {
    const data = await apiRequest(`/jobs/${jobId}/archive`, {
      method: "PATCH",
      body: JSON.stringify({ isOpen })
    });
    showBanner(data.message);
    await loadPostings();
  } catch (error) {
    showBanner(error.message, true);
  }
}

function renderApplications(job, applications) {
  applicationsPanel.classList.remove("hidden");
  selectedJobHeading.textContent = `Applicants for: ${job.title}`;
  selectedJobMeta.textContent = `${job.company} • ${applications.length} matching application(s)`;
  applicationsList.innerHTML = "";

  if (!applications.length) {
    applicationsList.innerHTML = '<p class="muted-text">No applications match the selected filters.</p>';
    return;
  }

  applications.forEach(app => {
    const card = document.createElement("div");
    card.className = "application-card";

    const header = document.createElement("div");
    header.className = "candidate-header";

    const fullName = [app.firstName, app.lastName].filter(Boolean).join(" ") || app.candidateEmail;
    const nameEl = document.createElement("h4");
    nameEl.className = "candidate-name";
    nameEl.textContent = fullName;

    const statusBadge = document.createElement("span");
    statusBadge.className = "badge badge-count";
    statusBadge.textContent = app.status;

    header.append(nameEl, statusBadge);

    const details = document.createElement("p");
    details.className = "candidate-info";
    const appliedDate = new Date(app.appliedAt).toLocaleDateString();
    details.textContent = `Email: ${app.candidateEmail}${app.phone ? ` • Phone: ${app.phone}` : ""}${app.candidateLocation ? ` • ${app.candidateLocation}` : ""} • Applied: ${appliedDate}`;

    card.append(header, details);

    if (app.headline) {
      const headlineEl = document.createElement("p");
      headlineEl.className = "candidate-info";
      headlineEl.textContent = `Headline: ${app.headline}`;
      card.appendChild(headlineEl);
    }

    if (app.coverLetter) {
      const coverBox = document.createElement("div");
      coverBox.className = "cover-letter-box";
      coverBox.textContent = app.coverLetter;
      card.appendChild(coverBox);
    }

    const controls = document.createElement("div");
    controls.className = "status-controls";

    const select = document.createElement("select");
    ["Applied", "Under Review", "Interview", "Offered", "Rejected"].forEach(statusOption => {
      const option = document.createElement("option");
      option.value = statusOption;
      option.textContent = statusOption;
      if (statusOption === app.status) option.selected = true;
      select.appendChild(option);
    });

    const updateBtn = document.createElement("button");
    updateBtn.type = "button";
    updateBtn.className = "btn btn-primary btn-sm";
    updateBtn.textContent = "Update Status";
    updateBtn.addEventListener("click", async () => {
      try {
        await apiRequest(`/jobs/${job.id}/applications/${app.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: select.value })
        });
        showBanner(`Updated ${fullName}'s status to ${select.value}.`);
        await loadApplications(job.id);
      } catch (error) {
        showBanner(error.message, true);
      }
    });

    controls.append(select, updateBtn);
    card.appendChild(controls);
    applicationsList.appendChild(card);
  });
}

async function loadApplications(jobId) {
  try {
    const params = new URLSearchParams();
    const status = document.getElementById("filter-status").value;
    const fromDate = document.getElementById("filter-from-date").value;
    const toDate = document.getElementById("filter-to-date").value;

    if (status) params.set("status", status);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", `${toDate}T23:59:59.999Z`);

    const queryString = params.toString() ? `?${params.toString()}` : "";
    const data = await apiRequest(`/jobs/${jobId}/applications${queryString}`);
    renderApplications(data.job, data.applications || []);
  } catch (error) {
    showBanner(error.message, true);
  }
}

if (!token) {
  authWarning.classList.remove("hidden");
  dashboardContent.classList.add("hidden");
} else {
  loadPostings();

  jobForm.addEventListener("submit", async event => {
    event.preventDefault();

    const payload = {
      title: document.getElementById("job-title").value.trim(),
      company: document.getElementById("job-company").value.trim(),
      location: document.getElementById("job-location").value.trim(),
      category: document.getElementById("job-category").value.trim(),
      employmentType: document.getElementById("job-type").value,
      salary: document.getElementById("job-salary").value.trim(),
      description: document.getElementById("job-description").value.trim(),
      requirements: document.getElementById("job-requirements").value.trim()
    };

    const editId = editJobIdInput.value;

    try {
      saveJobBtn.disabled = true;
      if (editId) {
        const data = await apiRequest(`/jobs/${editId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        showBanner(data.message);
      } else {
        const data = await apiRequest("/jobs", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        showBanner(data.message);
      }
      resetJobForm();
      await loadPostings();
    } catch (error) {
      showBanner(error.message, true);
    } finally {
      saveJobBtn.disabled = false;
    }
  });

  cancelEditBtn.addEventListener("click", resetJobForm);
  postingStateFilter.addEventListener("change", loadPostings);

  applicantFilterForm.addEventListener("submit", event => {
    event.preventDefault();
    if (activeJobId) loadApplications(activeJobId);
  });

  clearFiltersBtn.addEventListener("click", () => {
    applicantFilterForm.reset();
    if (activeJobId) loadApplications(activeJobId);
  });

  closeApplicationsBtn.addEventListener("click", () => {
    applicationsPanel.classList.add("hidden");
    activeJobId = null;
  });
}