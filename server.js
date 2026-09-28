const express = require('express');
const bcrypt = require('bcrypt');
const app = express();
const PORT = 3000;

// middleware to parse  JSON requests
app.use(express.json());

// mock database for Sprint 1 demonstration
const users = [];
const profiles = [];

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
// Sprint 1 demo only: replace this header with real login authentication later.
function demoUser(req, res, next) {
    const userId = Number(req.get('x-demo-user-id'));
    const user = users.find(item => item.id === userId);

    if (!user) {
        return res.status(401).json({
            message: 'Register first and provide a valid x-demo-user-id header.'
        });
    }

    req.user = user;
    next();
}

const profileFields = ['firstName', 'lastName', 'phone', 'location', 'headline'];

function validateProfile(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

    const profile = {};
    for (const field of profileFields) {
        if (typeof body[field] !== 'string' || !body[field].trim()) return null;
        profile[field] = body[field].trim();
    }
    return profile;
}

// #43: Create profile
app.post('/api/profile', demoUser, (req, res) => {
    if (profiles.some(profile => profile.userId === req.user.id)) {
        return res.status(409).json({ message: 'Profile already exists.' });
    }

    const fields = validateProfile(req.body);
    if (!fields) {
        return res.status(400).json({
            message: `All profile fields are required: ${profileFields.join(', ')}.`
        });
    }

    const profile = { userId: req.user.id, ...fields };
    profiles.push(profile);
    res.status(201).json({ profile });
});

// #46: View profile
app.get('/api/profile/me', demoUser, (req, res) => {
    const profile = profiles.find(item => item.userId === req.user.id);
    if (!profile) return res.status(404).json({ message: 'Profile not found.' });
    res.json({ profile });
});

// #47: Edit profile
app.put('/api/profile/me', demoUser, (req, res) => {
    const profile = profiles.find(item => item.userId === req.user.id);
    if (!profile) return res.status(404).json({ message: 'Profile not found.' });

    const fields = validateProfile(req.body);
    if (!fields) {
        return res.status(400).json({
            message: `All profile fields are required: ${profileFields.join(', ')}.`
        });
    }

    Object.assign(profile, fields);
    res.json({ profile });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});