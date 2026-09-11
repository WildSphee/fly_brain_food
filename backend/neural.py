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
        self.signs = np.array([1 if n['nt'].lower() == 'acetylcholine' else -1 if n['nt'].lower() in ('gaba', 'glutamate') else 0 for n in self.neurons], dtype=np.float64)
        pre = np.array([self.index[e[0]] for e in self.edges], dtype=np.int32)
        post = np.array([self.index[e[1]] for e in self.edges], dtype=np.int32)
        weights = np.array([e[2] for e in self.edges], dtype=np.float64) * self.signs[pre] * 0.275
        self.weights = csr_matrix((weights, (post, pre)), shape=(self.n, self.n))
        self.left = np.array([n['side'] == 'L' for n in self.neurons])
        self.right = np.array([n['side'] == 'R' for n in self.neurons])
        self.modality = {key: np.array([n.get('modality') == key for n in self.neurons]) for key in ('olfactory', 'thermal', 'visual', 'taste')}
        self.motor = np.array([n['group'] == 'descending_neuron' for n in self.neurons])
        self.groups = {**self.modality, 'descending': self.motor,
                       'interneuron': np.array([not n.get('modality') and n['group'] != 'descending_neuron' for n in self.neurons])}

    def summary(self):
        return {**self.manifest, 'model': 'Sparse leaky integrate-and-fire', 'weight_mv': 0.275,
                'dt_ms': 0.2, 'window_ms': 20, 'rest_mv': -52, 'threshold_mv': -45,
                'membrane_tau_ms': 20, 'synaptic_tau_ms': 5, 'delay_ms': 1.8, 'refractory_ms': 2.2,
                'groups': {k: int(v.sum()) for k, v in self.groups.items()},
                'excluded_transmitter_neurons': int((self.signs == 0).sum()),
                'fidelity': 'Real bounded MaleCNS circuit. Unvalidated sensory adapters, motor decoder, and fly body; not the full CNS.'}


class Brain:
    dt = 0.2
    steps = 100

    def __init__(self, circuit: Circuit, seed: int = 42):
        self.circuit = circuit
        self.seed = seed
        self.reset()

    def reset(self):
        n = self.circuit.n
        self.rng = np.random.default_rng(self.seed)
        self.v = np.full(n, -52.0)
        self.g = np.zeros(n)
        self.refractory = np.zeros(n, dtype=np.int16)
        self.delay = np.zeros((9, n))
        self.cursor = 0
        self.time_ms = 0.0
        self.rates = np.zeros(n)
        self.counts = np.zeros(n, dtype=np.int32)

    def encode(self, s: SensoryInput, gain: float):
        c = self.circuit
        rates = np.zeros(c.n)
        odor = np.where(c.left, s.odor_left, np.where(c.right, s.odor_right, (s.odor_left+s.odor_right)/2))
        light = np.where(c.left, s.light_left, np.where(c.right, s.light_right, (s.light_left+s.light_right)/2))
        rates[c.modality['olfactory']] = (18 + 160 * odor[c.modality['olfactory']]) * gain
        rates[c.modality['visual']] = (8 + 90 * light[c.modality['visual']]) * gain
        # VP2 hot, VP3 cold classification is a coarse experimental receptor adapter.
        thermal = np.array([s.heat if n['type'] == 'TRN_VP2' else s.cold for n in c.neurons])
        rates[c.modality['thermal']] = (4 + 160 * thermal[c.modality['thermal']]) * gain
        rates[c.modality['taste']] = (2 + 180 * s.taste) * gain
        return rates

    def integrate(self, input_hz: np.ndarray, steps: int | None = None):
        """One numerical update uses exact passive decay and a 9-slot synaptic delay."""
        count = self.steps if steps is None else steps
        self.counts.fill(0)
        em = np.exp(-self.dt/20)
        es = np.exp(-self.dt/5)
        for _ in range(count):
            self.g += self.delay[self.cursor]
            self.delay[self.cursor].fill(0)
            active = self.refractory <= 0
            self.refractory = np.maximum(self.refractory - 1, 0)
            self.v[active] = -52 + (self.v[active] + 52)*em + self.g[active] * (5/(5-20))*(es-em)
            self.g *= es
            # Poisson stimulation enters V at 250 × .275mV, as in the reference model.
            poisson = self.rng.random(self.circuit.n) < -np.expm1(-input_hz*self.dt/1000)
            self.v[poisson & active] += 68.75
            spikes = (self.v > -45) & active
            self.counts += spikes
            self.v[spikes] = -52
            self.g[spikes] = 0
            self.refractory[spikes] = 11
            self.delay[self.cursor] = self.circuit.weights @ spikes.astype(float)
            self.cursor = (self.cursor+1) % 9
        self.time_ms += count*self.dt
        self.rates = self.rates*0.85 + (self.counts/(count*self.dt/1000))*0.15

    def step(self, sensors: SensoryInput, gain=1.0, silenced=False, running=True):
        started = perf_counter()
        if running:
            if silenced:
                self.v.fill(-52)
                self.g.fill(0)
                self.delay.fill(0)
                self.rates.fill(0)
                self.counts.fill(0)
                self.refractory.fill(0)
                self.time_ms += self.steps*self.dt
            else:
                self.integrate(self.encode(sensors, gain))
        c = self.circuit
        def mean(mask):
            return float(self.rates[mask].mean()) if mask.any() else 0.0
        left = mean(c.motor & c.left)
        right = mean(c.motor & c.right)
        drive = float(np.tanh((left+right)/25))
        turn = float(np.tanh((right-left)/15))
        # This is an engineered decoder, not a biological assignment of DN functions.
        motor = MotorOutput(forward=drive, turn=turn, lift=drive,
                            feeding=float(np.tanh(mean(c.modality['taste'])/40))*sensors.taste)
        top = np.argsort(self.rates)[-32:][::-1]
        return Telemetry(neural_ms=round(self.time_ms, 2), spikes=int(self.counts.sum()),
            active_neurons=int(np.count_nonzero(self.counts)), mean_hz=round(float(self.rates.mean()), 3),
            compute_ms=round((perf_counter()-started)*1000, 2), motor_left_hz=round(left, 2), motor_right_hz=round(right, 2),
            motor=motor, groups={k: round(mean(v), 2) for k, v in c.groups.items()},
            activity=[{'id': c.neurons[i]['id'], 'type': c.neurons[i]['type'], 'hz': round(float(self.rates[i]), 1), 'side': c.neurons[i]['side']} for i in top], silenced=silenced)
