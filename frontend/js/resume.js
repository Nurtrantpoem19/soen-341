const MAX_FILE_SIZE = 5 * 1024 * 1024;
const PDF_MIME_TYPE = "application/pdf";
const RESUME_API_URL = "http://localhost:3000/api/resumes";
const TOKEN_KEY = "careerconnect_token";

const resumeForm = document.getElementById("resume-form");
const resumeInput = document.getElementById("resume-file");
const fileDetails = document.getElementById("file-details");
const fileName = document.getElementById("file-name");
const fileSize = document.getElementById("file-size");
const removeFileButton = document.getElementById("remove-file");
const uploadButton = document.getElementById("upload-button");
const uploadStatus = document.getElementById("upload-status");
const resumeList = document.getElementById("resume-list");
const resumeListStatus = document.getElementById("resume-list-status");

function showStatus(message, state = "error") {
    uploadStatus.textContent = message;
    uploadStatus.dataset.state = state;
}

function showResumeListStatus(message) {
    resumeListStatus.textContent = message;
}

function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
}

async function getResponseData(response) {
    return response.json();
}

async function handleUnauthorized(response) {
    if (response.status !== 401) {
        return;
    }

    sessionStorage.removeItem(TOKEN_KEY);
    throw new Error("Your session has expired. Please log in again.");
}

async function getErrorMessage(response, fallback) {
    await handleUnauthorized(response);
    const data = await getResponseData(response);
    return data.message || fallback;
}

function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(0)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function validateFile(file) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
        return "Choose a PDF file. Other file types are not supported.";
    }

    if (file.type && file.type.toLowerCase() !== PDF_MIME_TYPE) {
        return "This file is not identified as a PDF. Choose a valid PDF file.";
    }

    if (file.size === 0) {
        return "This file is empty. Choose a PDF that contains content.";
    }

    if (file.size > MAX_FILE_SIZE) {
        return "This file is larger than 5 MB. Choose a smaller PDF.";
    }

    return "";
}

function renderResumes(resumes) {
    resumeList.replaceChildren();

    if (resumes.length === 0) {
        showResumeListStatus("You have not uploaded a resume yet.");
        return;
    }

    showResumeListStatus("");
    resumes.forEach(function (resume) {
        const item = document.createElement("li");
        item.className = "resume-list-item";

        const details = document.createElement("div");
        details.className = "resume-list-details";

        const name = document.createElement("p");
        name.className = "resume-list-name";
        name.textContent = resume.original_name;

        const metadata = document.createElement("p");
        metadata.className = "resume-list-metadata";
        metadata.textContent = formatFileSize(resume.file_size);
        if (resume.uploaded_at) {
            const uploadedAt = new Date(resume.uploaded_at);
            if (!Number.isNaN(uploadedAt.getTime())) {
                metadata.textContent += ` · Uploaded ${uploadedAt.toLocaleDateString()}`;
            }
        }

        details.append(name, metadata);

        const downloadButton = document.createElement("button");
        downloadButton.className = "resume-download-button";
        downloadButton.type = "button";
        downloadButton.textContent = "Download";
        downloadButton.addEventListener("click", function () {
            downloadResume(resume, downloadButton);
        });

        item.append(details, downloadButton);
        resumeList.append(item);
    });
}

async function loadResumes() {
    if (!getToken()) {
        showResumeListStatus("Please log in to view your saved resumes.");
        return;
    }

    try {
        const response = await fetch(RESUME_API_URL, {
            headers: {
                Authorization: `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error(await getErrorMessage(response, "Unable to load your resumes."));
        }

        const data = await getResponseData(response);
        if (!Array.isArray(data.resumes)) {
            throw new Error("The server returned an invalid resume list.");
        }
        renderResumes(data.resumes);
    } catch (error) {
        showResumeListStatus(error.message || "Unable to connect to the server. Please try again.");
    }
}

async function uploadResume(file) {
    const token = getToken();
    if (!token) {
        throw new Error("Please log in before uploading a resume.");
    }

    const formData = new FormData();
    formData.append("resume", file);

    const response = await fetch(RESUME_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: formData
    });

    if (!response.ok) {
        throw new Error(await getErrorMessage(response, "Your resume could not be uploaded."));
    }

    await getResponseData(response);
}

async function downloadResume(resume, button) {
    const token = getToken();
    if (!token) {
        showResumeListStatus("Please log in before downloading a resume.");
        return;
    }

    button.disabled = true;
    button.textContent = "Downloading...";

    try {
        const response = await fetch(`${RESUME_API_URL}/${encodeURIComponent(resume.id)}/download`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(await getErrorMessage(response, "Unable to download your resume."));
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
        showResumeListStatus("");
    } catch (error) {
        showResumeListStatus(error.message || "Unable to download your resume. Please try again.");
    } finally {
        button.textContent = "Download";
        button.disabled = false;
    }
}

function clearSelectedFile() {
    resumeInput.value = "";
    fileDetails.hidden = true;
    fileName.textContent = "";
    fileSize.textContent = "";
    uploadButton.disabled = true;
}

resumeInput.addEventListener("change", function () {
    showStatus("");

    const file = resumeInput.files && resumeInput.files[0];
    if (!file) {
        clearSelectedFile();
        return;
    }

    const validationMessage = validateFile(file);
    if (validationMessage) {
        clearSelectedFile();
        showStatus(validationMessage);
        resumeInput.focus();
        return;
    }

    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileDetails.hidden = false;
    uploadButton.disabled = false;
});

removeFileButton.addEventListener("click", function () {
    clearSelectedFile();
    showStatus("The selected file was removed.", "info");
    resumeInput.focus();
});

resumeForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const file = resumeInput.files && resumeInput.files[0];
    if (!file) {
        showStatus("Choose a PDF file before continuing.");
        return;
    }

    const validationMessage = validateFile(file);
    if (validationMessage) {
        showStatus(validationMessage);
        return;
    }

    uploadButton.disabled = true;
    uploadButton.textContent = "Uploading...";
    showStatus("Uploading your resume...", "info");

    try {
        await uploadResume(file);
        showStatus("Your resume was uploaded successfully.", "success");
        clearSelectedFile();
        await loadResumes();
    } catch (error) {
        showStatus(error.message || "Your resume could not be uploaded. Please try again.");
    } finally {
        uploadButton.textContent = "Upload resume";
        uploadButton.disabled = !resumeInput.files || resumeInput.files.length === 0;
    }
});

loadResumes();
