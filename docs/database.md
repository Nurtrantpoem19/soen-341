# Sprint 1 database

## Scope

PostgreSQL replaces the temporary user/profile arrays. Related backlog items: #18, #20, #21, #22, #24, #40, #41, #42, #51 and #56. This implements the database portion; it does not complete the frontend, real login, or resume upload APIs.

## Schema

| Table | Key and relationship | Data and constraints |
| --- | --- | --- |
| users | Serial id | Normalized unique email, bcrypt password hash, creation timestamp |
| profiles | user_id is both primary key and foreign key to users | One profile per user; required bounded first/last names, phone, location and headline; summary up to 2,000 characters |
| resumes | Serial id; user_id references users | Original filename, unique storage path, size from 1 byte to 5 MiB, PDF/DOCX MIME type, upload timestamp |
| schema_migrations | Migration filename | Tracks applied SQL migrations |

Deleting a user cascades to profile and resume metadata. Physical file cleanup belongs to the future storage API. The summary column is ready for later API/UI integration; the current profile endpoints do not edit it. File metadata constraints do not replace content validation in a future upload endpoint.

## Setup and migrations

Follow the README. Alternatively use an existing PostgreSQL server and configure DATABASE_URL in .env. Docker exposes the database only on localhost. The example password is exclusively for local development. Do not commit .env.

Run `npm run db:migrate` once before starting the API and again when migrations are added. Each unapplied SQL file is executed in filename order in a transaction and recorded. Run only one migration process at a time. Do not edit an already applied migration; add another numbered file. There is no automatic down migration: use a new corrective migration and back up data before schema changes.

`docker compose stop db` stops the database without deleting data. The named volume persists across container restarts. Do not remove that volume if you need the stored data.

## Local API walkthrough

With DEMO_AUTH=true in .env and the server running, use PowerShell:

```powershell
$user = Invoke-RestMethod http://localhost:3000/api/auth/register -Method Post -ContentType application/json -Body '{"email":"demo@example.com","password":"ExamplePass123!"}'
$headers = @{ 'x-demo-user-id' = [string]$user.user.id }
$profile = '{"firstName":"Demo","lastName":"Student","phone":"555-0100","location":"Montreal","headline":"Student"}'
Invoke-RestMethod http://localhost:3000/api/profile -Method Post -Headers $headers -ContentType application/json -Body $profile
Invoke-RestMethod http://localhost:3000/api/profile/me -Headers $headers
```

Restart the Node server and repeat the GET with the same user ID to verify persistence. Re-registering the same email returns 409. PUT /api/profile/me uses the same five required fields to update the profile.

DEMO_AUTH is disabled unless explicitly enabled. Its user-ID header is not authentication and allows impersonation; it is only for the existing local demo. Real login/session middleware must replace it before deployment. The Node server binds to localhost.

## Validation

`npm test` runs migrations, repeat-migration checks, registration/hash/duplicate checks, profile create/update/retrieval after app restart, invalid inputs, disabled demo access, summary and resume constraints, and cascading deletion.

Local tests use pg-mem with trim/length function shims and disabled AST coverage checking to work around its repeated CREATE TABLE IF NOT EXISTS limitation. This is not proof of PostgreSQL compatibility or on-disk durability. GitHub Actions runs the same suite against PostgreSQL 17. For local real-database testing, set TEST_DATABASE_URL to a dedicated disposable PostgreSQL test database; the suite applies the schema and inserts/removes its test records.
