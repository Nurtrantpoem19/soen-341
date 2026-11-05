## **Sprint 3 Core Objectives**

* **Complete Core Features:** Finalize Recruiter Management, Candidate Analytics, and Notifications.
* **Gen AI Kickoff:** Build backend infrastructure, prompt integration, and initial UX for AI-powered resume feedback.
* **Quality & Integration:** End-to-end integration across all user roles with API testing.

---

## **Feature Breakdown (GitHub Issue Summaries)**

### **1. Recruiter Dashboard & Posting Management**

* **Job Management:** Create, edit, archive, and view all postings in a single dashboard view.
* **Applicant Review & Filtering:** View incoming applications per posting, filter candidates by status or submission date, and update candidate progress.
* **Role-Based Access Control:** Secure endpoints and UI routes so candidate management is strictly accessible by recruiters.

### **2. Application Analytics & History Dashboard**

* **Application History:** Display job seekers' active and historical applications with live status badges.
* **Activity Metrics:** Implement aggregate queries and visualization for metrics like application submission trends over time.
* **Performance Optimization:** Index database fields (`user_id`, `status`, `created_at`) to keep dashboard loads fast.

### **3. Notifications & Reminders System**

* **Event-Driven Alerts:** Trigger in-app notifications for status updates, interview invites, deadlines, and new applications.
* **Notification Center:** Build a navbar bell icon, unread counter, and a slide-out drawer to review and dismiss alerts.
* **Backend Store:** Create a persistent database table and API routes for read/unread state management.

### **4. AI-Powered Resume Feedback (Phase 1)**

* **LLM Ingestion & API Integration:** Set up server-side API integration (OpenAI/Gemini wrapper) with text parsing for resume contents.
* **Prompt Engineering:** Write and evaluate prompts to score candidate resumes against target job descriptions and output structured feedback (strengths, gaps, formatting).
* **Initial UX:** Create the basic submission flow on the applicant portal to trigger analysis and view raw feedback metrics.

---

## **Sprint Execution Timeline**

* **Week 1 (Infrastructure & Core UI):**
* Database updates (Notifications table, indexes).
* Build Recruiter and Candidate dashboard layouts.
* Wire up LLM backend wrapper and test prompt schema in isolation.


* **Week 2 (Integration, Trigger Events & Testing):**
* Hook application status updates directly to notification events.
* Wire candidate dashboard to real backend analytics endpoints.
* Write API integration tests for status transitions and route access guards.
* Sprint demo: Live notification triggers, dashboard analytics, and working AI feedback draft.
