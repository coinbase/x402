# Frontend Dashboard Design Plan

## Purpose
A concise, actionable design and implementation plan to completely revamp the A2A x402 demo dashboard UI. The goal is a modern, elegant, presentation-ready dashboard for demos that emphasizes clarity, motion, and a polished dark theme.

## Goals
- Presentable, modern, and elegant demo dashboard for live demos and screenshots.
- Dark background, white/near-white text, purple accents and subtle neutrals.
- Smooth micro-interactions (button clicks, tab changes, toast) using Motion.
- Clear hierarchy: left utilities/controls, center logs/primary content, right artifacts/details.
- Accessibility-first: sufficient contrast, keyboard focus states, aria attributes.

## Visual Language
- Theme: Dark (background: near-black / deep slate), foreground: white/near-white, accents: purple (#7C3AED or similar), secondary accents: teal/rose for statuses.
- Tone: Minimal, spacious, slightly rounded UI with subtle shadows and glassy panels.
- Typography: Primary - Inter/Manrope (san-serif) for UI; alternative fallbacks: Geist, IBM Plex Sans, Mona Sans. Use variable fonts where possible.
- Spacing: generous padding (16–24px), consistent 8px baseline grid.

## Tools & Libraries
- Styling: Tailwind CSS (existing), extend with shadcn/ui components and Radix primitives/themes for a11y and consistent patterns.
- Icons: Material Symbols, Heroicons, Lucide (install as needed; use consistent icon set for primary controls, accent icons from Lucide/Heroicons).
- Animations: Framer Motion (Motion) for button subtle scale/press, component entrance, tab transitions, and toast animation.
- Fonts: Load Inter (variable) and fallbacks; provide optional bundles for Manrope, IBM Plex Sans.
- Dev UX: Hot reload with Next.js (already present). Keep builds fast and optional tailwind JIT.

## Accessibility
- All interactive elements keyboard-focusable with clear focus rings.
- Sufficient contrast ratio for text and critical UI elements.
- Aria labels for live regions (logs), toast, and important actions.
- Reduced motion toggle (respect prefers-reduced-motion media query) for users who disable motion.

## Layout & Component Map
- Global layout: Header (top) with title + actions; left column: Controls (Start, Hard Refresh, Connection Diagram, AgentCard/Artifacts); main column: Logs (primary); right column: Details (artifacts, details card). On narrow screens, stack controls -> logs -> artifacts.

Components to implement/restyle (priority order):
1. `StartDemoButton` — animated, tactile button with purple gradient, loading state.
2. `LogViewer` — fixed-height scroll panel, monospace logs, filter toggle (Follow), syntax highlight for JSON blocks, no auto-scroll by default.
3. `ArtifactPanel` — tabbed panel with animated tab transitions, copy button with toast.
4. `ConnectionDiagram` — simplified icons with subtle motion on status changes.
5. `Toast` — improved design with animation and optional action (Open artifacts).
6. `Details` card — compact, styled info card with icons and action links.
7. Layout shell (`app/page.tsx`) — responsive grid, spacing, and polish.

## Motion & Interaction Patterns
- Buttons: subtle upward lift on hover, quick shrink on press (scale 0.98), focus ring visible.
- Tabs: fade + slide transition between tabs.
- Toast: slide in from bottom-right, with icon and auto-hide.
- Logs: fade-in for newly highlighted error lines when they first appear (if Follow enabled).
- Orchestrator start: show spinner and animated progress indicator while starting; on completion show success toast with link to artifacts.

## Implementation Plan (staged tasks)
Stage 1 — Design doc and scaffolding (this task)
Stage 2 — Theme setup
- Add Tailwind theme tokens for dark colors and purple accents.
- Add global CSS with font imports and base styles respecting `prefers-color-scheme`.
- Install shadcn/ui (or copy minimal components) and Radix primitives.

Stage 3 — Core layout and components
- Implement new layout in `app/page.tsx` with responsive grid.
- Replace LogViewer styles and integrate JSON pretty-printing (already updated).
- Restyle ArtifactPanel with animated tabs.

Stage 4 — Motion and interactions
- Add Framer Motion to animate StartDemoButton, tabs, toast, and subtle log highlights.
- Respect `prefers-reduced-motion`.

Stage 5 — Fonts and icons
- Add Inter (variable) via Google Fonts or local; include fallbacks.
- Add icons set and map icons to existing components.

Stage 6 — Polish & QA
- Ensure accessibility, keyboard navigation, color contrast.
- Small visual polish, shadows, spacing.
- Cross-browser checks and responsive checks.

## Acceptance Criteria
- Dashboard has a consistent dark theme with purple accents.
- Buttons and interactive elements have polished animations and accessible focus states.
- Artifacts auto-refresh on demo completion and toasts are visible.
- Log viewer is readable, formatted, and does not auto-scroll unless Follow enabled.
- Responsive at mobile/tablet/desktop widths.

## Deliverables
- `design.md` (this file)
- Tailwind theme tokens update in `tailwind.config.cjs`
- Reworked components under `components/` with Motion and shadcn/Radix primitives
- Updated `app/page.tsx` layout
- PR branch `feature/dashboard` containing all changes

## Timeline & Next steps
Next: implement Stage 2 (Theme setup). I will:
- Add Tailwind color tokens, dark theme variables, and font imports.
- Wire up a theme provider if needed and update base layout styles.

If that sounds good I'll begin Stage 2 now and open a focused todo for it.

---

Design author: Assistant (pair-programming with you). 