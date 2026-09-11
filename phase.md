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
- [ ] Browser play-test cameras, controls, food, environment, neural connection, and reset.
- [ ] Verify launcher startup, port conflict behavior, Ctrl-C, and process cleanup.
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
Round 1 is in progress with the independent critic. Initial backend validation: 14 tests pass.
Frontend production build and TypeScript checks pass. Browser testing found missing external
texture atlases; fixed by embedding original textures into the downloaded GLBs.
