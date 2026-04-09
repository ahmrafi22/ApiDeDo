# ApiDeDoo

ApiDeDoo is a lightweight, self-hosted, browser-based API client inspired by Postman.

## MVP Features

- Multi-workspace support with backend persistence
- Nested collections and request organization
- Request builder with:
	- HTTP methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
	- Base URL + path
	- Path variables
	- Query params with literal/variable source toggle
	- Headers with enable/disable and Bearer helper
	- Body modes: none, JSON, raw, form-data, x-www-form-urlencoded, XML, HTML
	- Pre-request and post-response scripts
- Workspace-level variables with template interpolation (`{{variableName}}`)
- Backend request execution engine with timeout and error handling
- Response viewer with status, time, size, pretty/raw tabs, copy response
- Request history and re-run from history snapshots
- Postman collection import/export compatibility (v2.1)
- Manual Save flow + draft autosave to DB
- Desktop-first UI (small screens show desktop-only message)

## Tech Stack

- Next.js 16 (App Router)
- React 19
- Prisma + MongoDB
- TypeScript
- Vitest for unit testing

## Project Structure

- `app/api/*`: backend route handlers
- `components/apidedoo/*`: UI components and workbench shell
- `lib/server/*`: modular backend services (normalization, execution, Postman conversion)
- `lib/client/*`: frontend API clients and utilities
- `lib/types/apidedo.ts`: shared app types
- `prisma/schema.prisma`: data models for workspaces/collections/requests/history
- `docs/scripting.md`: script API reference

## Data Models

Prisma models included:

- `Workspace`
- `Collection`
- `ApiRequest`
- `History`

All app state is persisted in MongoDB, with autosaved draft state for active requests.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Set `DATABASE_URL` in `.env`.

3. Sync schema and generate client:

```bash
npm run prisma:push
```

4. Start dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Tests

Run lint and tests:

```bash
npm run lint
npm run test
```

Run live JSONPlaceholder API coverage (GET/POST/PUT/PATCH/DELETE + filtering + nested routes):

```bash
npm run test:jsonplaceholder
```

Production build check:

```bash
npm run build
```

## JSONPlaceholder Workspace Bootstrap

This project includes a ready-to-import collection at `docs/jsonplaceholder-workspace.postman_collection.json`.

To create a new workspace and import that collection automatically through local API routes:

```bash
npm run workspace:jsonplaceholder
```

Optional environment variables:

- `APIDEDOO_BASE_URL` (default `http://localhost:3000`)
- `APIDEDOO_WORKSPACE_NAME` (default `JSONPlaceholder API Types`)

Example:

```bash
APIDEDOO_BASE_URL=http://localhost:3000 APIDEDOO_WORKSPACE_NAME="JSONPlaceholder QA" npm run workspace:jsonplaceholder
```

## Scripting

Script docs are in `docs/scripting.md`.

Use request scripts to read/write workspace variables with `pm.variables.*`.
