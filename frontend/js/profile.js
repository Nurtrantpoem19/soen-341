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

// Temporary: the backend identifies users with the x-demo-user-id header until real auth exists.
const demoUserId = localStorage.getItem("demoUserId");

let profileExists = false;

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
}

function fillForm(profile) {
    firstNameInput.value = profile.firstName || "";
    lastNameInput.value = profile.lastName || "";
    headlineInput.value = profile.headline || "";
    phoneInput.value = profile.phone || "";
    locationInput.value = profile.location || "";
    updateSummary();
}

async function loadProfile() {
    if (!demoUserId) {
        showMessage("Please log in to view your profile.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/me`, {
            headers: { "x-demo-user-id": demoUserId }
        });

        if (response.status === 404) {
            showMessage("Complete your profile to start applying to jobs.", true);
            return;
        }

        const data = await response.json();

        if (!response.ok) {
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

    if (!demoUserId) {
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
                "x-demo-user-id": demoUserId
            },
            body: JSON.stringify(profile)
        });

        const data = await response.json();

        if (!response.ok) {
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

loadProfile();
