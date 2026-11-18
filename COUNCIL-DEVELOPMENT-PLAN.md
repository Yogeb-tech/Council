# Council — 5-Day Development Plan

> [!abstract] Project Overview  
> **Project:** Council — Async Decision Room for Small Teams  
> **Objective:** Build and deploy a multi-user decision-making application using the DeepSpace SDK.  
> **Deadline:** Sunday, November 22, 2026 — 11:59 PM EST  
> **Development:** 4 days  
> **Testing & Submission:** 1 day

## Project Vision

Council allows small teams to make structured decisions asynchronously.

Users can:

- Create decisions and define possible options.
    
- Invite teammates to participate.
    
- Vote and submit arguments for or against options.
    
- See real-time votes, discussions, and participant presence.
    
- Generate AI-powered decision summaries.
    
- Automatically close decisions and distribute final reports through Slack and email.
    

### Core User Flow

1. User signs in.
    
2. User creates a decision.
    
3. Teammates join the decision.
    
4. Members discuss options and vote.
    
5. AI generates a decision memo.
    
6. Voting deadline expires.
    
7. CronRoom closes voting and triggers notifications.
    
8. Slack and email deliver the final decision memo.
    

---

# Development Schedule

## Day 1 — Foundation, Architecture & Authentication

**Goal:** Establish the application foundation and get authentication working.

### Tasks

- Read DeepSpace documentation.
    
- Install and initialize the SDK using `npx deepspace`.
    
- Explore 1–2 official examples.
    
- Initialize Git repository.
    
- Configure environment variables and secrets.
    
- Understand DeepSpace's built-in database and authentication primitives.
    
- Define application architecture.
    
- Define database schema.
    
- Implement authentication.
    
- Implement team creation.
    
- Implement team membership and roles.
    
- Establish authorization rules.
    
- Create dashboard layout.
    
- Create basic decision creation form.
    

### Initial Data Models

|Model|Important Fields|
|---|---|
|User|ID, name, email|
|Team|ID, name|
|Membership|User ID, Team ID, role|
|Decision|ID, title, description, deadline, status|
|Option|ID, decision ID, title|
|Vote|User ID, option ID|
|Argument|User ID, option ID, content, stance|

### Copilot CLI Prompt

```
Act as a senior full-stack engineer familiar with the
DeepSpace SDK.

First, inspect the current repository and understand
the existing scaffold.

I am building Council, an asynchronous decision-making
application for small teams.

Today's objective:
1. Understand the project structure.
2. Identify the existing DeepSpace primitives.
3. Recommend an architecture that follows official
   DeepSpace conventions.
4. Design the database schema for users, teams,
   memberships, decisions, options, votes, and arguments.
5. Implement authentication using DeepSpace's
   supported authentication APIs.
6. Implement team membership and role-based access control.
7. Create a basic dashboard and decision creation flow.

IMPORTANT:
- Do not invent DeepSpace APIs.
- Inspect documentation and existing examples first.
- Prefer native DeepSpace primitives over custom implementations.
- Never expose secrets or put credentials in client-side code.
- Enforce authorization on the server, not just in the UI.
- Keep components modular and maintainable.
- Explain architectural decisions before making major changes.

Work incrementally. After each major feature:
- Explain what changed.
- List modified files.
- Run relevant checks.
- Identify anything that needs manual verification.

Do not implement features outside today's scope.
```

### End-of-Day Deliverable

- Working authentication.
    
- Team creation and membership.
    
- Basic dashboard.
    
- Ability to create a decision.
    
- Initial database and architecture documented.
    

### Git Milestone

`feat: establish project foundation and authentication`

---

## Day 2 — Decision Engine, Voting & Real-Time Collaboration

**Goal:** Make Council usable as a multi-user decision platform.

### Tasks

#### Decision Management

- Create decisions with titles and descriptions.
    
- Add multiple options to a decision.
    
- Set voting deadlines.
    
- Display decisions on the dashboard.
    
- Implement open and closed decision states.
    

#### Voting System

- Allow team members to vote.
    
- Prevent duplicate votes.
    
- Allow users to change their votes.
    
- Display vote counts.
    
- Handle concurrent voting safely.
    

#### Arguments & Discussion

- Add arguments for and against options.
    
- Associate arguments with individual options.
    
- Display author information.
    
- Display timestamps.
    
- Organize arguments clearly.
    

#### Real-Time Features

- Integrate DeepSpace real-time data synchronization.
    
- Subscribe to vote updates.
    
- Subscribe to argument updates.
    
- Implement live participant presence.
    
- Display who is currently viewing a decision.
    

#### UI

- Build decision detail page.
    
- Build option cards.
    
- Build voting interface.
    
- Build discussion section.
    
- Add loading and empty states.
    
- Add status indicators.
    

### Copilot CLI Prompt

```
Continue development of Council.

First inspect the current implementation and identify
what was completed on Day 1.

Today's objective is implementing the complete
decision-making experience.

Implement the following:

1. Decision management:
   - Create and edit decisions.
   - Add multiple options.
   - Set voting deadlines.
   - Display decision status.

2. Voting:
   - Allow authenticated team members to vote.
   - Prevent duplicate votes.
   - Allow users to update their votes.
   - Keep vote counts accurate under concurrent updates.

3. Arguments:
   - Support arguments for and against options.
   - Associate arguments with their authors and options.
   - Display timestamps.

4. Real-time collaboration:
   - Use DeepSpace's native real-time synchronization.
   - Subscribe to relevant decision, vote, and argument changes.
   - Implement participant presence using supported APIs.

5. UI:
   - Build a polished decision detail page.
   - Make the voting and discussion experience intuitive.
   - Add loading, empty, and error states.

IMPORTANT:
- Inspect actual DeepSpace APIs and examples before coding.
- Do not simulate real-time functionality with polling
  if native synchronization is available.
- Ensure users cannot vote or participate outside
  their team.
- Handle duplicate and concurrent vote submissions.
- Keep the existing architecture intact unless
  a change is necessary.

Work feature by feature and verify each implementation.
Explain any assumptions or tradeoffs.
```

### End-of-Day Deliverable

- Multiple users can participate in a decision.
    
- Votes and arguments work.
    
- Real-time updates are functional.
    
- Presence indicators work.
    

### Git Milestone

`feat: implement collaborative decision-making`

---

## Day 3 — AI Integration & Decision Intelligence

**Goal:** Implement the feature that differentiates Council from a basic polling application.

### Tasks

#### AI Integration

- Inspect DeepSpace AI chat documentation.
    
- Connect the AI integration.
    
- Design a structured summarization prompt.
    
- Feed the AI actual decision data.
    
- Include arguments, options, and voting results.
    
- Generate a decision memo.
    
- Support streaming responses if available.
    

#### Decision Memo Structure

The AI should generate:

1. Executive summary.
    
2. Overview of available options.
    
3. Strongest arguments for each option.
    
4. Strongest arguments against each option.
    
5. Areas of agreement.
    
6. Areas of disagreement.
    
7. Actual voting results.
    
8. Suggested next steps.
    

#### AI Safeguards

- Ground summaries in actual submitted arguments.
    
- Never fabricate votes or arguments.
    
- Distinguish consensus from majority preference.
    
- Clearly label AI-generated recommendations.
    
- Handle empty discussions.
    
- Handle AI errors and timeouts.
    
- Ensure users can only summarize decisions they can access.
    

#### UI

- Add Generate Decision Memo button.
    
- Add streaming/loading state.
    
- Display generated memo.
    
- Add regeneration functionality.
    
- Add generation timestamps.
    

### Copilot CLI Prompt

```
Continue working on Council.

Today's objective is implementing AI-powered
decision intelligence using DeepSpace's AI integration.

First inspect the existing codebase and DeepSpace AI
documentation.

Implement an AI decision memo generator.

The generator should receive:
- Decision title and description.
- Available options.
- Actual vote counts.
- Arguments submitted for each option.
- Relevant discussion metadata.

Generate a structured memo containing:
1. Executive summary.
2. Overview of options.
3. Strongest arguments for each option.
4. Strongest arguments against each option.
5. Areas of agreement.
6. Areas of disagreement.
7. Actual voting results.
8. Suggested next steps.

Requirements:
- Use the native DeepSpace AI integration.
- Use streaming if supported.
- Ground every factual claim in supplied data.
- Never invent arguments, votes, or consensus.
- Distinguish majority preference from unanimous agreement.
- Clearly label AI recommendations.
- Handle empty discussions and failed generations.
- Enforce server-side authorization.

Add a polished memo display to the decision detail page.

Before implementing, explain how you will structure
the prompt and validate the output.

After implementation, test with realistic sample data
and identify potential hallucination risks.
```

### End-of-Day Deliverable

- Working AI integration.
    
- Generated decision memos.
    
- Streaming or loading experience.
    
- AI safeguards and error handling.
    

### Git Milestone

`feat: add AI-powered decision summaries`

---

## Day 4 — Slack, Gmail, CronRoom & Deployment

**Goal:** Complete the full workflow and deploy the application.

### Slack Integration

- Inspect Slack integration documentation.
    
- Configure Slack integration.
    
- Allow users to select a destination channel.
    
- Generate final decision notification.
    
- Send decision memo to Slack.
    
- Handle delivery errors.
    

### Gmail Integration

- Inspect Gmail integration documentation.
    
- Configure email delivery.
    
- Identify team members' email addresses.
    
- Send decision memo to relevant members.
    
- Include decision title, outcome, and application link.
    
- Handle email failures.
    

### CronRoom Automation

- Inspect CronRoom documentation.
    
- Create a scheduled job for decision deadlines.
    
- Detect expired decisions.
    
- Close voting automatically.
    
- Generate final decision memo.
    
- Trigger Slack delivery.
    
- Trigger email delivery.
    
- Record processing and delivery status.
    

### Reliability

- Make scheduled execution idempotent.
    
- Prevent duplicate notifications.
    
- Track successful and failed deliveries.
    
- Handle partial delivery failures.
    
- Ensure failed notifications can be retried safely.
    

### Deployment

- Inspect DeepSpace deployment requirements.
    
- Configure production environment variables.
    
- Verify production permissions.
    
- Run local build and checks.
    
- Deploy using `npx deepspace deploy`.
    
- Verify deployed URL.
    
- Test primary user flow in production.
    

### Copilot CLI Prompt

```
Continue development of Council.

Today's objective is completing integrations,
automation, and deployment.

Before making changes, inspect:
- Existing application architecture.
- DeepSpace Slack integration documentation.
- DeepSpace Gmail integration documentation.
- DeepSpace CronRoom documentation.
- Existing AI memo generation implementation.

Implement the following:

1. Slack:
   - Configure Slack delivery.
   - Support destination channel configuration.
   - Send final decision memos.

2. Gmail:
   - Configure email delivery.
   - Send final memos to relevant team members.
   - Include the decision outcome and application link.

3. CronRoom:
   - Schedule decision deadline processing.
   - Detect expired decisions.
   - Close voting.
   - Generate the final memo.
   - Trigger Slack and email delivery.

4. Reliability:
   - Make scheduled jobs idempotent.
   - Prevent duplicate notifications.
   - Track delivery status.
   - Handle partial failures.
   - Support safe retries.

5. Deployment:
   - Review production configuration.
   - Verify secrets handling.
   - Run available checks.
   - Prepare the application for DeepSpace deployment.

IMPORTANT:
- Verify every API against official documentation.
- Never invent integration methods.
- Keep privileged integration calls server-side.
- Do not expose OAuth tokens or API credentials.
- Do not assume a scheduled job executes exactly once.
- Design for retries and duplicate execution.
- Preserve existing working functionality.

Do not claim deployment or integration success
without actually verifying it.

At the end, provide:
- List of completed integrations.
- Files changed.
- Commands executed.
- Remaining issues.
- Manual verification steps.
```

### End-of-Day Deliverable

- Slack notifications working.
    
- Gmail notifications working.
    
- CronRoom automation working.
    
- Complete application deployed.
    

### Git Milestone

`feat: integrate notifications and automated decision closure`

---

## Day 5 — Testing, Debugging & Submission

**Goal:** Deliver a reliable, polished, working application.

> [!warning] No major new features today.  
> Focus on fixing bugs, verifying integrations, and preparing the submission.

### 1. Authentication & Authorization

- Test registration and login.
    
- Verify team membership.
    
- Attempt unauthorized decision access.
    
- Verify non-members cannot vote.
    
- Verify non-members cannot edit decisions.
    
- Verify server-side permissions.
    

### 2. Core Functionality

- Create a decision.
    
- Add multiple options.
    
- Submit arguments.
    
- Vote on options.
    
- Change an existing vote.
    
- Verify vote counts.
    
- Verify real-time updates across users.
    
- Verify presence indicators.
    
- Close a decision.
    

### 3. AI Testing

- Generate a decision memo.
    
- Verify factual accuracy.
    
- Test with no arguments.
    
- Test with conflicting arguments.
    
- Test with unanimous voting.
    
- Test with no clear majority.
    
- Verify recommendations are labeled.
    

### 4. Integration Testing

- Test Slack delivery.
    
- Test Gmail delivery.
    
- Trigger CronRoom deadline processing.
    
- Verify automatic decision closure.
    
- Verify memo generation.
    
- Verify notification delivery.
    
- Verify duplicate execution does not duplicate messages.
    
- Verify failure and retry behavior.
    

### 5. Production Testing

- Open deployed application.
    
- Test primary user flow.
    
- Inspect browser console.
    
- Inspect server logs.
    
- Verify environment variables.
    
- Verify secrets are protected.
    
- Test responsive layouts.
    
- Fix critical issues.
    

### 6. Documentation & Submission

- Update README.
    
- Document setup instructions.
    
- Document environment variables without exposing secrets.
    
- Document architecture.
    
- Document DeepSpace integrations.
    
- Explain the main technical tradeoff.
    
- Explain what Copilot implemented.
    
- Explain what I personally verified.
    
- Document unfinished features honestly.
    
- Verify repository URL.
    
- Verify deployed URL.
    
- Submit application.
    

### Copilot CLI Prompt — Final Audit

```
Act as a senior software engineer conducting a
production-readiness review of Council.

Do NOT immediately modify files.

First inspect the entire repository and identify:

1. Authentication and authorization vulnerabilities.
2. Database integrity issues.
3. Race conditions in voting.
4. Real-time synchronization issues.
5. AI prompt and data-grounding problems.
6. Slack and Gmail integration failures.
7. CronRoom idempotency and retry problems.
8. Secret exposure risks.
9. Error handling gaps.
10. UI and accessibility issues.

Prioritize findings by:
- Critical
- High
- Medium
- Low

For every finding:
- Identify the affected file.
- Explain the problem.
- Explain how it could affect users.
- Recommend a fix.

Do not invent vulnerabilities.
Only report issues supported by code inspection
or actual test results.

After presenting the audit, ask for approval
before making major changes.

Once approved:
- Fix critical and high-priority issues.
- Run relevant tests.
- Report all modified files.
- Identify anything that still requires manual verification.

Never claim something passed without testing it.
```

---

# Git Workflow

Keep commits small and organized by feature.

|Day|Suggested Commit|
|---|---|
|1|`feat: establish project foundation and authentication`|
|2|`feat: implement collaborative decision-making`|
|3|`feat: add AI-powered decision summaries`|
|4|`feat: integrate notifications and automation`|
|5|`fix: resolve production issues and finalize release`|

Suggested branches:

- `main` — stable version.
    
- `feat/auth-foundation`
    
- `feat/decision-engine`
    
- `feat/ai-summaries`
    
- `feat/integrations`
    

Merge tested work into `main` frequently enough that deployment never depends on a large, unreviewed branch.

---

# Recommended Project Structure

Adapt this to the actual DeepSpace scaffold.

```
council/
├── src/
│   ├── components/
│   │   ├── ui/
│   │   ├── decisions/
│   │   ├── voting/
│   │   └── arguments/
│   │
│   ├── pages/
│   │   ├── dashboard/
│   │   ├── decision/
│   │   └── settings/
│   │
│   ├── services/
│   │   ├── auth/
│   │   ├── decisions/
│   │   ├── realtime/
│   │   ├── ai/
│   │   ├── slack/
│   │   ├── email/
│   │   └── cron/
│   │
│   ├── hooks/
│   ├── types/
│   └── utils/
│
├── docs/
│   ├── architecture.md
│   └── integrations.md
│
├── .env.example
├── README.md
└── package.json
```

---

# Additional Copilot CLI Workflow Prompts

Use these throughout the five days.

## 1. Before Implementing Any Feature

```
Before implementing this feature:

1. Inspect the existing codebase.
2. Identify relevant files and dependencies.
3. Check official DeepSpace documentation.
4. Explain the proposed implementation.
5. Identify possible edge cases.
6. Identify security considerations.

Do not modify files until you have explained
the implementation plan.

Keep the solution minimal and consistent
with the existing architecture.
```

## 2. Debugging an Error

```
Help me debug this issue.

Do not immediately rewrite the implementation.

First:
1. Reproduce or inspect the error.
2. Identify the most likely root cause.
3. Form a testable hypothesis.
4. Explain how to verify that hypothesis.
5. Recommend the smallest possible fix.

After implementing the fix:
- Run relevant tests.
- Explain why the issue occurred.
- Explain why the fix works.
- Identify potential regressions.
```

## 3. Code Review

```
Review the current changes as a senior engineer.

Focus on:
- Correctness.
- Security.
- Maintainability.
- DeepSpace SDK usage.
- Database integrity.
- Error handling.
- Performance.

Identify unnecessary complexity and duplicated code.

Do not make changes yet.
Provide actionable findings with file references.
```

## 4. Understanding DeepSpace APIs

```
I want to understand this DeepSpace SDK feature
before implementing it.

Inspect the official documentation and available examples.

Explain:
1. What the feature does.
2. How it works internally at a high level.
3. How Council should use it.
4. What responsibilities DeepSpace handles.
5. What responsibilities my application handles.
6. Common mistakes and security considerations.

Include a small example using the actual SDK APIs.

Do not invent methods or properties.
```

## 5. Understanding Your Own Code

```
Explain this implementation to me as if I will
need to modify it during a live coding interview.

Cover:
- Overall architecture.
- Important functions.
- Data flow.
- API interactions.
- State management.
- Error handling.
- Security considerations.
- Potential improvements.

Then give me three realistic modification tasks
that an interviewer might ask me to perform.
Do not modify the code.
```

## 6. README Generation

```
Review the completed Council application and
generate a professional README.

Include:
- Project overview.
- Main features.
- Technology stack.
- DeepSpace integrations.
- Architecture overview.
- Database models.
- Setup instructions.
- Environment variable requirements.
- Deployment instructions.
- Known limitations.

Only document features that actually exist.
Never expose secrets or invent functionality.
```

---

# Final Priorities

> [!important] What Matters Most  
> The goal is not to build the biggest application. It is to demonstrate that you can make sound engineering decisions, use DeepSpace effectively, and ship a working product.

|Priority|Feature|Importance|
|---|---|---|
|1|Authentication + RBAC|Critical|
|2|Decisions, voting, arguments|Critical|
|3|Real-time sync + presence|High|
|4|AI decision memo|High|
|5|CronRoom automation|High|
|6|Slack delivery|High|
|7|Gmail delivery|Medium|
|8|Advanced analytics|Skip|

## Personal Engineering Checklist

- I understand the application architecture.
    
- I understand every DeepSpace integration I used.
    
- I can explain the database schema.
    
- I can explain the authorization model.
    
- I can explain how real-time updates work.
    
- I can explain how AI generates decision memos.
    
- I can explain how CronRoom processes deadlines.
    
- I can debug an integration failure.
    
- I can explain the main tradeoffs.
    
- I can modify the application without relying entirely on Copilot.
    

**Final objective:** Ship a small, polished, multi-user decision platform that demonstrates real technical understanding of the DeepSpace SDK.