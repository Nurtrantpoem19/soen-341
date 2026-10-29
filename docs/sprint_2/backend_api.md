Overview

The CareerConnect backend runs locally at http://localhost:3000.

The API supports user registration, login, profile management, and resume management.

Most endpoints require a JWT token obtained after logging in.

Authentication

Register

POST /api/auth/register

Request body:

{
  "email": "student@example.com",
  "password": "ExamplePass123!"
}

The email must be valid, and the password must contain at least 8 characters and no more than 72 UTF-8 bytes.

Responses:

201 — Account created

400 — Invalid email or password

409 — Email already registered

Login

POST /api/auth/login

Request body:

{
  "email": "student@example.com",
  "password": "ExamplePass123!"
}

A successful login returns the user's ID, email, and JWT token. The token expires after one hour.

For protected endpoints, include:

Authorization: Bearer YOUR_JWT_TOKEN

Responses:

200 — Login successful

400 — Missing credentials

401 — Incorrect credentials

Profile Management

All profile endpoints require authentication.

Create profile

POST /api/profile

Request body:

{
  "firstName": "Michael",
  "lastName": "Theodore",
  "phone": "5145551234",
  "location": "Montreal",
  "headline": "Software Engineering Student"
}

All five fields are required and cannot be empty.

Maximum lengths:

firstName, lastName: 100 characters each

phone: 50 characters

location, headline: 200 characters each

Responses:

201 — Profile created

400 — Invalid or missing fields

401 — Authentication required

409 — Profile already exists

Get current user's profile

GET /api/profile/me

Returns the authenticated user's profile, including userId, firstName, lastName, phone, location, headline, and summary.

Responses:

200 — Profile returned

401 — Authentication required

404 — Profile not found

Update profile

PUT /api/profile/me

Uses the same five required fields as profile creation. This endpoint replaces those field values; it does not currently update summary.

Responses:

200 — Profile updated

400 — Invalid or missing fields

401 — Authentication required

404 — Profile not found

Resume Management

All resume endpoints require authentication.

Supported formats: PDF and DOCX.

Maximum file size: 5 MB.

Uploads must use multipart/form-data with the file field named resume.

Upload resume

POST /api/resumes

Example frontend request:

const formData = new FormData();
formData.append('resume', selectedFile);

const response = await fetch('http://localhost:3000/api/resumes', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`
  },
  body: formData
});

Do not manually set the Content-Type header for a FormData request. The browser sets it automatically.

Responses:

201 — Resume uploaded

400 — Unsupported format or invalid file

401 — Authentication required

413 — File exceeds the size limit

List uploaded resumes

GET /api/resumes

Returns the authenticated user's resume metadata in a resumes array, ordered from newest to oldest.

Responses:

200 — Resume list returned

401 — Authentication required

Download resume

GET /api/resumes/:id/download

Downloads the specified resume if it belongs to the authenticated user.

Responses:

200 — Resume file returned

401 — Authentication required

404 — Resume not found or does not belong to the user

Replace resume

PUT /api/resumes/:id

Uses multipart/form-data with the field name resume, just like uploading.

The existing resume record keeps its ID, but its file and metadata are updated.

Responses:

200 — Resume replaced

400 — Invalid file or resume ID

401 — Authentication required

404 — Resume not found or does not belong to the user

413 — File exceeds the size limit

Health Check

GET /api/health

Returns the backend/database connection status. No authentication required.

Notes for Frontend Integration

Log in first to obtain a JWT.

Send the JWT with every protected API request.

Use JSON for registration, login, and profile requests.

Use FormData for resume uploads and replacements.

Resume downloads return file content rather than JSON.

The backend currently has no resume deletion endpoint.

Job listings and job application tracking endpoints are not included in this API yet.