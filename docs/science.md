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

Acetylcholine is positive; GABA and glutamate are negative. Unknown and other
transmitters produce zero modeled outgoing weight (426 neurons). This ignores
receptor-specific signs and neuromodulation. Synapse counts are structural measurements,
not calibrated physiological weights. No plasticity, training, or LLM is used.

### Measured limitation: the driven state is self-sustaining and saturated

The selection keeps the strongest outgoing paths, which leaves the subgraph
excitation-dominant: 3,282,695 excitatory against 1,560,868 inhibitory synapses
(about 2.1:1), plus 358,547 synapses with no modeled sign. The consequence is
measurable and is covered by a regression test:

* From rest with no sensory drive the circuit stays silent (0 spikes).
* Once driven, roughly 960 neurons enter a self-sustaining state. Setting sensory
  gain to zero leaves about 83% of the mean rate (≈47 Hz → ≈39 Hz) and descending
  output near 23 Hz, indefinitely. Sensory input modulates this state; it does not
  gate it.
* In that state the median rate of firing neurons is ≈165 Hz, reaching ≈420 Hz
  against a 454 Hz refractory ceiling. **These rates are not biologically plausible**
  for central Drosophila neurons and indicate runaway recurrent excitation, not
  physiological persistent activity.

This is a property of an induced, strength-biased subgraph driven by uniform
structural weights. It is reported rather than tuned away, because rescaling the
weights would abandon both the measured synapse counts and the published reference
parameters. It bounds what the demo can claim: motor output is not a clean readout
of current sensory input. The **Silence all neurons** control is the intervention
that actually clears the state, and it is the honest causal test in the interface.

## Sensory translation and decoding

| Channel | Input | Target | Limitation |
|---|---|---|---|
| Odor | Bilateral samples of analytic food plumes | Annotated ORNs | No receptor-specific odor chemistry or antennal fluid dynamics |
| Taste | Contact proximity to food | Broad gustatory population | Includes multiple sensory locations and unknown taste valences |
| Thermal | Local hot/cold field | Annotated TRNs | Coarse uncalibrated receptor response and type assignment |
| Visual | Environmental light | LC4 projection population | A brightness proxy, not a validated visual encoder |

The current visual proxy is especially limited: LC4 participates in looming/escape
processing, as shown in [Dombrovski et al., *Synaptic gradients transform object location to action*](https://www.nature.com/articles/s41586-022-05562-8).
The code does not reconstruct photoreceptors or compound-eye optics.

Left/right descending-population firing rates are smoothed, passed through a bounded
decoder, and used as drive/turn commands. Side labels do not establish turning direction.
This is a generic experimental readout, not a mapping of validated flight command cells.
[Descending network experiments](https://www.nature.com/articles/s41586-024-07523-9)
also demonstrate that behavior involves interactions between descending populations.

The body controller stabilizes altitude, avoids imminent collisions, and adds small
exploratory turns gated by neural drive. High local odor lowers the target altitude;
gustatory activation can initiate feeding. These are engineered assumptions. Food
coordinates are not used as a steering target. Silencing neurons removes autonomous
drive; manual mode intentionally bypasses neural motor control.

## Body, room, and clocks

Rapier integrates a dynamic, continuously collision-detected body using gravity and
feedback forces at 60 Hz. The collision radius is enlarged to 12 mm, with visibly
enlarged wings/body. This aids interaction but is not biological scale. Leg geometry
and wing animation are illustrative. There is no articulated gait, wall adhesion,
or flapping-wing aerodynamic solver.

The room uses bounded analytic odor, light, and temperature fields; it is not a fluid
or heat-transfer solver. Rendered shadows and sensor illumination are not identical.
Day/night can run at one simulated hour per 30 world seconds. Speed controls the world
clock; neural time is reported separately. Simulation time may run slower than wall
time on a busy VM. Pausing stops world and neural clocks while permitting inspection.

This is an experimental connectome playground. It makes no claim of validated fly
behavior, biological consciousness, or a complete organism emulation.
