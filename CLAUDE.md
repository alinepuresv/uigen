# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UIGen is an AI-powered React component generator with live preview. Users describe components in natural language, and Claude generates them in real-time with visual preview. Built with Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, and SQLite via Prisma.

## Commands

- `npm run setup` — First-time setup: installs deps, generates Prisma client, runs migrations
- `npm run dev` — Dev server with Turbopack (http://localhost:3000)
- `npm run build` — Production build
- `npm run lint` — ESLint
- `npm run test` — Vitest unit tests
- `npm run db:reset` — Wipe and reapply database migrations
- `npx prisma generate` — Regenerate Prisma client after schema changes (outputs to `src/generated/prisma/`)

## Architecture

**AI Chat Flow:** Client chat UI → `/api/chat/route.ts` → Vercel AI SDK `streamText()` with Claude Haiku 4.5 → AI uses tools (`str_replace_editor`, `file_manager`) to create/edit files → results streamed back and applied to the virtual file system.

**Virtual File System:** All generated files live in-memory via `VirtualFileSystem` class (`src/lib/file-system.ts`). No disk writes. State is serialized as JSON to the database when projects are saved.

**State Management:** Two React contexts drive the UI:
- `FileSystemContext` — virtual FS state, file selection, tabs
- `ChatContext` — chat messages, project state, save/load

**Auth:** JWT-based with httpOnly cookies (7-day expiry). Server-only imports in `src/lib/auth.ts`. Middleware protects `/api/projects` and `/api/filesystem` routes.

**Database:** SQLite with Prisma. Schema defined in `prisma/schema.prisma` — reference it to understand stored data structure. Two models: `User` and `Project`. Messages and file data stored as JSON strings in Project.

**AI Tools** (in `src/lib/tools/`):
- `str-replace.ts` — view, create, str_replace, insert operations on virtual files
- `file-manager.ts` — rename, delete operations

**LLM Provider** (`src/lib/provider.ts`): Falls back to `MockLanguageModel` when `ANTHROPIC_API_KEY` is not set.

## Key Conventions

- Path alias: `@/*` maps to `src/*`
- UI components use shadcn/ui (Radix primitives) in `src/components/ui/`
- Icons from `lucide-react`
- All styling via Tailwind CSS — no hardcoded styles
- Prisma client generated to non-standard location: `src/generated/prisma/`
- API chat endpoint has 120-second timeout (`maxDuration = 120`)
- `node-compat.cjs` loaded via `NODE_OPTIONS` in dev and build for Node.js compatibility
- Tests use Vitest with jsdom environment and React Testing Library

## Development Best Practices

- Use comments sparingly — only comment complex code