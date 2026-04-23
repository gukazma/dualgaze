# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**DualGaze · 重眸** — generates close-to-surface flight paths for oblique photography, using a coarse 3D model and a sparse point cloud as input, to improve 3D reconstruction accuracy.

Front/back separated:
- **Frontend** (`frontend/`): Vue 3 + TypeScript + Vite
- **Backend** (`backend/`): C++17 + CMake + [cpp-httplib](https://github.com/yhirose/cpp-httplib) (pulled via `FetchContent`)

The repo is currently a minimal scaffold — only `/api/health` and `/api/ping` exist on the backend, and the Vue app calls `/api/ping` once on mount. Core flight-path generation (coarse-mesh ingestion, sparse-point sampling, path planning, export to flight-controller formats) is **not yet implemented**.

## Commands

### Backend (run from repo root)
- Configure: `cmake -S backend -B backend/build`
- Build: `cmake --build backend/build --config Release`
- Run (Windows/MSVC): `backend/build/Release/dualgaze_server.exe`
- Run (Linux/macOS): `./backend/build/dualgaze_server`

The first configure fetches cpp-httplib from GitHub via `FetchContent` — the build machine needs network access once. Subsequent builds are offline.

### Frontend (run from `frontend/`)
- Install: `npm install`
- Dev server: `npm run dev` — Vite on port 5173, proxies `/api/*` → `127.0.0.1:8080`
- Type-check + production build: `npm run build`
- Preview built bundle: `npm run preview`

No test runner is wired up yet for either side.

## Architecture

Key files to understand before making changes:

- `backend/src/main.cpp` — HTTP entry point and route registration. All endpoints live here for now; split into a routes module when it grows.
- `frontend/src/api/client.ts` — thin `fetch` wrapper. **All backend calls must go through this module.** Components should not call `fetch` inline.
- `frontend/vite.config.ts` — dev proxy config. New backend route prefixes need to be added here (or kept under `/api` to inherit the existing rule).
- `frontend/src/App.vue` — root component. Currently just demos the ping round-trip.

### Conventions worth preserving

- **Port and bind address** are hard-coded to `127.0.0.1:8080` in `backend/src/main.cpp`. If you change them, update the Vite proxy `target` in `frontend/vite.config.ts` to match.
- **API boundary at `/api/*`** — keep all HTTP endpoints under this prefix so the Vite dev proxy stays a single rule.
- **Frontend and backend build independently** — there is no monorepo task runner. Two terminals during dev: one `cmake --build` + run server, one `npm run dev`.

## Platform notes

Primary development environment is Windows. `backend/CMakeLists.txt` sets `NOMINMAX` and `WIN32_LEAN_AND_MEAN` on Windows to keep `cpp-httplib` compiling cleanly under MSVC. CMake picks up Visual Studio automatically; no presets are defined yet.
