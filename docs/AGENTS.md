# Documentation Agent Instructions

## Package Identity
- Mintlify documentation source for docs.x402.org
- MDX/Markdown files with `docs.json` as navigation configuration

## Directory Structure
- `core-concepts/` — Protocol explanations (HTTP 402, client-server, facilitator, wallet)
- `getting-started/` — Quickstart guides for buyers and sellers (MDX files with tabs)
- `guides/` — How-to guides (MCP server, v1→v2 migration)
- `README.md` — Welcome/landing page
- `docs.json` — Mintlify navigation and configuration

## Code-to-Doc Mapping
- Changes to `typescript/packages/core/src/` affect Core Concepts docs
- Changes to `typescript/packages/*/src/` affect SDK references and quickstart guides
- Changes to `python/x402/src/` affect Python SDK references
- Changes to `go/` affect Go SDK references
- Changes to facilitator endpoints affect quickstart guides
- Changes to `specs/` may require updates to core-concepts docs

## Style Guidelines
- Use TypeScript for primary code examples (it's the reference SDK)
- Include error handling in all API examples
- Write for developers with 2-5 years experience
- Use MDX components (`<Tabs>`, `<Tab>`, `<Callout>`, `<Card>`) for interactive content
- Show both success and error response examples for API endpoints
- Use real-world parameter values in examples (not foo/bar placeholders)

## Conventions
- DO: Add new pages to `docs.json` navigation
- DO: Include code examples from real SDK files (not made-up snippets)
- DO: Link to relevant specs in `specs/` for protocol details
- DO: Use `<Tabs>` for multi-language code examples
- DO: Add frontmatter (title, description) to all pages
- DON'T: Duplicate protocol details from `specs/` — link instead
- DON'T: Add pages without updating `docs.json`
- **Git: Create PRs for review; NEVER commit directly to main**

## Touch Points / Key Files
- `README.md` — Landing page
- `docs.json` — Navigation and configuration (MUST update when adding pages)
- `core-concepts/*.md` — Conceptual documentation
- `getting-started/*.mdx` — Quickstart guides (MDX for tab components)
- `guides/*.md` — How-to guides

## File Extensions
- Use `.md` for standard markdown pages
- Use `.mdx` for pages with React components (Tabs, Cards, etc.)

## Common Gotchas
- `docs.json` controls Mintlify navigation; pages not listed won't appear
- Images/diagrams go in project root `static/` directory
- Code examples should reference actual SDK file paths
- Links between pages should omit file extensions (e.g., `../core-concepts/http-402` not `../core-concepts/http-402.md`)

## Pre-PR Checks
- All links work (no broken references)
- New pages added to `docs.json` navigation
- Code examples are from actual SDK files and compile
- Frontmatter present on all pages (title, description)
- MDX syntax is valid (run `mint dev` to verify)

## Agent Behavior Rules (Automated Workflows)

When triggered by GitHub Actions or other automated workflows:

### DO
- ONLY update documentation directly related to the specific code changes
- Focus on the files and commits mentioned in the trigger
- Update SDK references if API signatures change
- Update quickstart guides if SDK usage patterns change
- Update core-concepts if protocol behavior changes

### DO NOT
- Perform general documentation audits or sync operations
- Add documentation for ecosystem partners not mentioned in the code change
- Add documentation for features unrelated to the trigger
- Create PRs for trivial changes (comment removal, formatting, etc.)
- Sync ecosystem partner data from `typescript/site/app/ecosystem/` unless explicitly changed

### Code-to-Doc Mapping (for automated updates)

| Code Change | Doc Update Required |
|-------------|---------------------|
| `typescript/packages/*/src/*.ts` API changes | SDK reference, quickstart guides |
| `python/x402/src/*.py` API changes | Python SDK reference |
| `go/*.go` API changes | Go SDK reference |
| `java/src/**/*.java` API changes | Java SDK reference |
| `specs/*.md` protocol changes | core-concepts docs |
| Comment removal, formatting | NO update needed |
| Test file changes | NO update needed |
| Build/CI config changes | NO update needed |
| Ecosystem partner metadata only | NO update needed (site handles this) |

### When to Skip (No PR)

If the code changes are limited to:
- Removing or adding code comments
- Formatting/style changes (prettier, linting)
- Test files only (`*.test.ts`, `__tests__/`, etc.)
- CI/build configuration only (`.github/`, `turbo.json`, etc.)
- Dependency updates without API changes (`package.json`, `go.mod`, etc.)
- Ecosystem partner metadata (`typescript/site/app/ecosystem/partners-data/`)

Then report "No documentation updates needed" and **do not create a PR**.
