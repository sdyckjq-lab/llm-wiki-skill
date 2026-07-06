# Pi Agent Runtime Notes

Read this only when changing workbench backend runtime integration, local API routes, event streaming, or pi-agent SDK wiring. Product direction and user-facing rules stay in `workbench/PRODUCT.md`.

## Conversation Flow

Endpoint names here are implementation notes; source code wins if they diverge.

1. User types a message, possibly with `@page` references or `/command` calls.
2. Frontend resolves references and commands with local backend routes such as `/api/refs` and `/api/commands`.
3. Frontend sends the expanded prompt to `/api/prompt`.
4. Backend calls the pi-agent session prompt API.
5. Backend subscribes to session events and forwards them to the frontend over SSE, such as `/api/events`.
6. Frontend renders streamed text, tool state, reference previews, and artifact previews.
7. User can trigger conversation-to-wiki sedimentation when the result should become a wiki page.

## Repository Shape

```text
llm-wiki/
├── package.json
├── node_modules/
│   └── @earendil-works/
│       └── pi-coding-agent/
├── workbench/
│   ├── server/src/
│   │   ├── index.ts
│   │   ├── agent.ts
│   │   └── extensions/
│   └── web/
└── packages/graph-engine/
```

Workbench code owns:

- the local HTTP/SSE wrapper around the SDK
- project-owned Extension code for current knowledge-base state
- the frontend UI

The npm dependency owns:

- agent runtime
- Skill loading
- event stream primitives
- model management
- session persistence

## Extension Injection

The pi-agent CLI can discover global extensions under `~/.pi/agent/extensions/*.ts`. The workbench is an SDK user and should not rely on global discovery. Keep workbench-owned extension code under `workbench/server/src/extensions/` and inject it explicitly into the session, so the project does not pollute the user's `~/.pi/` directory.

## Upgrade Rules

- Current pi-agent version is defined by `workbench/server/package.json` and the lockfile.
- Upgrade by changing the package version and running `npm install`.
- Do not edit `node_modules/`.
- If an emergency local patch is unavoidable, use `patch-package` so the upgrade path remains visible.
- Keep Node at `>=22.19.0`, using mise or nvm.
