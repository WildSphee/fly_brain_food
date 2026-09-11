# Fly Kitchen

An interactive 3D kitchen with a real MaleCNS connectome circuit, live neural telemetry,
physical flight, editable food sources, and first/third-person and fixed/orbit cameras.
React + TypeScript + Three.js + Rapier frontend; Python + FastAPI + Pydantic + Poetry backend.

## Start

```bash
./start.sh
```

No arguments. Open **http://localhost:5176** (or this VM's hostname/IP and the configured
frontend port). Ctrl-C stops and reaps the two application children. The launcher never
kills processes by name or port, creates no daemon, and does not configure nginx.
Occupied ports cause a clear failure before either service starts.

Requires Python 3.11–3.14, Node.js 20.19+ or 22.12+, npm, and Python venv support.
On first launch, missing Poetry and application dependencies are installed locally.
Subsequent launches use the local environments. Initial dependency installation needs
internet; the application, circuit snapshot, fonts, and 3D assets then run locally.

## Settings

Copy `.env.example` to `.env` if needed (the launcher does this for a new checkout).
Existing `.env` values are preserved and the file is ignored by Git.

| Key | Default | Purpose |
|---|---|---|
| FRONTEND_PORT | 5176 | Browser entry point |
| BACKEND_PORT | 8106 | FastAPI service; frontend proxy follows this value |
| FRONTEND_HOST | 0.0.0.0 | Frontend bind address |
| BACKEND_HOST | 127.0.0.1 | Backend bind address |
| NEUPRINT_API_KEY | empty | Required only to refresh the supplied real circuit |
| NEUPRINT_DATASET | male-cns:v1.0 | Dataset used by the explicit import script |
| NEURAL_SEED | 42 | Reproducible, independent session seed |
| MAX_SESSIONS | 4 | Concurrent neural WebSocket sessions |
| DATA_DIR | .data | Reserved local runtime data directory |

Restart `./start.sh` after changing ports. There is one backend worker; each browser has
its own neural state. Secrets are never exposed to the frontend. No database or LLM is
needed. No LLM calls or mock LLM outputs exist.

## Play

- Drag/scroll in Orbit. Camera shortcuts: **1** Orbit, **2** Follow, **3** Fly eye, **4** Fixed.
- Choose **Manual**: W/S forward/back, A/D turn, E/Q up/down, F land/takeoff.
- **Space** pauses/resumes. **Reset experiment** restores the habitat and neural seed.
- Adjust time, sunlight, room temperature, stove, fridge, window, and kitchen light.
- **Add food** chooses a model; click a horizontal surface to place it. Escape cancels.
- Odor, thermal, and light overlays reveal approximate fields. Flight trail shows recent motion.
- **Silence all neurons** tests whether autonomous motion depends on neural output.
- **Neural circuit** displays actual measured edges. Select a node to inspect its ID.
- **Experiment log → Export experiment** saves options, provenance, world state, telemetry,
  and the bounded event log as JSON. State is session-local; reloading starts a new experiment.

## Scientific scope

The local snapshot contains **4,390 neurons, 251,004 directed connections, and 5,202,110
synapses**, including **259 descending neurons**. This is a bounded real MaleCNS circuit,
not the entire CNS. LIF dynamics use structural synapse counts and transmitter signs.
The sensory encoders, motor readout, body scale, flight controller, and environment fields
are explicit approximations. This is not a validated reconstruction of fly behavior.

See [model equations, sources, and limitations](docs/science.md),
[asset credits](docs/assets.md), and [feature/review tracker](phase.md).
The UI also exposes provenance and limitations through **About the model**.

## Develop and verify

```bash
# Use the locally installed Poetry, or an existing poetry executable
.cache/poetry/bin/poetry install
.venv/bin/python -m pytest -q
cd frontend
npm ci
npm run build
# With ./start.sh temporarily running in another terminal:
npm run test:e2e
```

The first browser test run needs `cd frontend && npx playwright install chromium`.
`python3 scripts/test_launcher.py` runs a bounded launcher test on two temporary ports,
checks that an occupied-port launch leaves the first process intact, and verifies SIGINT
cleanup. It cleans up its own processes. Do not leave temporary app servers running.

Refresh data explicitly with `.venv/bin/python scripts/import_connectome.py`. This performs
read-only neuPrint queries using the server-side credential and atomically replaces the
public snapshot; it does not fabricate missing data. Download/processing is outside the
normal startup path. `python3 scripts/fetch_assets.py` reproduces local model assets.

Work stays on `master`; commit authorship uses the user's existing Git identity only.
Review outcomes, unfinished limitations, and the maximum four-round critic loop are in
[phase.md](phase.md).

---

## Original supplied source notes (preserved)

Python
R
The neuprint-python package provides a Python interface to the neuPrint API.

pip install neuprint-python
Next, go to neuPrint and create an account. Follow these instructions for getting your API token.

from neuprint import Client
client = Client("https://neuprint.janelia.org", dataset='male-cns:v1.0', token=token)

# Get neuron annotations and neuropil innervation
from neuprint import fetch_neurons
neurons, syndist = fetch_neurons("DNge104")

# Get connectivity
from neuprint import fetch_adjacencies
outgoing_edges, neuron_info = fetch_adjacencies("DNge104")
incoming_edges, neuron_info2 = fetch_adjacencies(None, "DNge104")
For more examples, please see the neuPrint Github repository.

If you want to work with neuron morphology, consider using navis. It wraps the neuprint-python interface and adds functions to read skeletons and meshes as navis objects which you can then use for visualization and analysis:

pip install navis[all]
>>> import navis
>>> import navis.interfaces.neuprint as neu
>>> client = Client("https://neuprint.janelia.org", dataset='male-cns:v1.0', token=token)

>>> skels = neu.fetch_skeletons(neu.NeuronCriteria(type="DNge104"))
>>> skels
<class 'navis.core.neuronlist.NeuronList'> containing 2 neurons (779.2KiB)
            type       name      id  ...  cable_length soma        units
0  navis.TreeNeuron  DNge104_R   12781  ...    1558673.00   10  8 nanometer
1  navis.TreeNeuron  DNge104_L  556329  ...    1690152.25    3  8 nanometer

>>> fig, ax = navis.plot2d(skels, view=('z', 'x'), radius=True)


Please see the navis neuPrint tutorial for more examples. Also check out the flybrains extension package and the corresponding tutorial for transforming spatial data (such as skeletons or meshes) between male CNS space and other common Drosophila template spaces.



This project is a collaboration between FlyEM (HHMI Janelia), the University of Cambridge (Dept. of Zoology), the MRC Laboratory of Molecular Biology, and Google Research.

FlyEM Logo
Cambridge Logo
MRC LMB Logo
Google Research Logo
The Male CNS dataset is licensed under CC-BY.

