const registerForm = document.getElementById("register-form");
const emailInput = document.getElementById("register-email");
const passwordInput = document.getElementById("register-password");
const confirmPasswordInput = document.getElementById("confirm-password");
const roleSelect = document.getElementById("role");
const errorMessage = document.getElementById("error-message");
const registerButton = document.getElementById("register-button");

registerForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    errorMessage.textContent = "";

    if (email === "" || password === "" || confirmPassword === "") {
        errorMessage.textContent = "Please complete all fields.";
        return;
    }

    if (!emailInput.checkValidity()) {
        errorMessage.textContent = "Please enter a valid email address.";
        return;
    }

    if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
        errorMessage.textContent =
            "Password must be between 8 characters and 72 bytes.";
        return;
    }

    if (password !== confirmPassword) {
        errorMessage.textContent = "Passwords do not match.";
        return;
    }

    registerButton.textContent = "Creating Account...";
    registerButton.disabled = true;

    try {
        const response = await fetch(
            "http://localhost:3000/api/auth/register",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: email,
                    password: password,
                    role: roleSelect.value
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            errorMessage.textContent =
                data.message || "Registration failed.";
            return;
        }

        window.location.href = "login.html";
    } catch (error) {
        errorMessage.textContent =
            "Unable to connect to the server. Please try again.";
    } finally {
        registerButton.textContent = "Create Account";
        registerButton.disabled = false;
    }
});
