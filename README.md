# FreeCAD Studio

**Desktop GUI for the [freecad-automation](https://github.com/dooosp/freecad-automation) engine.**

Load a TOML config or import a STEP file, then run drawing generation, DFM analysis, tolerance stack-up, and cost estimation from a single interface. Built with Tauri 2, React 19, and Three.js.

![Tauri](https://img.shields.io/badge/Tauri-2-24C8D8?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-0.172-000000?logo=three.js&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-tested-6E9F18?logo=vitest&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

| Panel | What It Does |
|---|---|
| 3D Viewer | Interactive Three.js model viewer with orbit controls |
| Drawing Viewer | 4-view SVG engineering drawing with GD&T annotations |
| DFM Panel | Manufacturability analysis across machining, casting, sheet metal, 3D printing |
| Tolerance Panel | Fit recommendation + Monte Carlo stack-up simulation |
| Cost Panel | Material + machining + setup + inspection breakdown with batch pricing |
| Report Preview | Multi-page PDF report with configurable templates |
| Shop Profiles | Save/compare manufacturing shop configurations |
| STEP Import | Drag-and-drop STEP file import with feature extraction |
| Export Pack | Bundle model + drawing + reports into a single ZIP |
| Settings | FreeCAD path, output directory, default process configuration |

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **[freecad-automation](https://github.com/dooosp/freecad-automation)** cloned as a sibling directory (`../freecad-automation`)
- **FreeCAD** 0.21+ installed on Windows (for model generation)
- **Rust** toolchain (only if building the Tauri desktop binary)

### Development Mode (Browser)

```bash
git clone https://github.com/dooosp/freecad-desktop.git
cd freecad-desktop
npm install

# Start backend + frontend dev server
npm start
# -> http://localhost:1420
```

This runs the Express backend on port 18080 and Vite dev server on port 1420 with API proxy.

### Desktop Build (Tauri)

```bash
# Install Tauri CLI (if not already)
cargo install tauri-cli

# Build desktop app
npm run tauri build
# -> src-tauri/target/release/
```

---

## Architecture

```
src/                    React 19 frontend
  components/             20+ UI components (panels, modals, viewers)
  hooks/                  useBackend, useProjectState, useProfileState, useModalState
  contexts/               AppShellContext (global state)
  contracts/              Component interface contracts
  styles/                 CSS

backend/                Express API server
  routes/                 13 route modules (analyze, dfm, drawing, tolerance, cost, ...)
  lib/                    Caching, CSV export, pack builder, QA runner, SVG postprocess

src-tauri/              Tauri 2 (Rust) shell
  tauri.conf.json         Window config (1400x900, min 1000x700)
```

### Data Flow

```
React UI ──> Express Backend (port 18080) ──> freecad-automation CLI
               /api/*                            fcad create|draw|dfm|...
               13 route modules                  FreeCAD Python engine
```

The backend imports `runner.js` and `config-loader.js` directly from the sibling `freecad-automation` directory, executing FreeCAD Python scripts and returning results as JSON.

---

## API Routes

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/analyze` | POST | Run model analysis |
| `/api/drawing` | POST | Generate engineering drawing |
| `/api/dfm` | POST | DFM manufacturability check |
| `/api/tolerance` | POST | Tolerance analysis |
| `/api/cost` | POST | Cost estimation |
| `/api/report` | POST | Generate PDF report |
| `/api/step-import` | POST | Import STEP file |
| `/api/profiles` | GET/POST/PUT/DELETE | Shop profile CRUD |
| `/api/report-templates` | GET/POST | Report template management |
| `/api/export-pack` | POST | Bundle export (ZIP) |
| `/api/cache` | GET/DELETE | Analysis cache management |
| `/api/project` | GET/POST | Project save/load |
| `/api/diagnostics` | GET | System health check |

---

## Testing

```bash
# Unit + integration tests (Vitest, jsdom)
npm test

# With coverage report
npm run test:coverage

# Watch mode
npm run test:watch

# Smoke tests (end-to-end API validation)
npm run smoke:core

# Full verification (test + build + smoke)
npm run verify
```

CI runs via GitHub Actions: `desktop-ci.yml` (unit/build) and `report-smoke.yml` (smoke tests).

---

## Project Structure

```
freecad-desktop/
  src/                   # React frontend (components, hooks, contexts)
  backend/               # Express API server (routes, lib)
  src-tauri/             # Tauri 2 Rust shell
  public/                # Static assets
  scripts/               # CI helpers (smoke tests, report updater)
  artifacts/             # Smoke test outputs
  coverage/              # Test coverage reports
  vite.config.js         # Vite + Vitest config
  index.html             # Entry HTML
```

---

## Related

[freecad-automation](https://github.com/dooosp/freecad-automation) -- the CLI engine that powers all CAD operations. This desktop app is a visual wrapper around that engine.

---

## License

[MIT](LICENSE)
