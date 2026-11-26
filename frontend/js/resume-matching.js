(function () {
    const API = "http://localhost:3000/api/resume-matches";
    const TOKEN = "careerconnect_token";
    const form = document.getElementById("matching-form");
    if (!form) return;
    const resume = document.getElementById("matching-resume");
    const url = document.getElementById("matching-url");
    const description = document.getElementById("matching-description");
    const resumeText = document.getElementById("matching-resume-text");
    const button = document.getElementById("matching-button");
    const status = document.getElementById("matching-status");
    const result = document.getElementById("matching-result");
    const categories = document.getElementById("matching-categories");
    const names = { keywords: "Keywords", hardSkills: "Hard skills", softSkills: "Soft skills" };

    document.addEventListener("resumes:loaded", function (event) {
        const resumes = event.detail || [];
        resume.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = resumes.length ? "Choose a resume" : "Upload a resume first";
        resume.append(placeholder);
        resumes.forEach(function (item) {
            const option = document.createElement("option");
            option.value = item.id;
            option.textContent = item.original_name;
            resume.append(option);
        });
    });

    function renderGroup(title, entries) {
        const section = document.createElement("section");
        section.className = "feedback-section";
        const heading = document.createElement("h3");
        heading.textContent = title;
        const list = document.createElement("ul");
        if (!entries.length) {
            const empty = document.createElement("li");
            empty.className = "empty";
            empty.textContent = "None identified";
            list.append(empty);
        } else entries.forEach(function (entry) {
            const item = document.createElement("li");
            item.textContent = entry;
            list.append(item);
        });
        section.append(heading, list);
        return section;
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        status.textContent = "";
        const token = sessionStorage.getItem(TOKEN);
        if (!token) { status.textContent = "Please log in to analyze a resume."; return; }
        const pastedResume = resumeText.value.trim();
        if (Boolean(resume.value) === Boolean(pastedResume)) { status.textContent = "Select a saved resume or paste your profile/resume text."; return; }
        const postingUrl = url.value.trim();
        const postingText = description.value.trim();
        if (Boolean(postingUrl) === Boolean(postingText)) {
            status.textContent = "Provide a job posting URL or paste its description.";
            return;
        }
        button.disabled = true;
        button.textContent = "Analyzing...";
        status.textContent = "Comparing your resume with the job posting...";
        status.dataset.state = "info";
        result.hidden = true;
        try {
            const response = await fetch(API, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...(resume.value ? { resumeId: resume.value } : { resumeText: pastedResume }), ...(postingUrl ? { url: postingUrl } : { description: postingText }) })
            });
            const data = await response.json();
            if (response.status === 401) {
                sessionStorage.removeItem(TOKEN);
                throw new Error("Your session has expired. Please log in again.");
            }
            if (!response.ok) throw new Error(data.message || "Unable to analyze this match.");
            document.getElementById("compatibility-score").textContent = data.score;
            document.getElementById("compatibility-badge").dataset.level = data.score >= 70 ? "high" : data.score < 50 ? "low" : "";
            categories.replaceChildren();
            Object.entries(names).forEach(function ([key, label]) {
                categories.append(renderGroup(`Matched ${label}`, data.matched[key] || []));
                categories.append(renderGroup(`Missing ${label}`, data.missing[key] || []));
            });
            result.hidden = false;
            status.textContent = "Compatibility analysis complete.";
            status.dataset.state = "success";
        } catch (error) {
            status.textContent = error.message || "Unable to connect. Please try again.";
            status.dataset.state = "error";
        } finally {
            button.disabled = false;
            button.textContent = "Analyze compatibility";
        }
    });
}());
