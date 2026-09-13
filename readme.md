# Fly Matrix

An interactive 3D kitchen with a real MaleCNS connectome circuit, live neural telemetry,
physical flight, editable food sources, and orbit, follow, and fly-eye cameras.
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

- The right panel groups **Simulation**, **Environment**, and **Brain** settings. Use its chevron to minimize or expand it.
- The room starts with **two flies** in different locations and heights: one at 24% hunger / 92% energy, the other at 6% hunger / 100% energy. Their headings, cruise heights, pace, and exploration phases differ. **Add fly** creates up to 12. Select a fly in the left list or in the room to see its speed, height, energy, hunger, and flight-trail toggle beneath its entry.
- Drag a fly to move it through the camera plane; drag food to move it across the table, counter, or floor. Drag empty space to orbit and scroll to zoom.
- Click the pendant light, fridge, window, or stove to toggle them. The fridge doors animate and lit burners show flames. Flies stay inside even with the window open.
- Camera shortcuts: **1** Orbit, **2** Follow selected fly, **3** Fly eye. The Simulation tab also offers **0.5×**, **1×**, and **2×** room speed.
- The neural circuit drives flight. **Space** pauses/resumes; flies and food remain draggable.
- In Environment, choose a food icon then click a surface to place it. Escape cancels. Odor, thermal, and light overlays show approximate fields.
- **Neural circuit** opens a rotatable 3D view of 44 real MaleCNS neuron skeletons from the simulated circuit. Select a neuron to highlight its branches and connected neurons. Expand its measured links to inspect input/output directions and synapse counts, or follow a link to another neuron.
- The room has a dense binary-rain background with bright leading digits, frozen when paused and static with reduced-motion preferences.
- **Hunger** rises as the fly’s stomach empties and falls during feeding. Food seeking starts at **10% hunger** through a local odor-gradient controller gated by neural drive. Each fly can eat on its own food contact, including when unselected. Green/gold crumbs show eating. Food stays after a meal, then browns and shrinks over several minutes; additional meals accelerate rot.
- The stove has a wider heat zone. Heat, extreme cold, starvation, and hard impacts cost energy and produce orange/red hurt particles. Turning the stove off removes its heat.
- **Sunlight intensity** controls daylight, including ambient/fill light and the outdoor view. At zero the room is dark; the kitchen lamp remains independently switchable.
- **Record video** records the 3D camera view at 30 FPS. **Stop & save video** downloads WebM (or MP4 where supported). Recording runs in real time and excludes the interface.
- **Reset** restores two flies, the habitat, and the neural seed. The Brain tab keeps neural telemetry, silencing, sensory gain, and the circuit viewer. Scientific provenance and limitations are documented in `docs/science.md`.

Each fly has independent physics, exploration, energy, and stomach. The selected fly supplies sensory input to one shared neural circuit; all flies receive its motor output. Additional flies do not create independent connectome simulations. Room speed changes physical simulation time; neural integration retains its own clock.

Flies physically collide and share food; social sensing and courtship are not modeled.
Anatomical Flybody fly meshes and textured Poly Haven plants are bundled locally;
see [asset sources, licenses, and conversion details](docs/assets.md).

## Scientific scope

The local snapshot contains **4,390 neurons, 251,004 directed connections, and 5,202,110
synapses**, including **259 descending neurons**. This is a bounded real MaleCNS circuit,
not the entire CNS. LIF dynamics use structural synapse counts and transmitter signs.
The sensory encoders, motor readout, body scale, flight controller, and environment fields
are explicit approximations. This is not a validated reconstruction of fly behavior.

Two limitations are large enough to state here, both measured and regression-tested:

**The circuit saturates.** The subgraph is excitation-dominant, so it ignites on its own
within ~800 ms of neural time and then holds a self-sustaining state. Sensory gain at zero
still leaves about 84% of the firing rate and a running descending output, and firing rates
sit pinned at the 455 Hz refractory ceiling rather than at biologically plausible values.
Sensory input modulates the circuit; it does not gate it. **Silence all neurons** is the
control that actually clears it.

**Only some senses steer.** The motor decoder is engineered, not biological. Light produces
a genuine left/right differential (1.22 separation, sign reversing with side), and taste and
temperature move the output clearly. **Odor does not steer**: full-strength unilateral odor
separates left from right by 0.077, below the ±0.16 null spread. Odor raises population
firing but yields no reliable turning signal through this decoder. What you see when the fly
approaches food is the engineered odor-gradient controller and physics, not neural olfactory navigation. Several
reflexes — thermal avoidance, food seeking, feeding — are hard-coded rules reading
raw sensors, and `stomach`/`energy` are game variables with no link to any neuron.

See [model equations, sources, and limitations](docs/science.md),
[asset credits](docs/assets.md), and [feature/review tracker](phase.md).
The circuit viewer links to the original MaleCNS dataset and identifies the displayed anatomical sample.

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

Two bounded checks start their own temporary instance on free ports and stop it again,
so they never collide with a copy you are running and never leave a process behind:

```bash
python3 scripts/test_launcher.py   # startup, port-conflict refusal, Ctrl-C, child reaping
python3 scripts/test_browser.py    # the Playwright interaction and neural checks, app started and stopped
```

Do not leave temporary app servers running.

Refresh data explicitly with `.venv/bin/python scripts/import_connectome.py`. This performs
read-only neuPrint queries using the server-side credential and atomically replaces the
public snapshot; it does not fabricate missing data. Download/processing is outside the
normal startup path. `python3 scripts/fetch_assets.py` reproduces local model assets;
`python3 scripts/fetch_materials.py` reproduces local CC0 material maps.
`.venv/bin/python scripts/import_anatomy.py` downloads the bounded anatomical sample
using the server-side neuPrint credential; runtime anatomy loads from the local snapshot.

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
