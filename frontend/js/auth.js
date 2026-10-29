const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorMessage = document.getElementById("error-message");
const loginButton = document.getElementById("login-button");

loginForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

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

    fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email: email, password: password })
    })
        .then(async function (response) {
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to log in. Please try again.");
            }

            if (typeof data.token !== "string" || data.token.length === 0) {
                throw new Error("The server did not return an authentication token.");
            }

            sessionStorage.setItem("careerconnect_token", data.token);
            window.location.href = "../index.html";
        })
        .catch(function (error) {
            errorMessage.textContent =
                error.message || "Unable to connect to the server. Please try again.";
        })
        .finally(function () {
            loginButton.textContent = "Login";
            loginButton.disabled = false;
        });
});