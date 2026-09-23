# kobus-blog

Kobus Taljaard's writing studio and public blog.

**Pipeline (studio, `/studio`, owner-only):** upload a transcript (`.md`) → background analysis splits it into one post per theme → edit each outline → generate a draft → free edit → final check (Claude Opus: AI-writing tells + errors, both must score 85+) → approve and publish.

**Public:** `/` (notebook cover + entries), `/writing/[slug]`.

Stack: Next.js (App Router) on Vercel · Neon Postgres (schema `app`) · Neon Auth magic link · Anthropic API. Env vars: see `.env.example`.
