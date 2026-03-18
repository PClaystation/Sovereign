# Sovereign

Sovereign is a desktop system control center built under the Continental umbrella. The current milestone delivers a real Electron + React + TypeScript foundation with a polished dashboard, live system telemetry, a lightweight watchdog layer, a local event store abstraction, and typed IPC between the Electron main process and renderer.

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
- a top processes table fed from the main-process telemetry service
- process launch monitoring with explainable path heuristics for temp, Downloads, and AppData-style locations
- startup item inventory and change detection on Windows
- scheduled task summaries and change detection on Windows when readable
- Defender and firewall status reads on Windows when readable
- a filterable recent-events timeline and event detail panel with evidence and recommended action
- a persisted local event store abstraction for watchdog history
- strongly typed IPC contracts shared between Electron main and renderer
- a platform adapter boundary so Windows-specific collectors can grow without leaking into the UI

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
- `src/main/platform` contains platform adapters for system telemetry collection.
- `src/main/services/dashboardService.ts` refreshes live snapshots on a timer and broadcasts updates.
- `src/main/store` contains the local event store abstraction and JSON-backed implementation.
- `src/main/ipc/registerIpc.ts` wires typed IPC handlers to services.

### Shared contracts

- `src/shared/models.ts` defines the core data models for metrics, processes, events, services, startup items, and future fix-action results.
- `src/shared/ipc.ts` centralizes IPC channel names and request/response types.

### Renderer

- `src/renderer/src/App.tsx` owns the dashboard shell and live state subscriptions.
- `src/renderer/src/components` renders the summary cards, process table, and timeline.
- `src/renderer/src/utils/formatters.ts` keeps display formatting out of the components.

## Local persistence

The current build uses a JSON-backed event store in the Electron main process. The file is created under Electron's `userData` directory so watchdog history can persist across launches without introducing a heavier database before the schema settles.

## Notes and current limitations

- Windows is the product target, but the app still includes non-Windows fallbacks so development can run on macOS and Linux. Windows-only watchdog sources emit transparent informational events when they are unavailable off-platform.
- Startup item monitoring currently uses `Win32_StartupCommand`, which may not expose every disabled startup entry.
- Scheduled task summaries rely on `Get-ScheduledTask` and `Get-ScheduledTaskInfo`; some environments can limit or hide task details.
- Defender and firewall reads rely on local PowerShell cmdlets. If those cmdlets are unavailable or a different security product replaces Defender, Sovereign reports that limitation instead of pretending to know more.
- Severity is heuristic, not authoritative. Temp, Downloads, and AppData path matches are intentionally explainable signals, not proof of malicious behavior.
- Fixer tools, settings, and broader remediation workflows are not part of this milestone yet.
