# Scientific model and fidelity

## Data actually loaded

The bundled snapshot contains **4,390 real MaleCNS v1.0 neurons**, **251,004 directed
neuron pairs**, and **5,202,110 chemical synapses**. It is an induced subgraph, not a
whole CNS simulation. The original body IDs, cell types, side annotations, transmitter
predictions, and synapse counts are preserved. There are 259 descending neurons.

`scripts/import_connectome.py` selects ORN_DM1/DM2/VA2, LC4, and annotated gustatory
and thermosensory populations, expands three outgoing neighborhoods by total connection
strength (700/1000/900 new nodes), then retrieves induced connections with at least
three synapses. Expansion requires at least five synapses. This selection biases the
circuit toward strong paths and omits many recurrent and peripheral connections.
The complete query history is inside `backend/data/malecns-circuit.json.gz`.

Data source: [MaleCNS download and API documentation](https://male-cns.janelia.org/download/).
Credit: FlyEM/HHMI Janelia, University of Cambridge, MRC Laboratory of Molecular Biology,
and Google Research. Dataset license: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The downloaded records have been filtered and transformed into a simulation snapshot.
The SHA-256 checksum is recorded in `backend/data/manifest.json` and verified at startup.

## Neural dynamics

The model follows the uniform LIF formulation in
[Shiu et al.'s reference implementation](https://github.com/philshiu/Drosophila_brain_model),
independently implemented with NumPy/SciPy sparse matrices:

```
tau_m * dV/dt = V_rest - V + g
tau_s * dg/dt = -g
on a presynaptic spike, after delay: g_post += weight
weight = synapse_count * transmitter_sign * 0.275 mV
```

Rest/reset = −52 mV; threshold = −45 mV; membrane tau = 20 ms; synaptic tau = 5 ms;
refractory = 2.2 ms; propagation delay = 1.8 ms. Time step is 0.2 ms. Passive decay
uses the analytic solution. Each response advances 20 ms of neural time. External
Poisson events add 68.75 mV to stimulated, non-refractory cells. Differences from the
reference include a coarser step, refractory handling of input cells, continuous
conductance decay during refractory periods, and the selected MaleCNS subgraph.

Acetylcholine is positive; GABA, glutamate and histamine are negative. Unknown and
other transmitters produce zero modeled outgoing weight (424 neurons). This ignores
receptor-specific signs and neuromodulation. Synapse counts are structural measurements,
not calibrated physiological weights. No plasticity, training, or LLM is used.

### Measured limitation: the driven state is self-sustaining and saturated

The selection keeps the strongest outgoing paths, which leaves the subgraph
excitation-dominant: 3,282,695 excitatory against 1,560,868 inhibitory synapses
(about 2.1:1), plus 358,547 synapses with no modeled sign. Only about 16% of the
synapse mass comes from the sensory populations; the rest is intrinsic recurrence
whose inhibitory sources were largely truncated by the selection. The consequences
are measurable and covered by regression tests:

* From rest with sensory gain at zero the circuit stays silent (0 spikes).
* **At the default gain it ignites on its own.** Every sensory population has a
  spontaneous floor (ORNs 18 Hz, LC4 8 Hz, TRNs 4 Hz, gustatory 2 Hz, all times
  gain), so in an empty, dark, room-temperature kitchen the mean rate still climbs
  3 Hz → 38 Hz → 48 Hz within ~800 ms of neural time. The saturated state is the
  app's normal operating regime, not an edge case the user has to provoke.
* Once driven, roughly 960 neurons hold a self-sustaining state. Setting sensory
  gain to zero leaves about 84% of the mean rate (~50 Hz → ~42 Hz) with descending
  output still near 25 Hz, indefinitely. Sensory input modulates this state; it
  does not gate it.
* In that state the median rate of firing neurons is ~172 Hz and the maximum is
  **pinned at the 455 Hz refractory ceiling** (1 / 2.2 ms). **These rates are not
  biologically plausible** for central Drosophila neurons and indicate runaway
  recurrent excitation, not physiological persistent activity.

This is a property of an induced, strength-biased subgraph. The honest framing is
that whole-brain reference parameters were applied to a 4,390-node sample selected
for strongest outgoing paths, and the result is out of regime: the runaway is the
signature of truncated inhibition, not of faithfulness. It is reported rather than
hidden, and the **Silence all neurons** control is the intervention that actually
clears it.

The principled fix is to correct the *sampling* rather than the weights — pulling in
the neurons that supply inhibition onto the selected set, and enforcing bilateral
closure so each selected cell's contralateral partner is included. That would cost
nothing in fidelity and would also remove the laterality bias described below, at
the price of a larger graph and a longer import. It is not done here, and the
limitation stands.

## Sensory translation and decoding

| Channel | Input | Target | Limitation |
|---|---|---|---|
| Odor | Bilateral samples of analytic food plumes | Annotated ORNs | No receptor-specific odor chemistry or antennal fluid dynamics |
| Taste | Contact proximity to food | Broad gustatory population | Includes multiple sensory locations and unknown taste valences |
| Thermal | Local hot/cold field | 7 TRN_VP2 (hot), 7 TRN_VP3a/VP3b (cold) | Coarse uncalibrated receptor response |
| Visual | Environmental light | LC4 projection population | A brightness proxy, not a validated visual encoder |

The 11 `TRN_VP1m` neurons carried in the snapshot's thermosensory class are
hygrosensory (moisture), not thermoreceptors, and are **excluded** from the thermal
drive rather than being fed the cold signal.

The visual proxy is the weakest encoder and, ironically, the one that steers most.
LC4 participates in looming/escape processing, as shown in
[Dombrovski et al., *Synaptic gradients transform object location to action*](https://www.nature.com/articles/s41586-022-05562-8);
driving it with absolute luminance inverts its natural drive statistics. The code
does not reconstruct photoreceptors or compound-eye optics.

Bilateral sampling is taken ±0.085 world units apart, an ~85 mm antennal separation
against a real fly's ~0.3 mm. Like the enlarged body, this is scaled for playability
and is what makes any left/right gradient detectable at all.

### The decoder is engineered, and its measured sensitivity is limited

Descending firing rates do not map onto behavior on their own. The readout is a
hand-built controller, and two properties of this subgraph forced its design:

* **Forward** is `tanh((left + right − 40 Hz) / 38 Hz)`. The circuit's descending
  population sits around 61 Hz combined, so the earlier `tanh(sum / 25)` was pinned
  at 0.98 in *every* condition including zero sensory input — a constant, not a
  readout. The offset and scale place the operating band inside the responsive part
  of tanh. Below ~40 Hz combined the command is zero, so the fly does not fly during
  the first second of neural time while the circuit ignites.
* **Turn** is decoded from the deviation of the left/right balance from its own slow
  running mean (~50 updates), not from the raw difference. The snapshot contains 136
  right descending neurons against 122 left, with an 18% right-side excess of input
  synapse mass, because the expansion did not preserve bilateral symmetry. A raw
  readout emits a permanent +0.33 yaw that no sensory input caused. Subtracting the
  running mean makes the channel report *change* in balance instead of a sampling
  artifact.

Measured response, each condition applied after the decoder baseline has converged
(peak turn over 20 updates, seed 42):

| Condition | mean Hz | forward | peak turn |
|---|---|---|---|
| null | 48.6 | 0.555 | +0.159 |
| odor left | 51.1 | 0.521 | +0.087 |
| odor right | 51.6 | 0.529 | +0.164 |
| light left | 48.8 | 0.592 | −0.428 |
| light right | 47.7 | 0.500 | +0.789 |
| heat | 48.9 | 0.545 | +0.194 |
| cold | 50.0 | 0.535 | +0.436 |
| taste | 105.4 | 0.828 | −0.520 |

Read this honestly:

* Light produces a genuine, reproducible differential — left and right separate by
  1.22, and the sign reverses with the side. Thermal and taste move the output well
  clear of the null spread.
* **Odor does not steer.** Full-strength unilateral odor separates left from right
  by 0.077, which is below the ±0.16 spread of the null condition. Odor measurably
  raises population rate, but through this decoder it yields no reliable turning
  signal. If the fly appears to turn toward food, that is the engineered explorer
  and the physical approach, not olfactory navigation.

Side annotations do not establish turning direction, and these descending
populations are generic, not validated flight command cells.
[Descending network experiments](https://www.nature.com/articles/s41586-024-07523-9)
show that behavior involves interactions between descending populations.

### What moves the fly that is not the connectome

The body controller is engineered and several of its reflexes bypass the circuit
entirely. Stated plainly so no one credits them to the connectome:

* Altitude stabilisation, imminent-collision avoidance, and a small periodic
  exploratory turn (a sinusoid) gated by neural drive.
* **Thermal avoidance is a hard-coded rule** reading the raw sensor: above 0.25 heat
  or 0.3 cold the controller adds a turn directly, without consulting the TRNs.
* High local odor lowers the target altitude — again a direct sensor rule.
* The **feeding** command is `tanh(gustatory rate / 40) × raw taste sensor`, so it is
  a neural-times-sensor hybrid rather than a pure neural readout, and the world gates
  it again on physical proximity.
* `hunger` and `energy` are game variables. Nothing feeds them into any neuron; they
  gate flight and altitude in the controller only.

Food coordinates are never used as a steering target. Silencing neurons removes
autonomous drive; manual mode intentionally bypasses neural motor control.

## Body, room, and clocks

Rapier integrates a dynamic, continuously collision-detected body using gravity and
feedback forces at 60 Hz. The collision radius is enlarged to 12 mm, with visibly
enlarged wings/body. This aids interaction but is not biological scale. Leg geometry
and wing animation are illustrative. There is no articulated gait, wall adhesion,
or flapping-wing aerodynamic solver.

The room uses bounded analytic odor, light, and temperature fields; it is not a fluid
or heat-transfer solver. Rendered shadows and sensor illumination are not identical.
Day/night can run at one simulated hour per 30 world seconds. Pausing stops world and
neural clocks while permitting inspection.

**Neural time runs at roughly 0.2x world time, by design.** The client requests one
update every 100 ms and each update advances 20 ms of neural time, so the body moves
about five times faster than its brain. This is a deliberate ratio, not a symptom of a
busy VM: a single step costs ~60 ms of compute, so an unthrottled loop would still run
near 0.34x. Every closed-loop latency from sensor to descending output to force is
inflated by that factor, so any apparent tracking behavior happens at the wrong
timescale. Speed controls the world clock only; neural time is reported separately.

This is an experimental connectome playground. It makes no claim of validated fly
behavior, biological consciousness, or a complete organism emulation.
