# Pulse for Arc

Pulse is served as the approved static prototype in `public/pulse`: HTML, CSS, and the original JavaScript modules. `app/` contains the invisible Next.js shell and API route stubs; `lib/` contains request/response schemas and runtime environment validation.

## Run

Use the project package manager to install dependencies, then run the Next.js development server and open `/`.

## Backend seams

The future implementation seams are documented in `AGENTS.md`: payment and sign-in in `public/pulse/js/app.js`, contract scans in `public/pulse/js/contracts.js`, token scans in `public/pulse/js/sim.js`, and removal of `window.__arc` before public deployment. Current scan routes intentionally return HTTP 501.
