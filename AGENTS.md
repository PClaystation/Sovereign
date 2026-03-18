# AGENTS.md

## Project
Build **Sovereign**, a desktop system control center under the Continental umbrella.

Sovereign is a legitimate user-visible desktop app with three pillars:
1. **System awareness dashboard**
2. **Lightweight security watchdog**
3. **System fixer tools**

It is **not** an antivirus, rootkit, EDR, stealth agent, or “god mode” process.
It must stay transparent, user-controlled, and safe.

## Product goals
Sovereign should help the user:
- understand what the computer is doing
- spot unusual or suspicious behavior
- perform common repair/fix actions from one dashboard

The product should feel polished, modern, and practical enough for daily use.

## Platform scope
Initial target:
- Windows 11 desktop

Future-ready architecture:
- keep platform-specific logic behind adapters/services so Linux support can be added later

## Required tech choices
Use:
- Electron
- React
- TypeScript

Preferred structure:
- `apps/desktop` or equivalent Electron app root
- `src/main` for Electron main process
- `src/renderer` for React UI
- `src/shared` for shared types/contracts
- strongly typed IPC layer between renderer and main

Use a clean, modern UI.
Dark mode by default is fine.

## Non-goals / hard safety constraints
Do NOT implement any of the following:
- code injection
- kernel drivers
- stealth/persistence tricks
- hiding from Task Manager or system tools
- privilege escalation
- self-protection/tamper-war behavior
- automatic “fight back” or destructive countermeasures
- anything malware-like

If admin privileges are ever needed for a specific fix action, request them normally and only for that action.

## Core feature set

### 1. Dashboard
Implement a dashboard that shows:
- CPU usage
- RAM usage
- disk usage
- network activity
- top processes
- recent event timeline
- system health summary cards

The dashboard should answer:
- what is happening
- whether it looks normal
- what the user can do about it

### 2. Lightweight security watchdog
Implement user-space monitoring and event logging for:
- process launches
- executables launched from suspicious/common abuse paths such as temp, downloads, or appdata
- startup item changes
- scheduled task creation/changes if readable
- Windows Defender / firewall status changes if readable
- notable system changes that are available through safe user-space APIs

Create a severity model:
- info
- unusual
- suspicious

Rules should be heuristic and explainable.
No fearmongering and no fake certainty.

### 3. System fixer tools
Implement user-invoked actions with confirmation where appropriate:
- clean temp files safely
- kill selected process
- open process file location
- restart a selected Windows service
- disable a selected startup item
- re-check Defender / firewall status
- refresh diagnostics

All actions must be visible, confirmable, and reversible where possible.

## UX requirements
The UI should feel like a command center:
- clear cards
- charts
- process table
- event timeline
- details drawer or modal for selected items
- action buttons near relevant diagnostics

Keep the UI readable and not overcrowded.
No fake “hacker” styling.
Professional, modern, slightly futuristic is good.

## Architecture requirements
- keep collectors/monitors separate from UI
- use typed IPC
- avoid blocking the UI thread
- prefer background services/polling with clear intervals
- isolate platform-specific Windows code in dedicated modules
- make heuristics configurable from a central rules module
- use a local persistence layer for event history and settings

Preferred persistence:
- SQLite if practical
- otherwise a clear local JSON-based store with a clean abstraction

## Data model
Create models for:
- system metrics snapshot
- process info
- watchdog event
- startup item
- scheduled task summary
- service summary
- fix action result
- app settings

Each watchdog event should include:
- id
- timestamp
- category
- severity
- title
- description
- evidence/details
- recommended action

## Implementation order
Build in phases:

### Phase 1: foundation
- scaffold Electron + React + TypeScript app
- create layout shell
- set up typed IPC
- implement system metrics cards with live data
- implement top processes table
- implement local event store abstraction
- write README with run/build instructions

### Phase 2: watchdog
- add process launch monitoring
- add suspicious path heuristics
- add startup item reading
- add scheduled task reading if feasible
- add Defender/firewall status reads if feasible
- feed everything into the event timeline

### Phase 3: fixer tools
- add safe temp cleanup preview + execute
- add kill process action
- add open file location action
- add service restart action
- add startup item disable action
- add confirmation dialogs and result toasts

### Phase 4: polish
- improve visual design
- add filters for event timeline
- add detail panel for events/processes
- add settings page for thresholds and scan toggles
- add app icon/branding stub for Sovereign
- improve error states and empty states

## Quality bar
Before calling work complete:
- app must build
- app must run locally
- no placeholder features marked as done
- document known limitations honestly
- test changed code where reasonable
- prefer small working vertical slices over half-finished breadth

## Coding rules
- keep functions/modules reasonably small
- use TypeScript types everywhere practical
- avoid unnecessary dependencies
- comment only where it adds real clarity
- preserve clean naming and folder structure
- do not invent capabilities the OS APIs cannot actually provide
- if a Windows API/data source is flaky or unavailable, degrade gracefully and document it

## Verification
Whenever runtime code changes:
- run the project
- run typecheck
- run tests if present
- fix broken lint/type issues caused by the change

Do not mark work complete without verifying what was changed.

## Final output expectations
When finishing a milestone:
- summarize what was implemented
- list files added/changed
- list commands run
- list any limitations or follow-up work