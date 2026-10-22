# Let's Do — Agent Development Instructions

## Project
Let's Do is a personal daily planner and progress-tracking application.

Tagline: Plan it. Do it. Feel good.

## Technology
- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend (planned): Python, FastAPI
- Database (planned): PostgreSQL
- Authentication (planned): Supabase Auth

## Agent Workflow
1. Read this file before starting any task.
2. Inspect the existing implementation and relevant files.
3. Explain your findings and proposed changes.
4. **Wait for explicit user approval before modifying files.**
5. Implement only the approved requirements.
6. Run relevant linting, type checks, and tests after implementation.
7. Summarize changed files, functionality, test results, and known limitations.

## Boundaries
- Do not run Git commands that change repository history or branches.
- Do not commit, push, merge, or create pull requests.
- Do not access GitHub or external accounts.
- Do not modify unrelated files.
- Do not install dependencies without approval.
- Do not introduce unnecessary frameworks or infrastructure.
- Never expose or commit credentials, secrets, or `.env` files.
- Ask before making architectural changes.

## Code Quality
- Use TypeScript with clear types.
- Build reusable React components.
- Keep components focused and maintainable.
- Use accessible, responsive UI patterns.
- Validate user input and handle errors.
- Avoid unnecessary duplication.
- Add tests for meaningful business logic.
- Document non-obvious implementation decisions.

## Naming Standards
- Use descriptive, meaningful, human-readable names.
- Follow established TypeScript, React, Python, and Git naming conventions.
- Use PascalCase for React components and types/interfaces.
- Use camelCase for variables, functions, and hooks.
- Use descriptive filenames appropriate to their contents.
- Avoid vague abbreviations, single-letter names, and misleading names.
- Allow established, contextually clear short names.
- Prefer clarity and maintainability over short names.
- Keep terminology consistent across components, APIs, and tests.

## Product Design
- Positive, motivating, user-friendly experience.
- Mobile-first responsive layout.
- Seven rotating weekday color themes.
- Accessible contrast and consistent status colors.
- Keep the interface simple without sacrificing functionality.

## Completion Requirements
Before reporting completion:
- Verify the implementation against approved requirements.
- Run relevant checks once the work is complete.
- Report failures honestly.
- Identify unfinished or placeholder functionality.
