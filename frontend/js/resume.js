const MAX_FILE_SIZE = 5 * 1024 * 1024;
const PDF_MIME_TYPE = "application/pdf";

const resumeForm = document.getElementById("resume-form");
const resumeInput = document.getElementById("resume-file");
const fileDetails = document.getElementById("file-details");
const fileName = document.getElementById("file-name");
const fileSize = document.getElementById("file-size");
const removeFileButton = document.getElementById("remove-file");
const uploadButton = document.getElementById("upload-button");
const uploadStatus = document.getElementById("upload-status");

// These are proposed integration points, not routes currently implemented by the backend.
// Suggested contract: GET /api/resumes/me returns { resume: { id, originalName, fileSize, mimeType, uploadedAt } } or { resume: null };
// POST /api/resumes/me and PUT /api/resumes/me accept multipart field "file" (PDF) and return { resume: ... };
// GET /api/resumes/me/file returns the PDF with Content-Type and Content-Disposition headers;
// DELETE /api/resumes/me returns 204. Each request must authenticate/authorize the current user
// and enforce file type and size limits on the server.
const resumeApi = {
    async getResume() {
        throw new Error("Resume management is not connected to the backend yet.");
    },
    async uploadResume(file) {
        void file;
        throw new Error("Resume uploads will be available once the backend is connected.");
    },
    async downloadResume() {
        throw new Error("Resume downloads will be available once the backend is connected.");
    },
    async deleteResume() {
        throw new Error("Resume deletion will be available once the backend is connected.");
    }
};

function showStatus(message, state = "error") {
    uploadStatus.textContent = message;
    uploadStatus.dataset.state = state;
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
    uploadButton.textContent = "Checking...";
    showStatus("Checking upload availability...", "info");

    try {
        await resumeApi.uploadResume(file);
        showStatus("Your resume was uploaded successfully.", "success");
        clearSelectedFile();
    } catch (error) {
        showStatus(error.message || "Your resume could not be uploaded. Please try again.");
    } finally {
        uploadButton.textContent = "Upload resume";
        uploadButton.disabled = !resumeInput.files || resumeInput.files.length === 0;
    }
});
