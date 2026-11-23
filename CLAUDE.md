See [AGENTS.md](./AGENTS.md).

# Council — Project Instructions

## Project Overview

Council is an asynchronous decision-making platform for small teams.

Users can create decisions, invite teammates, discuss options, vote, and generate AI-powered decision memos.

The application uses the DeepSpace SDK and should demonstrate effective use of its native capabilities.

## Primary Objective

Build and deploy a reliable, polished application within the five-day internship assignment.

Prioritize:
1. Correctness
2. Security
3. Working DeepSpace integrations
4. Maintainable architecture
5. User experience

Do not prioritize feature count over reliability.

## Engineering Rules

### DeepSpace SDK
- Consult official documentation before using SDK APIs.
- Inspect official examples where relevant.
- Never invent SDK methods, properties, or configuration.
- Prefer native DeepSpace capabilities over unnecessary custom implementations.
- Always stick to what DeepSpace provides. Do not add third-party services or APIs outside the SDK and its integrations (for example, email goes through DeepSpace's Composio Gmail integration, not a separate email provider).
- Document any uncertainty about SDK behavior.

### Architecture
- Keep components modular and responsibilities clear.
- Avoid unnecessary abstractions.
- Preserve existing working architecture unless a change is justified.
- Keep privileged operations server-side.

### Security
- Enforce authorization server-side.
- Never expose secrets in client-side code.
- Validate user input.
- Ensure users cannot access another team's decisions or data.

### Implementation Workflow
Before implementing a substantial feature:
1. Inspect the existing code.
2. Identify relevant files.
3. Check official documentation.
4. Explain the proposed implementation.
5. Identify edge cases and risks.
6. Implement incrementally.

After implementation:
1. Run relevant tests and checks.
2. Explain what changed.
3. List modified files.
4. Identify anything not verified.
5. Update project documentation when necessary.

### Collaboration Rules
- Do not make large unrelated changes.
- Do not rewrite working code without justification.
- Do not claim something works without testing it.
- Ask before making major architectural changes.
- Explain important tradeoffs.
- Help me understand the implementation, not just generate code.

## Scope

Stay focused on the internship assignment.

Do not introduce:
- Billing
- Advanced analytics
- Complex notification infrastructure
- Unnecessary microservices
- Features that do not improve the core decision-making workflow

## Definition of Done

A feature is complete only when:
- Its intended behavior works.
- Relevant error states are handled.
- Authorization is verified where applicable.
- Relevant tests or manual verification are completed.
- Documentation reflects the actual implementation.

# Council

**Core loop:** A team member creates a decision (“Which database should we use for the prototype?”), adds options, and invites collaborators. Teammates vote, leave structured arguments for and against, and see live presence. An AI summarizes the tradeoffs into a decision memo. When the deadline hits, a scheduled job closes voting and posts the memo to Slack and email.

**DeepSpace integrations used meaningfully:**

- **Auth + RBAC** — decisions are scoped to a team; only team members can vote or edit.
    
- **Real-time data sync + presence** — votes and arguments update live; you can see who is currently viewing the decision.
    
- **AI chat** — streaming summarization over the arguments, not a generic chatbot.
    
- **Slack `slack-send-message`** — delivers the final memo to a channel.
    
- **CronRoom** — closes voting automatically and triggers delivery.[](https://docs.deep.space/guides/background-jobs.md)[](https://docs.deep.space/guides/background-jobs)[](https://docs.deep.space/guides/scheduled-jobs#monitor-and-trigger-from-the-ui-usecronmonitor)