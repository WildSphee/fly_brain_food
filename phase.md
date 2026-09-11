# Fly Kitchen — implementation tracker

Work stays on `master`. Commits use the existing user identity only, without co-authors.
Application processes run only for bounded testing and are stopped afterward. `./start.sh`
is the user's single entry point; it accepts no arguments and owns only its children.

## Phase 1 — foundations and research
- [x] Initialize Git on master and confirm the user's configured commit identity.
- [x] Inspect the supplied README and preserve existing secrets in ignored `.env`.
- [x] Locate primary MaleCNS data, published neural equations, and free 3D asset sources.
- [x] Record scientific assumptions, source attribution, and explicit fidelity limits.
- [x] Set up Python/FastAPI/Pydantic/Poetry and React/TypeScript/Three.js/Rapier.
- [x] Create no-argument launcher with configurable ports, conflict checks, and scoped cleanup.

## Phase 2 — actual connectome and simulation service
- [x] Import and cache a real MaleCNS circuit with IDs, annotations, transmitter predictions, and synapse counts.
- [x] Implement reproducible sparse LIF dynamics, refractory periods, synaptic delay, and signed weights.
- [x] Implement explicit sensory encoders and descending-neuron motor readouts.
- [x] Stream neural telemetry and motor commands; expose circuit provenance and error states.
- [x] Test neural propagation, inhibition, schema validation, and service/session isolation.

## Phase 3 — interactive kitchen
- [x] Compose a detailed kitchen using downloaded, attributed free 3D assets.
- [x] Add fly model, wing/leg animation, collisions, gravity, flight, and landing.
- [x] Add first-person, third-person, and fixed/orbit camera modes.
- [x] Add food placement/removal, feeding, hunger/energy, and manual/autonomous controls.
- [x] Add window, sunlight/shadows, day/night, temperature, hot/cold zones, and light/odor fields.
- [x] Add polished responsive controls, live telemetry, neural activity view, help, and reset.

## Phase 4 — verification and critic loop (at most four rounds)
- [x] Build/type-check frontend and run backend tests.
- [x] Browser play-test cameras, controls, food, environment, neural connection, and reset.
- [x] Verify launcher startup, port conflict behavior, Ctrl-C, and process cleanup.
- [ ] Independent critic round 1: ranked issues and 0–10 scores from code, play, realism, and integration viewpoints.
- [ ] Address findings and repeat critic review if needed (maximum four rounds).
- [ ] Record final scores honestly; pass requires >=8.5 and no errors.
- [ ] Finish documentation, update all status items, commit, and stop all owned test processes.

## Scope and scientific limits
This is an interactive experimental simulation, not a validated reconstruction of fly behavior.
The loaded circuit size and exact provenance must be shown. No generated or placeholder neural
graph may be represented as MaleCNS. Sensory encoding, flight mechanics, and motor decoding
are explicit modeling assumptions. No LLM is needed for the neural simulation.

## Review log

### Verification before critic round 1
Backend: 15 pytest tests pass. Frontend: TypeScript build clean (now type-checking the e2e
suite too). Browser: 18 Playwright tests pass against a real launcher-started instance.
Earlier browser testing found missing external texture atlases; fixed by embedding the
original textures into the downloaded GLBs.

The readme documented `npm run test:e2e`, but no Playwright config or specs existed. Added
`frontend/playwright.config.ts` and an 18-test suite covering habitat load, all four cameras
by click and keyboard, pause/resume, manual flight, food placement and removal, environment
and overlay controls, reset, phone-width layout, neural connection and provenance, live
telemetry, silencing, the circuit and log views, JSON export, and dialogs. Console and page
errors fail the tests. `scripts/test_browser.py` runs it against a temporary instance on free
ports and always stops it, so it never collides with a running copy or leaves a process behind.

### Finding: the driven circuit is self-sustaining and saturated
Measured while play-testing sensory gain. The bounded subgraph is excitation-dominant
(3,282,695 excitatory against 1,560,868 inhibitory synapses, ~2.1:1). From rest it is silent,
but once driven it holds a self-sustaining state: sensory gain at zero leaves ~83% of the mean
rate (~47 Hz to ~39 Hz) with descending output still near 23 Hz, and ~960 neurons fire at a
median ~165 Hz up to ~420 Hz against a 454 Hz refractory ceiling. Those rates are not
biologically plausible and indicate runaway recurrent excitation.

Reported rather than tuned away: rescaling weights would abandon both the measured synapse
counts and the published reference parameters. Now covered by a regression test, and disclosed
in docs/science.md, the readme, and the in-app "About the model" dialog. Silencing remains the
one intervention that clears the state.
