# Sovereign

Sovereign is a desktop system control center built under the Continental umbrella. The current milestone delivers a real Electron + React + TypeScript desktop app with a polished multi-view dashboard, a lightweight watchdog layer, user-invoked fixer tools, local persistence for events and settings, and typed IPC between the Electron main process and renderer.

This milestone stays inside the safety boundaries from `AGENTS.md`:

- no code injection
- no stealth or persistence tricks
- no privilege escalation
- no malware-like behavior
- only safe user-space telemetry collection

## Current scope

The current app includes:

- a modern dashboard shell built for Windows 11-style desktop use
- live CPU, memory, disk, and network summary cards
- a synthesized posture overview with a score, dominant pressure summary, and recommended next steps
- a system profile panel for device, OS, kernel, CPU, memory, and last-boot context
- rolling trend graphs for CPU, memory, network throughput, and disk activity
- denser runtime statistics including uptime, session count, process census, per-core load, swap, and disk I/O
- workload breakdown visuals for the busiest CPU cores and top CPU/memory processes
- a top processes table fed from the main-process telemetry service
- process-path badges in the triage table for temp, Downloads, and AppData-style launches
- process launch monitoring with explainable path heuristics for temp, Downloads, and AppData-style locations
- startup item inventory and change detection on Windows
- scheduled task summaries and change detection on Windows when readable
- Defender and firewall status reads on Windows when readable
- a watchdog coverage panel that surfaces active, degraded, disabled, and unsupported monitor states
- per-monitor baseline capture details so empty watchdog views are explained instead of backfilled with fake events
- a filterable recent-events timeline and event detail panel with evidence and recommended action
- correlated watchdog summary events when multiple related changes point to the same subject or path
- richer watchdog event detail including rationale, confidence, first/last seen, occurrence count, subject path, and file-trust metadata when available
- event timeline search plus source-based filtering in addition to severity/category filters
- a settings view for severity thresholds, monitor toggles, timeline limits, and telemetry-summary preferences
- saved watchdog suppressions for known-safe paths or fingerprints, plus a toggle to show suppressed events
- theme preference controls for dark, light, or system rendering
- a live refresh-interval control that actually reconfigures dashboard polling after save
- safe temp cleanup with preview-first execution
- explicit process actions for opening file locations and ending processes
- explicit Windows service restart controls
- explicit startup item disable controls
- explicit startup item restore controls using local backup records
- a manual diagnostics refresh that re-polls both telemetry and watchdog providers
- a persisted action history log for repair and control actions, surfaced both in the dashboard and the actions workspace
- a persisted SQLite-backed local store for watchdog history, settings, and operator action history
- automatic migration of legacy JSON-backed settings, event history, and action history when those files already exist
- strongly typed IPC contracts shared between Electron main and renderer
- a platform adapter boundary so Windows-specific collectors can grow without leaking into the UI
- renderer-side tests for watchdog suppression matching and main-process tests for path heuristics

## Project structure

```text
.
├── AGENTS.md
├── README.md
├── package.json
└── apps
    └── desktop
        ├── electron.vite.config.ts
        ├── package.json
        ├── tsconfig.json
        └── src
            ├── main
            │   ├── index.ts
            │   ├── ipc
            │   ├── platform
            │   ├── services
            │   └── store
            ├── preload
            │   └── index.ts
            ├── renderer
            │   ├── index.html
            │   └── src
            │       ├── App.tsx
            │       ├── components
            │       ├── utils
            │       └── styles.css
            └── shared
                ├── ipc.ts
                └── models.ts
```

## Install

```bash
npm install
```

## Develop

```bash
npm run dev
```

This starts `electron-vite` in development mode, launches the Electron shell, and serves the React renderer with hot reload.

## Typecheck

```bash
npm run typecheck
```

## Test

```bash
npm run test
```

## Build

```bash
npm run build
```

This compiles the Electron main process, preload script, and React renderer into `apps/desktop/out`.

## Windows packaging

```bash
npm run package:win
```

This runs the production build and asks `electron-builder` to generate a Windows NSIS installer. Packaging is intended to be executed on Windows for the cleanest result.

## Architecture overview

### Main process

- `src/main/index.ts` boots the Electron window and background services.
- `src/main/fixer` contains user-invoked fixer actions and temp cleanup preview logic.
- `src/main/fixer` now also persists and broadcasts recent fixer results for the renderer action log.
- `src/main/platform` contains platform adapters for system telemetry collection.
- `src/main/services/dashboardService.ts` refreshes live snapshots on a timer, maintains a short rolling sample history for graphs, applies settings-backed thresholds to health summaries, and now reconfigures its timer when the saved refresh interval changes.
- `src/main/store` contains the local event/settings/action-history store abstractions and the SQLite-backed implementation used by the current build.
- `src/main/watchdog` contains explainable monitors and Windows command providers for watchdog reads, plus runtime coverage state for each feed.
- `src/main/ipc/registerIpc.ts` wires typed IPC handlers to services.

### Shared contracts

- `src/shared/models.ts` defines the core data models for metrics, rolling telemetry history, machine identity, processes, events, services, startup items, settings, monitor runtime state, and fix-action results.
- `src/shared/ipc.ts` centralizes IPC channel names and request/response types.

### Renderer

- `src/renderer/src/App.tsx` owns the navigation shell, live state subscriptions, and view orchestration.
- `src/renderer/src/components` renders the summary cards, posture/system profile panels, process/event details, settings controls, fixer panels, coverage panels, confirmations, and result toasts.
- `src/renderer/src/utils/formatters.ts` keeps display formatting out of the components.

## Local persistence

The current build uses a SQLite-backed local store in the Electron main process. The database is created under Electron's `userData` directory and persists watchdog history, operator action history, and local dashboard preferences across launches. If legacy JSON-backed settings, event history, or action history files already exist, Sovereign imports them into SQLite during startup instead of dropping that local history.

## Notes and current limitations

- Windows is the product target, but the app still includes non-Windows fallbacks so development can run on macOS and Linux. Windows-only watchdog sources emit transparent informational events when they are unavailable off-platform.
- Startup item monitoring currently uses `Win32_StartupCommand`, which may not expose every disabled startup entry.
- Startup item disable is only implemented for inventory sources that Sovereign can trace explicitly. Permission failures are surfaced instead of bypassed.
- Startup item restore only covers entries that Sovereign itself previously disabled and recorded in its local backup manifest.
- Scheduled task summaries rely on `Get-ScheduledTask` and `Get-ScheduledTaskInfo`; some environments can limit or hide task details.
- Defender and firewall reads rely on local PowerShell cmdlets. If those cmdlets are unavailable or a different security product replaces Defender, Sovereign reports that limitation instead of pretending to know more.
- Severity is heuristic, not authoritative. Temp, Downloads, and AppData path matches are intentionally explainable signals, not proof of malicious behavior.
- File-trust metadata relies on local Authenticode and version-info reads. Missing publisher or signature data should be treated as a transparency limit, not an automatic verdict.
- Temp cleanup only targets previewed top-level items in the current user temp root and skips newer files by design.
- Process termination, service restart, and startup disable can still fail because of Windows permissions or active file/service locks; those failures are returned directly to the UI.
- Monitor runtime status reflects what Sovereign itself could initialize or refresh during the current app session. It is not an independent guarantee that every Windows source is healthy outside the app.
- The current settings page controls thresholds, monitor toggles, and suppressions, but it does not yet expose scheduled-task tuning, signer allowlists, or Windows-specific exclusion lists.
