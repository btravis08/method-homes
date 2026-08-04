---
description: Get up to speed with the SDR project — repo, Sanity, design system, workflows
---

Onboard yourself to this project, then report readiness:

1. Read AGENTS.md in full — it holds the project brief, working
   agreements, Figma/Sanity access details, architecture, and gotchas.
2. Confirm you're on branch `claude/sanity-github-app-setup-x49xa8` and
   pull the latest (`git status`, `git pull`).
3. Skim the load-bearing files so their patterns are in context:
   - src/app/globals.css (tokens, color modes, fluid type, root scaling)
   - src/components/home/sections.tsx and SliderShell.tsx
   - src/components/SectionRenderer.tsx
   - src/sanity/schemaTypes/sections.ts and product.ts
   - src/sanity/lib/queries.ts
   - scripts/seed.ts
4. Run `npm install` if node_modules is missing, then `npm run build`
   to confirm the tree is green (Sanity fetch failures during build are
   expected where *.sanity.io is unreachable — pages fall back).
5. Report back: current branch/commit, build status, and a two-sentence
   summary of the architecture, then ask what to work on.

Do not push anything during onboarding.
