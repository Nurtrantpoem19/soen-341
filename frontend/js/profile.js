const API_BASE = "http://localhost:3000/api";
const PROFILE_API_URL = `${API_BASE}/profile`;
const AUTH_ME_URL = `${API_BASE}/auth/me`;
const LOGOUT_URL = `${API_BASE}/auth/logout`;
const RESUMES_API_URL = `${API_BASE}/resumes`;
const INTERVIEW_API_URL = `${API_BASE}/applications/me/interviews`;

const TOKEN_KEY = "careerconnect_token";
const ROLE_KEY = "careerconnect_role";

const profileForm = document.getElementById("profile-form");
const firstNameInput = document.getElementById("first-name");
const lastNameInput = document.getElementById("last-name");
const companyField = document.getElementById("company-field");
const companyInput = document.getElementById("company");
const headlineLabel = document.getElementById("headline-label");
const headlineInput = document.getElementById("headline");
const skillsField = document.getElementById("skills-field");
const skillsInput = document.getElementById("skills");
const phoneInput = document.getElementById("phone");
const locationInput = document.getElementById("location");
const summaryInput = document.getElementById("summary");
const summaryCount = document.getElementById("summary-count");
const errorMessage = document.getElementById("error-message");
const loginPrompt = document.getElementById("login-prompt");
const profileButton = document.getElementById("profile-button");

const pageTitle = document.getElementById("profile-page-title");
const savedProfileSubtitle = document.getElementById("saved-profile-subtitle");
const summaryInitials = document.getElementById("profile-initials");
const summaryName = document.getElementById("summary-name");
const summaryRole = document.getElementById("summary-role");
const summaryHeadline = document.getElementById("summary-headline");
const summaryCompany = document.getElementById("summary-company");
const summaryLocation = document.getElementById("summary-location");
const summaryEmail = document.getElementById("summary-email");

const recruiterNavLink = document.getElementById("recruiter-nav-link");
const resumeNavLink = document.getElementById("resume-nav-link");
const logoutButton = document.getElementById("logout-button");
const resumesSection = document.getElementById("resumes-section");
const interviewsSection = document.getElementById("interviews");
const seekerFooterLink = document.getElementById("seeker-footer-link");
const recruiterFooterLink = document.getElementById("recruiter-footer-link");

let profileExists = false;
let currentRole = sessionStorage.getItem(ROLE_KEY) === "recruiter" ? "recruiter" : "job_seeker";

function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
}

function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ROLE_KEY);
}

function handleUnauthorized(response) {
    if (response.status !== 401) {
        return false;
    }

    clearSession();
    loginPrompt.hidden = false;
    logoutButton.hidden = true;
    return true;
}

function showMessage(text, isSuccess = false) {
    errorMessage.textContent = text;
    errorMessage.classList.toggle("success", isSuccess);
}

function updateSummaryCount() {
    summaryCount.textContent = String(summaryInput.value.length);
}

function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function applyRoleLayout(role, email) {
    const isRecruiter = role === "recruiter";
    currentRole = isRecruiter ? "recruiter" : "job_seeker";
    sessionStorage.setItem(ROLE_KEY, currentRole);

    pageTitle.textContent = isRecruiter ? "Recruiter Profile" : "My Profile";
    savedProfileSubtitle.textContent = isRecruiter
        ? "Share your role and company details for candidates and your team."
        : "Keep your contact details, headline, and skills up to date.";

    summaryRole.textContent = isRecruiter ? "Recruiter" : "Job Seeker";
    summaryRole.hidden = false;
    summaryEmail.textContent = email || "";

    companyField.hidden = !isRecruiter;
    companyInput.required = isRecruiter;
    skillsField.hidden = isRecruiter;
    skillsInput.required = !isRecruiter;

    headlineLabel.textContent = isRecruiter ? "Role / Title" : "Headline";
    headlineInput.placeholder = isRecruiter
        ? "e.g. Technical Recruiter"
        : "e.g. Junior Software Developer";

    resumesSection.hidden = isRecruiter;
    interviewsSection.hidden = isRecruiter;
    recruiterNavLink.hidden = !isRecruiter;
    resumeNavLink.hidden = isRecruiter;
    recruiterFooterLink.hidden = !isRecruiter;
    seekerFooterLink.hidden = isRecruiter;
    logoutButton.hidden = false;

    updateSummary();
}

function updateSummary() {
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const headline = headlineInput.value.trim();
    const company = companyInput.value.trim();
    const location = locationInput.value.trim();

    const initials = (firstName.charAt(0) + lastName.charAt(0)) || "?";

    summaryInitials.textContent = initials;
    summaryName.textContent = `${firstName} ${lastName}`.trim() || "Your Name";
    summaryHeadline.textContent =
        headline ||
        (currentRole === "recruiter"
            ? "Add your recruiting title"
            : "Add a headline to stand out to recruiters");
    summaryCompany.textContent = company ? `Company: ${company}` : "";
    summaryCompany.hidden = !company;
    summaryLocation.textContent = location;
}

function fillForm(profile) {
    firstNameInput.value = profile.firstName || "";
    lastNameInput.value = profile.lastName || "";
    companyInput.value = profile.company || "";
    headlineInput.value = profile.headline || "";
    phoneInput.value = profile.phone || "";
    locationInput.value = profile.location || "";
    summaryInput.value = profile.summary || "";
    skillsInput.value = Array.isArray(profile.skills) ? profile.skills.join(", ") : "";
    updateSummaryCount();
    updateSummary();
}

async function loadAccount() {
    const token = getToken();
    if (!token) {
        showMessage("Please log in to view your profile.");
        loginPrompt.hidden = false;
        return null;
    }

    try {
        const response = await fetch(AUTH_ME_URL, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            if (handleUnauthorized(response)) {
                showMessage("Your session has expired. Please log in again.");
                return null;
            }
            const data = await response.json();
            showMessage(data.message || "Unable to verify your account.");
            return null;
        }

        const data = await response.json();
        applyRoleLayout(data.user.role, data.user.email);
        return data.user;
    } catch (error) {
        showMessage("Unable to connect to the server. Please try again.");
        return null;
    }
}

async function loadProfile() {
    const token = getToken();
    if (!token) {
        return;
    }

    try {
        const response = await fetch(`${PROFILE_API_URL}/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.status === 404) {
            showMessage(
                currentRole === "recruiter"
                    ? "Complete your recruiter profile so your company details are saved."
                    : "Complete your profile to start applying to jobs.",
                true
            );
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            if (handleUnauthorized(response)) {
                showMessage("Your session has expired. Please log in again.");
                return;
            }
            showMessage(data.message || "Unable to load your profile.");
            return;
        }

        profileExists = true;
        fillForm(data.profile);
    } catch (error) {
        showMessage("Unable to connect to the server. Please try again.");
    }
}

async function downloadProfileResume(resume, button) {
    const token = getToken();
    if (!token) {
        return;
    }

    button.disabled = true;
    button.textContent = "Downloading...";

    try {
        const response = await fetch(`${RESUMES_API_URL}/${encodeURIComponent(resume.id)}/download`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            if (handleUnauthorized(response)) {
                showMessage("Your session has expired. Please log in again.");
                return;
            }
            const data = await response.json();
            showMessage(data.message || "Unable to download resume.");
            return;
        }

        const fileUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = fileUrl;
        link.download = resume.original_name;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(function () {
            URL.revokeObjectURL(fileUrl);
        }, 1000);
    } catch (error) {
        showMessage("Unable to download resume. Please try again.");
    } finally {
        button.textContent = "Download";
        button.disabled = false;
    }
}

function renderProfileResume(resume) {
    const item = document.createElement("li");
    item.className = "interview-item profile-resume-item";

    const details = document.createElement("div");
    const name = document.createElement("h4");
    name.textContent = resume.original_name;

    const meta = document.createElement("p");
    let metaText = formatFileSize(resume.file_size);
    if (resume.uploaded_at) {
        const uploadedAt = new Date(resume.uploaded_at);
        if (!Number.isNaN(uploadedAt.getTime())) {
            metaText += ` · Uploaded ${uploadedAt.toLocaleDateString()}`;
        }
    }
    meta.textContent = metaText;
    details.append(name, meta);

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "secondary-button";
    downloadBtn.textContent = "Download";
    downloadBtn.addEventListener("click", function () {
        downloadProfileResume(resume, downloadBtn);
    });

    item.append(details, downloadBtn);
    return item;
}

async function loadProfileResumes() {
    const status = document.getElementById("profile-resumes-status");
    const list = document.getElementById("profile-resume-list");
    const token = getToken();

    if (!token) {
        status.textContent = "Please log in to view your resumes.";
        return;
    }

    try {
        const response = await fetch(RESUMES_API_URL, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();

        if (!response.ok) {
            if (handleUnauthorized(response)) {
                status.textContent = "Your session has expired. Please log in again.";
                return;
            }
            status.textContent = data.message || "Unable to load your resumes.";
            return;
        }

        const resumes = Array.isArray(data.resumes) ? data.resumes : [];
        list.replaceChildren(...resumes.map(renderProfileResume));
        status.textContent = resumes.length
            ? ""
            : "You have not uploaded a resume yet.";
    } catch (error) {
        status.textContent = "Unable to connect to the server. Please try again.";
    }
}

function renderInterviewInvitation(invitation) {
    const item = document.createElement("li");
    item.className = "interview-item";

    const heading = document.createElement("h4");
    heading.textContent = `${invitation.jobTitle} at ${invitation.company}`;
    item.append(heading);

    const scheduledAt = new Date(invitation.scheduledAt);
    const time = document.createElement("time");
    time.dateTime = scheduledAt.toISOString();
    time.textContent = scheduledAt.toLocaleString();
    item.append(time);

    if (invitation.location) {
        const location = document.createElement("p");
        location.textContent = `Location: ${invitation.location}`;
        item.append(location);
    }

    if (invitation.meetingLink) {
        let safeMeetingUrl = null;
        try {
            const meetingUrl = new URL(invitation.meetingLink);
            if (meetingUrl.protocol === "https:" && !meetingUrl.username && !meetingUrl.password) {
                safeMeetingUrl = meetingUrl.href;
            }
        } catch (error) {
            safeMeetingUrl = null;
        }
        if (safeMeetingUrl) {
            const link = document.createElement("a");
            link.href = safeMeetingUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = "Join interview";
            item.append(link);
        } else {
            const meetingLink = document.createElement("p");
            meetingLink.textContent = `Meeting link: ${invitation.meetingLink}`;
            item.append(meetingLink);
        }
    }

    if (invitation.message) {
        const message = document.createElement("p");
        message.textContent = invitation.message;
        item.append(message);
    }

    return item;
}

async function loadInterviewInvitations() {
    const status = document.getElementById("interview-status");
    const list = document.getElementById("interview-list");
    const token = getToken();
    if (!token) {
        status.textContent = "Please log in to view your interview invitations.";
        return;
    }

    try {
        const response = await fetch(INTERVIEW_API_URL, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        if (!response.ok) {
            if (handleUnauthorized(response)) {
                status.textContent = "Your session has expired. Please log in again.";
                return;
            }
            status.textContent = data.message || "Unable to load interview invitations.";
            return;
        }

        list.replaceChildren(...data.invitations.map(renderInterviewInvitation));
        status.textContent = data.invitations.length
            ? ""
            : "You have no interview invitations yet.";
    } catch (error) {
        status.textContent = "Unable to connect to the server. Please try again.";
    }
}

[firstNameInput, lastNameInput, companyInput, headlineInput, locationInput].forEach(function (input) {
    input.addEventListener("input", updateSummary);
});

summaryInput.addEventListener("input", updateSummaryCount);

logoutButton.addEventListener("click", async function () {
    const token = getToken();
    if (token) {
        try {
            await fetch(LOGOUT_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (error) {
            // Still clear local session if request fails.
        }
    }
    clearSession();
    window.location.href = "login.html";
});

profileForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const isRecruiter = currentRole === "recruiter";
    const profile = {
        firstName: firstNameInput.value.trim(),
        lastName: lastNameInput.value.trim(),
        company: isRecruiter ? companyInput.value.trim() : "",
        phone: phoneInput.value.trim(),
        location: locationInput.value.trim(),
        headline: headlineInput.value.trim(),
        summary: summaryInput.value.trim(),
        skills: isRecruiter
            ? []
            : skillsInput.value.split(",").map(function (skill) { return skill.trim(); }).filter(Boolean)
    };

    showMessage("");

    if (
        !profile.firstName ||
        !profile.lastName ||
        !profile.phone ||
        !profile.location ||
        !profile.headline
    ) {
        showMessage("Please complete all required fields.");
        return;
    }

    if (isRecruiter && !profile.company) {
        showMessage("Please enter your company or organization.");
        return;
    }

    if (!isRecruiter && profile.skills.length === 0) {
        showMessage("Please add at least one skill.");
        return;
    }

    const token = getToken();
    if (!token) {
        showMessage("Please log in to save your profile.");
        loginPrompt.hidden = false;
        return;
    }

    profileButton.textContent = "Saving...";
    profileButton.disabled = true;

    try {
        const response = await fetch(profileExists ? `${PROFILE_API_URL}/me` : PROFILE_API_URL, {
            method: profileExists ? "PUT" : "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(profile)
        });

        const data = await response.json();

        if (!response.ok) {
            if (handleUnauthorized(response)) {
                showMessage("Your session has expired. Please log in again.");
                return;
            }
            showMessage(data.message || "Unable to save your profile.");
            return;
        }

        profileExists = true;
        fillForm(data.profile);
        showMessage("Profile saved successfully.", true);
    } catch (error) {
        showMessage("Unable to connect to the server. Please try again.");
    } finally {
        profileButton.textContent = "Save Profile";
        profileButton.disabled = false;
    }
});

async function initProfilePage() {
    const user = await loadAccount();
    if (!user) {
        return;
    }

    await loadProfile();
    if (user.role !== "recruiter") {
        loadProfileResumes();
        loadInterviewInvitations();
    }
}

initProfilePage();
