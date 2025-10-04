# Copilot instructions for this repo

Use these project-specific rules to move fast. Prefer existing modules/types; don’t invent new protocols.

## Big picture
- Server-authoritative American Mahjong over WebSockets.
- WS server: `src/server/ws/server.ts` using message types in `src/server/ws/protocol.ts`.
- Game engine is server-only: `src/engine.ts` with helpers (`src/validation.ts`, `src/charleston.ts`, `src/wall.ts`, `src/tiles.ts`, `src/rng.ts`, `src/types.ts`).
- Client: React + Vite. WS hook at `src/client/ui/hooks/useWS.ts`, entry `src/client/main.tsx`.
- Provable fairness/audit scaffold: `src/fairness.ts`, storage adapter (stub) `src/audit-storage.ts`, REST router `src/fairness-api.ts`.

## Dev workflows
- Start WS server (builds TS then runs): `npm run start:ws` (PORT defaults 8080).
- Frontend dev server: `npm run dev` (Vite on 5173). Playwright spins both via `playwright.config.ts`.
- Tests: `npm test` (Jest via ts-jest; `tests/**/*.test.ts`). E2E under `tests/e2e` with Playwright.

## WebSocket protocol (use these shapes)
- Client handshake: send `{type:'auth'}` then `{type:'subscribe', tableId}` (see `useWS.ts`).
- Server snapshot then deltas: `{type:'game_state_update', full: GameState}` then `{ delta: { logsAppend: [Move] } }`.
- Actions: client sends `{type:'player_action', action: Move}`; server replies with `{type:'action_result', ok, error?, applied?}` and broadcasts a `game_state_update` on success.
- Always include `traceId` (UUID) and ISO timestamp (`nowIso()` helper).

## Engine and rules (conventions)
- Tiles are strings: '1C'/'5B'/'9D', winds 'N/E/S/W', dragons 'RD/GD/WD', flowers 'F1'..'F8', joker 'J' (see `src/tiles.ts`).
- Create game via `createGame(clientSeed, serverSecret, dealer)`; apply intents with `applyMove` (wraps `processMove`). Always push moves to `state.logs`.
- Dealing/walls: use `setupGame` (`src/wall.ts`) and deterministic `DeterministicRNG` (`src/rng.ts`). Keep Fisher–Yates.
- Validation: use `validateMove` (`src/validation.ts`). Never trust client state.

## Charleston specifics
- Sequence: First (Right → Across → Left), optional Second (Left → Across → Right), optional Courtesy (Across).
- Never pass jokers. Standard passes are exactly 3 tiles; last pass of each Charleston may allow 1–3 “steal” passes. See `src/charleston.ts`.

## Fairness/audit
- Seed commit/reveal: `commitServerSeed`, `verifyCommit` (in `src/fairness.ts`).
- Verifiable shuffle: `verifiableShuffle`; snapshots via `createGameStateSnapshot`; tamper-evident logs with `AuditLogger`.
- Persistence stub: `src/audit-storage.ts` (implement `executeQuery` if wiring SQLite).

## Adding features safely
- New Move: extend `Move` in `src/types.ts`, validate in `src/validation.ts`, mutate in `processMove` (`src/engine.ts`), append to `state.logs`, emit `action_result` + `game_state_update`.
- New WS message: add to `src/server/ws/protocol.ts`, handle in `src/server/ws/server.ts`, update client consumers.
- Shuffle/deal changes: only via `src/wall.ts`/`src/rng.ts` to keep reproducibility.
- Fairness: prefer primitives in `src/fairness.ts`; persist via `AuditStorage` when DB is connected.

## Pointers
- WS server/protocol: `src/server/ws/server.ts`, `src/server/ws/protocol.ts`
- Engine/rules: `src/engine.ts`, `src/validation.ts`, `src/charleston.ts`, `src/wall.ts`, `src/tiles.ts`, `src/rng.ts`, `src/types.ts`
- Fairness/audit: `src/fairness.ts`, `src/audit-storage.ts`, `src/fairness-api.ts`
- Client: `src/client/main.tsx`, `src/client/ui/hooks/useWS.ts`
