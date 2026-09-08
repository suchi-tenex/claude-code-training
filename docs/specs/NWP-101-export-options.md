# SPEC · NWP-101 — Payments export: let ops choose columns and scope

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-101-export-options.md`

**Ticket:** [NWP-101](../tickets/NWP-101.md)
**Author:** Suchi Patel
**Status:** draft

## Problem

Dana's ops team exports the payments table several times a day, but the export is fixed: every column, current filter only. The card last-four ships in every file, so anything headed to a merchant gets hand-cleaned first — 3-4 hours a month, and a near-miss last quarter where an unedited file almost reached the wrong merchant.

## Current state

- `src/app/payments/page.tsx:68-76` — Export is a plain `<a href="/api/payments/export?{query}">`, `query` being whatever filters (`status`, `merchantId`, `search`, `page`) are active on screen. No JS, a normal browser download.
- `src/app/api/payments/export/route.ts:11-24` — `GET` calls `parseFilters`, then `sortPayments(filterPayments(filters), ...)` (the unpaginated half of the builder, since export must return every matching row). Its own doc comment already names this as the NWP-101 boundary: "the column set and the scope are fixed."
- `src/data/queries.ts` — `parseFilters` (18-36) is the one allowlist-validation point for query-string input; `filterPayments` (45-70) and `sortPayments` (72-85) are the shared builder used by both `GET /api/payments` and the export route. `filters.sort`/`filters.direction` exist but nothing in the current UI ever sets them.
- `src/lib/csv.ts` — **`toCsv(payments, columns = EXPORT_COLUMNS)` already accepts a column subset** (58-67); this half of the ticket is mostly plumbing, not new logic. `EXPORT_COLUMNS` (13-24) is the fixed default list, `cell()` (33-56) already isolates last4 (49-50) and money formatting (`formatMoney`, 51-52) per column. `exportFilename(date = new Date())` (69-71) produces `payments-YYYY-MM-DD.csv` with no scope/filter information.
- `src/lib/csv.test.ts` — existing coverage for `toCsv`'s column-subset behavior (32-36) and `exportFilename`'s date stamping (79-85); its own comment says NWP-101 "changes which columns ship, not how a cell is written, and these should still pass afterwards."
- The ticket says "Add an options dialog to the existing Export button" — there is no `Dialog`/`Checkbox` component in `src/components/`, but `src/components/Drawer.tsx` already wraps `@radix-ui/react-dialog` (Root/Trigger/Content/Close/Title) with the project's focus and overlay handling built in. That is the primitive to build the options UI on, per `components.md`: "Use what is here."

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| Validate anything from the client — column names included — against an allowlist before it reaches a query, a filename, or the store | `CLAUDE.md`, `api-routes.md`, ticket notes | An unvalidated column name reaching a query/filename is exactly the injection shape the ticket calls out |
| One query builder; a second filter path is a defect | `CLAUDE.md`, `api-routes.md` | Export and the JSON API silently drift on what counts as a match |
| Export must not become a client-side/current-page-only operation — the table is paginated | ticket notes | Ships the exact bug ("current page only") the ticket exists to prevent |
| Money is integer minor units; format once, at the edge, next to its currency code | `CLAUDE.md`, `money.md` | Cents drift; ticket's AC on this is already satisfied by `cell()`/`formatMoney` today — must not regress it |
| Dialogs must be operable: labelled inputs, accessible name, focus in/out, Escape closes | `components.md` | The options dialog becomes unusable for keyboard/screen-reader ops staff |
| Reject early and return; consistent error shape | `api-routes.md` | A zero-column request silently producing a header-only file instead of a clear 400 |

## Approach

Most of the server-side column-selection machinery already exists (`toCsv`'s `columns` param); the work is validating a `columns` query param against `EXPORT_COLUMNS` (mirroring how `parseFilters` already validates `status`/`sort`/`direction`), adding a `scope` param that the export route uses to decide whether to apply the active filters or ignore them, and building the options dialog on top of `Drawer` that talks to the export route entirely through query-string state — no new fetch/blob logic, Download stays a plain anchor so it keeps working as a normal browser download.

For the filename, the ticket's own example (`payments-disputed-2026-08-13.csv`) implies the slug reflects the *status* filter when scope is "current". Proposed rule, applied in this order: scope `all` → slug `all`; scope `current` with an active status filter → slug is that status; scope `current` with no status filter (merchant/search only, or nothing) → no slug, filename stays `payments-<date>.csv` exactly as it does today. This covers the one concrete example without inventing behavior for combinations the ticket doesn't specify — flagged below as a decision worth a quick look before building.

**Considered and rejected:** fetching the CSV client-side (via `fetch` + Blob) so the dialog could show a live preview. Rejected because it turns a simple, cache-friendly GET download into stateful client logic for no acceptance criterion that needs it, and it would have to reimplement the `content-disposition` filename behavior the platform already gives us for free.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/lib/csv.ts` | change | Add `EXPORT_COLUMN_LABELS` (human labels for the dialog), `parseColumns(param: string \| null): ExportColumn[]` (allowlist, dedupe, canonical `EXPORT_COLUMNS` order regardless of input order), extend `exportFilename(date = new Date(), slug?: string)` — date stays the first positional arg so the existing test keeps passing unchanged |
| `src/lib/csv.test.ts` | change | Extend with cases for `parseColumns` (valid subset, unknown column dropped, empty/missing input) and `exportFilename` with a slug |
| `src/app/api/payments/export/route.ts` | change | Parse `scope` (`all`/`current`, default `current`) and `columns` (via `parseColumns`); scope `all` ignores the active filters (`filterPayments({})`), scope `current` behaves as today; empty validated column list → `400` instead of an empty-body CSV; pass columns/slug through to `toCsv`/`exportFilename` |
| `src/app/payments/page.tsx` | change | Compute `allTotal` (`filterPayments({}).length`, reusing the shared builder) alongside the existing filtered `total`; replace the bare anchor with the new dialog component, passing filters, query, and both totals |
| `src/app/payments/export-options-dialog.tsx` | add | Client component built on `Drawer`: column checkboxes (last4 unchecked by default), scope choice (current filter / all payments, current default), row count for the selected scope, Download disabled when zero columns are checked, otherwise an anchor to the constructed export URL |

## Plan

1. **Extend `csv.ts`** (`parseColumns`, `EXPORT_COLUMN_LABELS`, `exportFilename` slug param) — done when: new unit tests in `csv.test.ts` pass under `npm test`.
2. **Update the export route** to validate `scope`/`columns`, branch on scope, 400 on empty columns — done when: `curl` against `/api/payments/export?columns=id,amount&scope=all` returns a two-column CSV covering every payment regardless of the on-screen filter, and `?columns=` (empty) returns `400`.
3. **Build `export-options-dialog.tsx`** and wire it into `payments/page.tsx` in place of the anchor — done when: clicking Export on `/payments` opens an accessible dialog (labelled checkboxes, Escape closes, focus returns to the trigger) with last4 off by default and "current filter" selected, showing the correct row count.
4. **Wire Download's disabled/href state** — done when: unchecking every column disables Download; checking a subset and downloading produces a CSV with only those columns; switching scope updates both the row count and the downloaded row set; the filename matches the slug rule above.
5. **Full pass**: `npm test`, then click through every acceptance criterion on `/payments` by hand.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Ops can choose columns; last4 off by default | Manual: open dialog, confirm last4 unchecked, toggle a column, download, inspect header row |
| Ops can choose scope (current filter default / all payments); row count visible before download | Manual: default is "current filter" with the on-screen count; switching to "all" updates the count to the unfiltered total |
| Filename reflects scope and date | Manual + `parseColumns`/`exportFilename` unit tests: filter to `disputed`, download, confirm `payments-disputed-<date>.csv`; switch to all-payments scope, confirm `payments-all-<date>.csv` |
| Amounts stay minor units internally, formatted once, currency in its own column | Already covered by existing `csv.test.ts` cases (32-36); confirmed unchanged since `cell()` isn't touched |
| Deselecting every column disables Download instead of an empty file | Manual: uncheck all, confirm Download is disabled (not just a broken link); route-level 400 covered by a `parseColumns`/route-level check for the empty-list case |
| Column names validated server-side, never interpolated into a query | `parseColumns` unit tests (unknown/invalid column names dropped, not passed through) |
| Server does not build the export from a paginated/client-side view | Unchanged: route still calls `filterPayments`/`sortPayments` directly, never `queryPayments`'s paginated result |
| Reuses the existing query builder | Unchanged: route still calls `filterPayments`/`sortPayments` from `src/data/queries.ts`, no second filter path added |
| Unit test covers the column serializer; `npm test` passes | `csv.test.ts` extended per above; full suite run before PR |

## Risks

- **Filename slug rule** is inferring intent beyond the ticket's single example — see Open questions.
- Scope "all" still returns every matching row unpaginated in one response, same as today's export; a very large store could mean a large in-memory CSV. Not new behavior, so not addressed here.
- Radix Dialog accessibility is easy to get subtly wrong by hand; mitigated by building on `Drawer.tsx`, which already wires focus/overlay/Escape behavior.

## Out of scope

- Persisting a user's column/scope preference across visits — not requested.
- Any sort or date-range controls in the dialog — `filters.sort`/`from`/`to` exist in the type but nothing in the current UI sets them; not touching that surface.
- NWP-203 (persistence) and NWP-201 (cards) — unrelated tickets.

## Open questions

- The filename slug rule above (status-only, current-scope) is my best reading of the one given example. If ops actually wants the merchant name or search term reflected too when scope is "current," say so before step 2 — it only changes a few lines in the route, but it changes what the tests in step 1 assert.
