const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorMessage = document.getElementById("error-message");
const loginButton = document.getElementById("login-button");

loginForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    // Clear previous error messages
    errorMessage.textContent = "";

    // Check for empty fields
    if (email === "" || password === "") {
        errorMessage.textContent = "Please enter your email and password.";
        return;
    }

    // Check for a valid email address
    if (!emailInput.checkValidity()) {
        errorMessage.textContent = "Please enter a valid email address.";
        return;
    }

    // Show loading state
    loginButton.textContent = "Logging in...";
    loginButton.disabled = true;
});