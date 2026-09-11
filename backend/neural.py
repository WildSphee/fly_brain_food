"""Sparse LIF circuit. Measured graph; experimental I/O and uniform dynamics.

Voltage and time units: mV, ms. See docs/science.md for equations and limitations.
"""
import gzip
import hashlib
import json
from pathlib import Path
from time import perf_counter

import numpy as np
from scipy.sparse import csr_matrix

from backend.schemas import MotorOutput, SensoryInput, Telemetry

DATA = Path(__file__).parent / 'data/malecns-circuit.json.gz'

DT_MS = 0.2
STEPS = 100                     # one service update = 20 ms of neural time
WEIGHT_MV = 0.275
REST_MV = -52.0
THRESHOLD_MV = -45.0
TAU_M_MS = 20.0
TAU_S_MS = 5.0
DELAY_MS = 1.8
REFRACTORY_MS = 2.2
DELAY_SLOTS = round(DELAY_MS / DT_MS)
# Counter value held after a spike. The spike step itself counts toward the
# refractory period, so the minimum inter-spike interval is this + 1 steps.
REFRACTORY_HOLD = round(REFRACTORY_MS / DT_MS) - 1
POISSON_MV = 250 * WEIGHT_MV
# Descending readout, tuned to the circuit's measured operating band. Engineered.
FORWARD_OFFSET_HZ = 40.0
FORWARD_SCALE_HZ = 38.0
TURN_SCALE_HZ = 6.0
BASELINE_RATE = 0.02            # slow mean of descending balance (~50 updates)


class Circuit:
    def __init__(self, payload: dict | None = None):
        if payload is None:
            manifest = json.loads(DATA.with_name('manifest.json').read_text())
            packed = DATA.read_bytes()
            if hashlib.sha256(packed).hexdigest() != manifest['sha256']:
                raise ValueError('Circuit checksum mismatch; restore or re-import the snapshot.')
            payload = json.loads(gzip.decompress(packed))
            self.manifest = manifest
        else:
            self.manifest = {'dataset': payload.get('dataset', 'test'), 'neurons': len(payload['neurons']), 'edges': len(payload['edges'])}
        self.neurons = payload['neurons']
        self.edges = payload['edges']
        self.n = len(self.neurons)
        self.index = {n['id']: i for i, n in enumerate(self.neurons)}
        self.signs = np.array([1 if n['nt'].lower() == 'acetylcholine' else -1 if n['nt'].lower() in ('gaba', 'glutamate', 'histamine') else 0 for n in self.neurons], dtype=np.float64)
        pre = np.array([self.index[e[0]] for e in self.edges], dtype=np.int32)
        post = np.array([self.index[e[1]] for e in self.edges], dtype=np.int32)
        weights = np.array([e[2] for e in self.edges], dtype=np.float64) * self.signs[pre] * WEIGHT_MV
        self.weights = csr_matrix((weights, (post, pre)), shape=(self.n, self.n))
        self.left = np.array([n['side'] == 'L' for n in self.neurons])
        self.right = np.array([n['side'] == 'R' for n in self.neurons])
        self.modality = {key: np.array([n.get('modality') == key for n in self.neurons]) for key in ('olfactory', 'thermal', 'visual', 'taste')}
        self.hot = np.array([n['type'] == 'TRN_VP2' for n in self.neurons])
        self.cold = np.array([n['type'] in ('TRN_VP3a', 'TRN_VP3b') for n in self.neurons])
        self.motor = np.array([n['group'] == 'descending_neuron' for n in self.neurons])
        self.groups = {**self.modality, 'descending': self.motor,
                       'interneuron': np.array([not n.get('modality') and n['group'] != 'descending_neuron' for n in self.neurons])}

    def summary(self):
        return {**self.manifest, 'model': 'Sparse leaky integrate-and-fire', 'weight_mv': WEIGHT_MV,
                'dt_ms': DT_MS, 'window_ms': STEPS * DT_MS, 'rest_mv': REST_MV, 'threshold_mv': THRESHOLD_MV,
                'membrane_tau_ms': TAU_M_MS, 'synaptic_tau_ms': TAU_S_MS, 'delay_ms': DELAY_SLOTS * DT_MS,
                'refractory_ms': (REFRACTORY_HOLD + 1) * DT_MS,
                'thermal_neurons': {'hot': int(self.hot.sum()), 'cold': int(self.cold.sum()),
                                    'excluded_hygrosensory': int((self.modality['thermal'] & ~self.hot & ~self.cold).sum())},
                'groups': {k: int(v.sum()) for k, v in self.groups.items()},
                'excluded_transmitter_neurons': int((self.signs == 0).sum()),
                'fidelity': 'Real bounded MaleCNS circuit. Unvalidated sensory adapters, motor decoder, and fly body; not the full CNS.'}


class Brain:
    dt = DT_MS
    steps = STEPS

    def __init__(self, circuit: Circuit, seed: int = 42):
        self.circuit = circuit
        self.seed = seed
        self.reset()

    def reset(self):
        n = self.circuit.n
        self.rng = np.random.default_rng(self.seed)
        self.v = np.full(n, REST_MV)
        self.g = np.zeros(n)
        self.refractory = np.zeros(n, dtype=np.int16)
        self.delay = np.zeros((DELAY_SLOTS, n))
        self.cursor = 0
        self.time_ms = 0.0
        self.rates = np.zeros(n)
        self.counts = np.zeros(n, dtype=np.int32)
        self.dn_baseline: np.ndarray | None = None

    def encode(self, s: SensoryInput, gain: float):
        c = self.circuit
        rates = np.zeros(c.n)
        odor = np.where(c.left, s.odor_left, np.where(c.right, s.odor_right, (s.odor_left+s.odor_right)/2))
        light = np.where(c.left, s.light_left, np.where(c.right, s.light_right, (s.light_left+s.light_right)/2))
        rates[c.modality['olfactory']] = (18 + 160 * odor[c.modality['olfactory']]) * gain
        rates[c.modality['visual']] = (8 + 90 * light[c.modality['visual']]) * gain
        rates[c.hot] = (4 + 160 * s.heat) * gain
        rates[c.cold] = (4 + 160 * s.cold) * gain
        rates[c.modality['taste']] = (2 + 180 * s.taste) * gain
        return rates

    def integrate(self, input_hz: np.ndarray, steps: int | None = None):
        """One numerical update uses exact passive decay and a 9-slot synaptic delay."""
        count = self.steps if steps is None else steps
        self.counts.fill(0)
        em = np.exp(-self.dt/TAU_M_MS)
        es = np.exp(-self.dt/TAU_S_MS)
        for _ in range(count):
            self.g += self.delay[self.cursor]
            self.delay[self.cursor].fill(0)
            active = self.refractory <= 0
            self.refractory = np.maximum(self.refractory - 1, 0)
            self.v[active] = REST_MV + (self.v[active] - REST_MV)*em + self.g[active] * (TAU_S_MS/(TAU_S_MS-TAU_M_MS))*(es-em)
            self.g *= es
            # Poisson stimulation enters V at 250 × .275mV, as in the reference model.
            poisson = self.rng.random(self.circuit.n) < -np.expm1(-input_hz*self.dt/1000)
            self.v[poisson & active] += POISSON_MV
            spikes = (self.v > THRESHOLD_MV) & active
            self.counts += spikes
            # Reset matches the reference model: v to rest and g cleared.
            self.v[spikes] = REST_MV
            self.g[spikes] = 0
            self.refractory[spikes] = REFRACTORY_HOLD
            self.delay[self.cursor] = self.circuit.weights @ spikes.astype(float)
            self.cursor = (self.cursor+1) % DELAY_SLOTS
        self.time_ms += count*self.dt
        self.rates = self.rates*0.85 + (self.counts/(count*self.dt/1000))*0.15

    def step(self, sensors: SensoryInput, gain=1.0, silenced=False, running=True):
        started = perf_counter()
        if running:
            if silenced:
                self.v.fill(REST_MV)
                self.g.fill(0)
                self.delay.fill(0)
                self.rates.fill(0)
                self.counts.fill(0)
                self.refractory.fill(0)
                self.dn_baseline = None
                self.time_ms += self.steps*self.dt
            else:
                self.integrate(self.encode(sensors, gain))
        c = self.circuit
        def mean(mask):
            return float(self.rates[mask].mean()) if mask.any() else 0.0
        left = mean(c.motor & c.left)
        right = mean(c.motor & c.right)
        # This is an engineered decoder, not a biological assignment of DN functions.
        # Forward is scaled to the circuit's measured operating band so it is not
        # clipped at the top of tanh. Turn is decoded from the deviation of the
        # left/right balance from its own slow mean, because this subgraph samples
        # more right descending neurons than left and would otherwise emit a
        # permanent yaw that no sensory input caused. See docs/science.md.
        sample = np.array([left, right])
        if self.dn_baseline is None:
            self.dn_baseline = sample.copy()
        else:
            self.dn_baseline += BASELINE_RATE * (sample - self.dn_baseline)
        base_left, base_right = self.dn_baseline
        drive = float(np.tanh((left + right - FORWARD_OFFSET_HZ) / FORWARD_SCALE_HZ))
        balance = (right - left) - (base_right - base_left)
        turn = float(np.tanh(balance / TURN_SCALE_HZ))
        motor = MotorOutput(forward=max(0.0, drive), turn=turn, lift=max(0.0, drive),
                            feeding=float(np.tanh(mean(c.modality['taste'])/40))*sensors.taste)
        top = np.argsort(self.rates)[-32:][::-1]
        return Telemetry(neural_ms=round(self.time_ms, 2), spikes=int(self.counts.sum()),
            active_neurons=int(np.count_nonzero(self.counts)), mean_hz=round(float(self.rates.mean()), 3),
            compute_ms=round((perf_counter()-started)*1000, 2), motor_left_hz=round(left, 2), motor_right_hz=round(right, 2),
            motor=motor, groups={k: round(mean(v), 2) for k, v in c.groups.items()},
            activity=[{'id': c.neurons[i]['id'], 'type': c.neurons[i]['type'], 'hz': round(float(self.rates[i]), 1), 'side': c.neurons[i]['side']} for i in top], silenced=silenced)
