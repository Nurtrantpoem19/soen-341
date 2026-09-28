const express = require('express');
const bcrypt = require('bcrypt');
const cors = require('cors');
const app = express();
const PORT = 3000;
app.use(cors());

// middleware to parse  JSON requests
app.use(express.json());

// mock database for Sprint 1 demonstration
const users = [];

// POST /api/auth/register endpoint
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Basic validation
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required." });
        }

        // check if the user already exists (Requirement: 409 Conflict)
        const userExists = users.find(user => user.email === email);
        if (userExists) {
            return res.status(409).json({ message: "User with this email already exists." });
        }

        // hash the password (Requirement: password hashing)
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // create the new user record
        const newUser = {
            id: users.length + 1,
            email: email,
            password: hashedPassword
        };
        users.push(newUser);

        //  return  success response
        res.status(201).json({ 
            message: "User registered successfully", 
            user: { id: newUser.id, email: newUser.email } 
        });

    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});