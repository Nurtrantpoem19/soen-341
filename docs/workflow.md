
# Team Development Process

## 1. Development Workflow

We will use a feature-based workflow centered around GitHub Issues and Pull Requests.

1. A user story or task is created as a GitHub Issue.
2. The issue is assigned to a team member.
3. The team member creates a branch for the issue.
4. The team member implements the feature or task locally.
5. The changes are tested locally.
6. The team member pushes the branch to GitHub.
7. A Pull Request (PR) is opened against the `main` branch.
8. Another team member reviews the PR.
9. Any requested changes are addressed.
10. Once the PR has been approved and checks pass, it is merged into `main`.
11. The related issue is closed and the GitHub Project is updated.

### Workflow

```text
GitHub Issue
     ↓
Create Branch
     ↓
Implement / Test
     ↓
Push Branch
     ↓
Open Pull Request
     ↓
Code Review
     ↓
Address Feedback
     ↓
Approval + Checks
     ↓
Merge into main
     ↓
Close Issue / Update Project
```

---

## 2. Branching Strategy

We will use `main` as the stable branch containing code that has passed review.

### Branch Types

* `main` — stable, reviewed code
* Feature branches — used for individual features or tasks

Feature branches should follow this naming convention:

```text
feature/<short-description>
```

Examples:

```text
feature/user-registration
feature/resume-upload
feature/user-profile
```

For bug fixes:

```text
fix/<short-description>
```

Example:

```text
fix/resume-upload-validation
```

### Branch Rules

* Team members should not directly push to `main`.
* Each feature or task should be developed on its own branch.
* Branches should be kept reasonably small and focused on one task.
* Feature branches should be created from the latest `main`.
* Completed branches should be deleted after merging when they are no longer needed.

---

## 3. Pull Request Process

Every change intended for `main` must go through a Pull Request.

### Creating a Pull Request

The author should:

1. Push the branch to GitHub.
2. Create a PR targeting `main`.
3. Link the relevant GitHub Issue.
4. Provide a short description of:

   * What was changed
   * Why it was changed
   * How it was tested
5. Request a review from at least one other team member.

### Before Merging

The author must ensure:

* The code builds successfully.
* Relevant tests pass.
* The implementation matches the associated issue.
* No obvious debugging code or unnecessary files are included.
* Review comments have been addressed.

### Merging

A PR can be merged when:

* At least one team member has approved it.
* Required checks pass.
* There are no unresolved review comments.
* The author or an authorized team member merges the PR into `main`.

---

## 4. Code Review Process

Code reviews are intended to catch errors, improve maintainability, and ensure that changes meet the requirements of the associated issue.

Reviewers should check:

* **Correctness** — Does the code behave as intended?
* **Requirements** — Does it satisfy the associated user story/task?
* **Readability** — Is the code understandable?
* **Maintainability** — Will the code be reasonably easy to modify later?
* **Testing** — Are relevant cases tested?
* **Security** — Are there obvious security or data-handling issues?
* **Consistency** — Does the implementation follow the team's conventions?

Review comments should be specific and constructive.

The author should respond to review comments and make necessary changes before merging.

---

## 5. Definition of Ready (DoR)

A task or user story is considered **Ready** when it contains enough information for a team member to begin implementation.

A Ready item should have:

* [ ] A clear description
* [ ] A defined objective or user need
* [ ] Clear acceptance criteria
* [ ] Appropriate priority
* [ ] An effort estimate
* [ ] No known blocking dependencies
* [ ] An assigned team member

A task that does not meet these criteria should be clarified before implementation begins.

---

## 6. Definition of Done (DoD)

A task or user story is considered **Done** when the implementation is complete, reviewed, and integrated into the project.

A Done item must:

* [ ] Meet its acceptance criteria
* [ ] Be implemented
* [ ] Be tested appropriately
* [ ] Build/run successfully
* [ ] Follow the team's coding conventions
* [ ] Pass code review
* [ ] Have all review comments addressed
* [ ] Be merged into `main`
* [ ] Have its GitHub Issue/Project status updated
* [ ] Include necessary documentation or comments

For a user-facing feature, the feature should also be demonstrated to work as expected.

---

## 7. Summary

Our development process follows the principle:

> **Issue → Branch → Implement → Test → Pull Request → Review → Merge → Done**

This workflow is intended to keep `main` stable while allowing team members to work independently on separate tasks.
