const API_URL = "http://localhost:3000/api/profile";

const profileForm = document.getElementById("profile-form");
const firstNameInput = document.getElementById("first-name");
const lastNameInput = document.getElementById("last-name");
const headlineInput = document.getElementById("headline");
const phoneInput = document.getElementById("phone");
const locationInput = document.getElementById("location");
const errorMessage = document.getElementById("error-message");
const profileButton = document.getElementById("profile-button");

const summaryInitials = document.getElementById("profile-initials");
const summaryName = document.getElementById("summary-name");
const summaryHeadline = document.getElementById("summary-headline");
const summaryLocation = document.getElementById("summary-location");
const pictureInitials = document.getElementById("picture-initials");
const pictureFileInput = document.getElementById("picture-file");
const picturePreview = document.getElementById("picture-preview");
const pictureStatus = document.getElementById("picture-status");
const clearPictureButton = document.getElementById("clear-picture");
const bioInput = document.getElementById("bio-preview");
const bioCount = document.getElementById("bio-count");
const educationEntries = document.getElementById("education-entries");
const experienceEntries = document.getElementById("experience-entries");
const professionalLinks = document.getElementById("professional-links");

const TOKEN_KEY = "careerconnect_token";

let profileExists = false;
let profilePictureUrl = null;
let pictureSelectionId = 0;
let entryId = 0;

function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
}

function handleUnauthorized(response) {
    if (response.status !== 401) {
        return false;
    }

    sessionStorage.removeItem(TOKEN_KEY);
    return true;
}

function showMessage(text, isSuccess = false) {
    errorMessage.textContent = text;
    errorMessage.classList.toggle("success", isSuccess);
}

function updateSummary() {
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const headline = headlineInput.value.trim();
    const location = locationInput.value.trim();

    const initials = (firstName.charAt(0) + lastName.charAt(0)) || "?";

    summaryInitials.textContent = initials;
    summaryName.textContent = `${firstName} ${lastName}`.trim() || "Your Name";
    summaryHeadline.textContent =
        headline || "Add a headline to stand out to recruiters";
    summaryLocation.textContent = location;
    pictureInitials.textContent = initials;
}

function fillForm(profile) {
    firstNameInput.value = profile.firstName || "";
    lastNameInput.value = profile.lastName || "";
    headlineInput.value = profile.headline || "";
    phoneInput.value = profile.phone || "";
    locationInput.value = profile.location || "";
    updateSummary();
}

function validateProfileUrl(value, allowedDomain) {
    let url;

    try {
        url = new URL(value.trim());
    } catch (error) {
        return null;
    }

    const hostname = url.hostname.toLowerCase();
    const isAllowedHost =
        hostname === allowedDomain || hostname.endsWith(`.${allowedDomain}`);

    if (
        url.protocol !== "https:" ||
        !isAllowedHost ||
        url.username ||
        url.password ||
        (url.port && url.port !== "443")
    ) {
        return null;
    }

    return url;
}

function updateProfessionalLink(inputId, statusId, label, domain) {
    const input = document.getElementById(inputId);
    const status = document.getElementById(statusId);
    const value = input.value.trim();
    const existing = professionalLinks.querySelector(`[data-link="${label}"]`);
    if (existing) {
        existing.remove();
    }

    if (!value) {
        status.textContent = "";
        return;
    }

    const url = validateProfileUrl(value, domain);
    if (!url) {
        status.textContent = `Enter a valid HTTPS ${label} profile URL.`;
        return;
    }

    status.textContent = "";
    const link = document.createElement("a");
    link.className = "preview-link";
    link.dataset.link = label;
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `Preview ${label} profile`;
    professionalLinks.append(link);
}

function createField(labelText, type, options = {}) {
    const wrapper = document.createElement("div");
    const inputId = `preview-field-${++entryId}`;
    const label = document.createElement("label");
    const input = document.createElement(type === "textarea" ? "textarea" : "input");

    label.htmlFor = inputId;
    label.textContent = labelText;
    input.id = inputId;
    if (type !== "textarea") {
        input.type = type;
    }
    if (options.maxLength) {
        input.maxLength = options.maxLength;
    }
    if (options.min) {
        input.min = options.min;
    }
    if (options.max) {
        input.max = options.max;
    }
    if (options.placeholder) {
        input.placeholder = options.placeholder;
    }

    wrapper.append(label, input);
    return { wrapper, input };
}

function createEntryHeader(entry, label) {
    const header = document.createElement("div");
    header.className = "entry-card-header";

    const removeButton = document.createElement("button");
    removeButton.className = "remove-entry";
    removeButton.type = "button";
    removeButton.textContent = `Remove ${label}`;
    removeButton.addEventListener("click", function () {
        entry.remove();
    });

    header.append(removeButton);
    return header;
}

function createEducationEntry() {
    const entry = document.createElement("div");
    entry.className = "entry-card education-entry";
    entry.append(createEntryHeader(entry, "education entry"));

    const firstRow = document.createElement("div");
    firstRow.className = "form-row";
    firstRow.append(
        createField("Institution", "text", { maxLength: 200, placeholder: "School or university" }).wrapper,
        createField("Degree", "text", { maxLength: 150, placeholder: "e.g. Bachelor's degree" }).wrapper
    );

    const secondRow = document.createElement("div");
    secondRow.className = "form-row";
    secondRow.append(
        createField("Field of study", "text", { maxLength: 150, placeholder: "e.g. Computer Science" }).wrapper,
        createField("Graduation year", "number", {
            min: 1900,
            max: new Date().getFullYear() + 20,
            placeholder: "e.g. 2027"
        }).wrapper
    );

    entry.append(firstRow, secondRow);
    educationEntries.append(entry);
}

function createExperienceEntry() {
    const entry = document.createElement("div");
    entry.className = "entry-card experience-entry";
    entry.append(createEntryHeader(entry, "experience entry"));

    const firstRow = document.createElement("div");
    firstRow.className = "form-row";
    firstRow.append(
        createField("Employer", "text", { maxLength: 200, placeholder: "Company or organization" }).wrapper,
        createField("Job title", "text", { maxLength: 200, placeholder: "Your role" }).wrapper
    );

    const dateRow = document.createElement("div");
    dateRow.className = "form-row";
    const startDate = createField("Start date", "date");
    const endDate = createField("End date", "date");
    dateRow.append(startDate.wrapper, endDate.wrapper);

    const currentLabel = document.createElement("label");
    currentLabel.className = "current-position";
    const currentCheckbox = document.createElement("input");
    currentCheckbox.type = "checkbox";
    const currentText = document.createElement("span");
    currentText.textContent = "I currently work here";
    currentLabel.append(currentCheckbox, currentText);
    currentCheckbox.addEventListener("change", function () {
        endDate.input.disabled = currentCheckbox.checked;
    });

    const description = createField("Description", "textarea", {
        maxLength: 2000,
        placeholder: "Describe your responsibilities and contributions."
    });

    entry.append(firstRow, dateRow, currentLabel, description.wrapper);
    experienceEntries.append(entry);
}

function clearPicturePreview() {
    pictureSelectionId += 1;
    if (profilePictureUrl) {
        URL.revokeObjectURL(profilePictureUrl);
        profilePictureUrl = null;
    }

    pictureFileInput.value = "";
    picturePreview.removeAttribute("src");
    picturePreview.hidden = true;
    clearPictureButton.disabled = true;
    pictureStatus.textContent = "";
}

async function loadProfile() {
    const token = getToken();
    if (!token) {
        showMessage("Please log in to view your profile.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.status === 404) {
            showMessage("Complete your profile to start applying to jobs.", true);
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

[firstNameInput, lastNameInput, headlineInput, locationInput].forEach(function (input) {
    input.addEventListener("input", updateSummary);
});

profileForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const profile = {
        firstName: firstNameInput.value.trim(),
        lastName: lastNameInput.value.trim(),
        phone: phoneInput.value.trim(),
        location: locationInput.value.trim(),
        headline: headlineInput.value.trim()
    };

    showMessage("");

    if (Object.values(profile).some(function (value) { return value === ""; })) {
        showMessage("Please complete all fields.");
        return;
    }

    const token = getToken();
    if (!token) {
        showMessage("Please log in to save your profile.");
        return;
    }

    profileButton.textContent = "Saving...";
    profileButton.disabled = true;

    try {
        const response = await fetch(profileExists ? `${API_URL}/me` : API_URL, {
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

pictureFileInput.addEventListener("change", function () {
    const file = pictureFileInput.files && pictureFileInput.files[0];
    pictureStatus.textContent = "";
    if (!file) {
        return;
    }

    const extension = file.name.match(/\.(jpe?g|png)$/i);
    const expectedMime = extension && extension[1].toLowerCase() === "png"
        ? "image/png"
        : "image/jpeg";
    if (!extension || (file.type && file.type !== expectedMime)) {
        clearPicturePreview();
        pictureStatus.textContent = "Choose a JPG or PNG image.";
        return;
    }

    if (!file.size || file.size > 5 * 1024 * 1024) {
        clearPicturePreview();
        pictureStatus.textContent = "Choose an image larger than 0 bytes and no larger than 5 MB.";
        return;
    }

    if (profilePictureUrl) {
        URL.revokeObjectURL(profilePictureUrl);
    }

    const selectionId = ++pictureSelectionId;
    profilePictureUrl = URL.createObjectURL(file);
    picturePreview.hidden = false;
    picturePreview.src = profilePictureUrl;
    clearPictureButton.disabled = false;

    picturePreview.onload = function () {
        if (selectionId !== pictureSelectionId) {
            return;
        }

        const pixelCount = picturePreview.naturalWidth * picturePreview.naturalHeight;
        if (
            !picturePreview.naturalWidth ||
            picturePreview.naturalWidth > 8000 ||
            picturePreview.naturalHeight > 8000 ||
            pixelCount > 32000000
        ) {
            clearPicturePreview();
            pictureStatus.textContent = "This image's dimensions are too large to preview.";
        }
    };

    picturePreview.onerror = function () {
        if (selectionId !== pictureSelectionId) {
            return;
        }

        clearPicturePreview();
        pictureStatus.textContent = "This file could not be displayed as an image.";
    };
});

clearPictureButton.addEventListener("click", clearPicturePreview);

bioInput.addEventListener("input", function () {
    bioCount.textContent = String(bioInput.value.length);
});

document.getElementById("linkedin-url").addEventListener("input", function () {
    updateProfessionalLink("linkedin-url", "linkedin-status", "LinkedIn", "linkedin.com");
});

document.getElementById("github-url").addEventListener("input", function () {
    updateProfessionalLink("github-url", "github-status", "GitHub", "github.com");
});

document.getElementById("add-education").addEventListener("click", createEducationEntry);
document.getElementById("add-experience").addEventListener("click", createExperienceEntry);

createEducationEntry();
createExperienceEntry();

window.addEventListener("beforeunload", function () {
    if (profilePictureUrl) {
        URL.revokeObjectURL(profilePictureUrl);
    }
});

loadProfile();
