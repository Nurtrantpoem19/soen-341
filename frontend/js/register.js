const registerForm = document.getElementById("register-form");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("register-email");
const passwordInput = document.getElementById("register-password");
const confirmPasswordInput = document.getElementById("confirm-password");
const errorMessage = document.getElementById("error-message");
const registerButton = document.getElementById("register-button");

registerForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    errorMessage.textContent = "";

    // Check for empty fields
    if (
        name === "" ||
        email === "" ||
        password === "" ||
        confirmPassword === ""
    ) {
        errorMessage.textContent = "Please complete all fields.";
        return;
    }

    // Check email format
    if (!emailInput.checkValidity()) {
        errorMessage.textContent = "Please enter a valid email address.";
        return;
    }

    // Check password length
    if (password.length < 6) {
        errorMessage.textContent =
            "Password must be at least 6 characters.";
        return;
    }

    // Check if passwords match
    if (password !== confirmPassword) {
        errorMessage.textContent = "Passwords do not match.";
        return;
    }

    // Show loading state
    registerButton.textContent = "Creating Account...";
    registerButton.disabled = true;
});