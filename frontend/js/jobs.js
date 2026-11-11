const API_URL = "http://localhost:3000/api/jobs";
const FILTER_NAMES = ["q", "location", "category", "type"];

const searchForm = document.getElementById("search-form");
const keywordInput = document.getElementById("keyword");
const locationInput = document.getElementById("location");
const categorySelect = document.getElementById("category");
const typeSelect = document.getElementById("type");
const searchButton = document.getElementById("search-button");
const clearButton = document.getElementById("clear-filters");
const resultsCount = document.getElementById("results-count");
const searchStatus = document.getElementById("search-status");
const jobList = document.getElementById("job-list");

const fields = { q: keywordInput, location: locationInput, category: categorySelect, type: typeSelect };

// Each search gets a number so a slow, older response never replaces newer results.
let latestSearch = 0;

function formatDate(value) {
    return new Date(value).toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function showStatus(message) {
    searchStatus.textContent = message;
    searchStatus.hidden = message === "";
}

function addOptions(select, values) {
    values.forEach(function (value) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.append(option);
    });
}

function readFilters() {
    const filters = {};
    FILTER_NAMES.forEach(function (name) {
        const value = fields[name].value.trim();
        if (value) {
            filters[name] = value;
        }
    });
    return filters;
}

// Keeps the current search in the address bar so it can be shared, reloaded, or returned to from a job page.
function syncAddressBar(filters) {
    const query = new URLSearchParams(filters).toString();
    history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

function createTag(text, className = "job-tag") {
    const tag = document.createElement("span");
    tag.className = className;
    tag.textContent = text;
    return tag;
}

function createJobCard(job) {
    const item = document.createElement("li");
    item.className = "job-card";

    const header = document.createElement("div");
    header.className = "job-card-header";

    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    const link = document.createElement("a");
    link.href = `job.html?id=${encodeURIComponent(job.id)}`;
    link.textContent = job.title;
    title.append(link);

    const company = document.createElement("p");
    company.className = "job-company";
    company.textContent = `${job.company} · ${job.location}`;
    titleWrap.append(title, company);

    header.append(titleWrap, createTag(job.employmentType, "job-type"));

    const description = document.createElement("p");
    description.className = "job-description";
    description.textContent = job.description;

    const tags = document.createElement("div");
    tags.className = "job-tags";
    tags.append(createTag(job.category));
    if (job.salary) {
        tags.append(createTag(job.salary));
    }

    const footer = document.createElement("div");
    footer.className = "job-card-footer";
    const posted = document.createElement("span");
    posted.className = "job-posted";
    posted.textContent = `Posted ${formatDate(job.postedAt)}`;
    const details = document.createElement("a");
    details.className = "job-details-link";
    details.href = link.href;
    details.setAttribute("aria-label", `View details for ${job.title} at ${job.company}`);
    details.innerHTML = 'View details <span aria-hidden="true">→</span>';
    footer.append(posted, details);

    item.append(header, description, tags, footer);
    return item;
}

function renderJobs(jobs, hasFilters) {
    jobList.replaceChildren(...jobs.map(createJobCard));

    if (jobs.length === 0) {
        resultsCount.textContent = "No jobs found";
        showStatus(hasFilters
            ? "No jobs match your search. Try different keywords or clear the filters."
            : "There are no job opportunities available right now. Please check back soon.");
        return;
    }

    resultsCount.textContent = jobs.length === 1 ? "1 job found" : `${jobs.length} jobs found`;
    showStatus("");
}

async function searchJobs() {
    const filters = readFilters();
    const searchNumber = ++latestSearch;
    syncAddressBar(filters);

    searchButton.disabled = true;
    searchButton.textContent = "Searching...";
    resultsCount.textContent = "Searching...";

    try {
        const query = new URLSearchParams(filters).toString();
        const response = await fetch(query ? `${API_URL}?${query}` : API_URL);
        const data = await response.json();

        if (searchNumber !== latestSearch) {
            return;
        }

        if (!response.ok) {
            jobList.replaceChildren();
            resultsCount.textContent = "";
            showStatus(data.message || "Unable to search jobs. Please try again.");
            return;
        }

        renderJobs(data.jobs, Object.keys(filters).length > 0);
    } catch (error) {
        if (searchNumber !== latestSearch) {
            return;
        }
        jobList.replaceChildren();
        resultsCount.textContent = "";
        showStatus("Unable to connect to the server. Please try again.");
    } finally {
        if (searchNumber === latestSearch) {
            searchButton.disabled = false;
            searchButton.textContent = "Search jobs";
        }
    }
}

async function loadFilterOptions() {
    try {
        const response = await fetch(`${API_URL}/categories`);
        if (!response.ok) {
            return;
        }
        const data = await response.json();
        addOptions(categorySelect, data.categories);
        addOptions(typeSelect, data.employmentTypes);
    } catch (error) {
        // The search itself reports connection problems.
    }
}

searchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    searchJobs();
});

[categorySelect, typeSelect].forEach(function (select) {
    select.addEventListener("change", searchJobs);
});

clearButton.addEventListener("click", function () {
    FILTER_NAMES.forEach(function (name) {
        fields[name].value = "";
    });
    keywordInput.focus();
    searchJobs();
});

async function init() {
    await loadFilterOptions();

    const params = new URLSearchParams(window.location.search);
    FILTER_NAMES.forEach(function (name) {
        const value = params.get(name);
        if (value) {
            fields[name].value = value;
        }
    });

    searchJobs();
}

init();
