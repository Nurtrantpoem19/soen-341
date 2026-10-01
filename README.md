# CareerConnect

## Project Description

CareerConnect is a web-based job search and application tracking platform for job seekers and recruiters, developed for SOEN 341 Software Process, Fall 2026.

Repository: [Nurtrantpoem19/soen-341](https://github.com/Nurtrantpoem19/soen-341)

## Identified Problem

Managing job listings, resumes, deadlines, and application updates across different tools makes it difficult for job seekers to stay organized. Recruiters also need a central place to manage postings and review applicants.

## Proposed Solution

CareerConnect will bring job searching, resume management, and application tracking into one platform. Job seekers will be able to monitor their progress, while recruiters will be able to manage opportunities and candidates.

## Team Members

| Name | Student ID |
| --- | --- |
| Lounis Benhamouche | 40319314 |
| Aymane Mekkaoui | 40287951 |
| Ahmed Meziani | 40329506 |
| Michael Theodore | 40282178 |
| Jack Wu | 40157717 |
| Qing Che Yu | 40328033 |

## Technologies

- Version control and hosting: Git and GitHub.
- Frontend: Login/registration UI under development on a separate branch.
- Backend: Node.js 22+, Express, bcrypt.
- Database: PostgreSQL 17, node-postgres, versioned SQL migrations.
- Testing: Node.js test runner; PostgreSQL in CI and pg-mem for local checks.
- Generative AI integration: To be confirmed.

## Setup Instructions

Clone the repository:

```bash
git clone https://github.com/Nurtrantpoem19/soen-341.git
cd soen-341
```

Install Node.js 22+ and Docker with Compose, then run:

```bash
npm ci
```

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell, or `cp .env.example .env` on macOS/Linux), then run:

```bash
docker compose up -d --wait db
npm run db:migrate
npm start
```

Check `http://localhost:3000/api/health`. Run `npm test` for local emulator checks. CI runs the same suite against PostgreSQL; to do so locally, set `TEST_DATABASE_URL` to a separate test database before running tests.

PostgreSQL data persists in a Docker volume. Profile endpoints currently use the local-only `DEMO_AUTH=true` mode and `x-demo-user-id` header, not real login authentication. Never expose this demo mode publicly. See [database setup and schema](docs/database.md) for details and a demo walkthrough.

## Proposed Features

- User registration, authentication, and profile management.
- Resume upload and management.
- Job posting management for recruiters.
- Job search and filtering.
- Job application submission.
- Application status tracking: Applied, Interview, Offered, and Rejected.
- Application history dashboard.
- Notifications and reminders for application deadlines.
- Saved jobs and favourites.
- A Generative AI feature, such as resume feedback or job-matching suggestions; final selection to be confirmed.
- An additional original team feature: To be confirmed.
