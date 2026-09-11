import numpy as np
import pytest
from backend.neural import Brain, Circuit
from backend.schemas import SensoryInput, StepRequest
from pydantic import ValidationError


def small_circuit(nt='acetylcholine', connected=True):
    return Circuit({'neurons': [
        {'id':'1','type':'ORN_DM1','nt':nt,'side':'L','group':'cb_sensory','modality':'olfactory'},
        {'id':'2','type':'test-DN','nt':'acetylcholine','side':'L','group':'descending_neuron','modality':None},
    ], 'edges': [['1','2',300]] if connected else []})


def test_measured_edge_transmits_after_delay():
    b=Brain(small_circuit())
    b.v[0]=-44
    b.integrate(np.zeros(2),1)
    assert b.counts.tolist()==[1,0]
    b.integrate(np.zeros(2),8)
    assert b.v[1]==-52
    b.integrate(np.zeros(2),1)
    assert b.v[1]>-52
    b.integrate(np.zeros(2),50)
    assert b.counts[1]>0


def test_inhibition_hyperpolarizes_and_does_not_fire():
    b=Brain(small_circuit(nt='gaba'))
    b.v[0]=-44
    b.integrate(np.zeros(2),35)
    assert b.v[1]<-52
    assert b.counts[1]==0


def test_ablating_edges_removes_motor_response():
    b=Brain(small_circuit())
    cut=Brain(small_circuit(connected=False))
    for _ in range(15):
        a=b.step(SensoryInput(odor_left=1))
        z=cut.step(SensoryInput(odor_left=1))
    assert a.motor.forward>0
    assert z.motor.forward==0


def test_silencing_is_causal_and_pause_does_not_advance():
    b=Brain(small_circuit())
    for _ in range(10):
        b.step(SensoryInput(odor_left=1))
    result=b.step(SensoryInput(odor_left=1),silenced=True)
    assert result.spikes==result.active_neurons==result.motor.forward==0
    before=b.time_ms
    b.step(SensoryInput(),running=False)
    assert b.time_ms==before


def test_reset_replays_seed_and_session_state_is_independent():
    c=small_circuit()
    a,b=Brain(c),Brain(c)
    first=a.step(SensoryInput(odor_left=.8))
    assert b.time_ms==0
    assert np.all(b.v==-52)
    a.reset()
    second=a.step(SensoryInput(odor_left=.8))
    assert first.spikes==second.spikes
    assert first.activity==second.activity


@pytest.mark.parametrize('value',[-1,2,float('nan'),float('inf')])
def test_sensor_validation_rejects_invalid_values(value):
    with pytest.raises(ValidationError):
        SensoryInput(odor_left=value)


def test_unknown_fields_rejected():
    with pytest.raises(ValidationError):
        StepRequest(unexpected='untrusted')


def test_snapshot_integrity_and_anatomical_provenance():
    c=Circuit()
    assert c.n==4390
    assert len(c.edges)==251004
    assert c.motor.sum()==259
    assert sum(e[2] for e in c.edges)==5202110
    assert c.manifest['dataset']=='male-cns:v1.0'
    assert all(e[0] in c.index and e[1] in c.index for e in c.edges)


def test_real_graph_changes_downstream_activity_with_sensory_stimulation():
    c=Circuit()
    dark,stim=Brain(c),Brain(c)
    for _ in range(5):
        low=dark.step(SensoryInput(),gain=0)
        high=stim.step(SensoryInput(odor_left=1,odor_right=.8))
    assert low.spikes==0
    assert high.spikes>100
    # Assert on descending activity: that is the circuit's own output, whereas
    # forward is an engineered decoder with its own operating band.
    assert low.motor_left_hz==0 and low.motor_right_hz==0
    assert high.motor_left_hz>0 or high.motor_right_hz>0
    # The decoder needs the circuit to reach that band before it commands thrust.
    for _ in range(25):
        high=stim.step(SensoryInput(odor_left=1,odor_right=.8))
    assert high.motor.forward>0


def test_excitation_dominant_subgraph_sustains_activity_without_sensory_drive():
    """Measured limitation, documented in docs/science.md.

    The bounded subgraph carries about twice as much excitatory as inhibitory
    synapse mass, so once it is driven it holds a self-sustaining state: removing
    all sensory input leaves most of the activity, and firing rates sit at the
    refractory ceiling. Silencing remains the only intervention that clears it.
    Bands are tight so a drift away from the documented figures fails here.
    """
    c = Circuit()
    b = Brain(c, 42)
    stim = SensoryInput(odor_left=.3, odor_right=.2)
    for _ in range(30):
        driven = b.step(stim)
    for _ in range(60):
        quiet = b.step(stim, gain=0)
    assert quiet.spikes > 0, 'expected the recurrent state to persist'
    assert .78 < quiet.mean_hz / driven.mean_hz < .90, 'documented retention is ~84%'
    firing = b.rates[b.rates > 1]
    assert 850 < firing.size < 1100, 'documented ~960 neurons firing'
    assert 150 < np.median(firing) < 200, 'documented median ~172 Hz'
    assert firing.max() > 400, 'documented near-ceiling rates'
    cleared = b.step(stim, silenced=True)
    assert cleared.spikes == 0 and cleared.motor.forward == 0


def test_refractory_ceiling_matches_documented_period():
    """The documented 2.2 ms refractory must be the period actually enforced."""
    c = Circuit()
    b = Brain(c, 42)
    drive = np.zeros(c.n)
    drive[0] = 1e6
    b.integrate(drive, 5000)
    interval_ms = 5000 / b.counts[0] * b.dt
    assert abs(interval_ms - 2.2) < .01, f'refractory period is {interval_ms} ms'
    assert abs(c.summary()['refractory_ms'] - 2.2) < 1e-9


def test_hygrosensory_neurons_are_excluded_from_the_thermal_drive():
    """TRN_VP1m is hygrosensory; it must not be driven as a cold receptor."""
    c = Circuit()
    assert c.hot.sum() and c.cold.sum()
    assert not (c.hot & c.cold).any()
    hygro = c.modality['thermal'] & ~c.hot & ~c.cold
    assert hygro.sum() == 11
    b = Brain(c, 42)
    assert b.encode(SensoryInput(cold=1), 1.0)[hygro].max() == 0


def test_decoder_has_no_permanent_turn_bias_and_forward_is_not_clipped():
    """The subgraph samples more right descending neurons than left.

    A decoder reading raw left/right rates emits a constant yaw that no sensory
    input caused, and a forward channel pinned at the top of tanh. Both are
    regressions worth catching. See docs/science.md.
    """
    c = Circuit()
    b = Brain(c, 42)
    null = SensoryInput()
    for _ in range(150):
        settled = b.step(null)
    assert abs(settled.motor.turn) < .25, 'resting yaw should not be a standing bias'
    assert .35 < settled.motor.forward < .75, 'forward must sit inside the tanh range'
    strong = b.step(SensoryInput(taste=1))
    for _ in range(20):
        strong = b.step(SensoryInput(taste=1))
    assert strong.motor.forward > settled.motor.forward + .1, 'forward must respond to drive'


def test_lateral_light_asymmetry_produces_opposing_turns():
    """The one sensory channel that measurably steers through this decoder."""
    c = Circuit()
    peaks = {}
    for name, sensors in (('left', SensoryInput(light_left=1, light_right=0)),
                          ('right', SensoryInput(light_left=0, light_right=1))):
        b = Brain(c, 42)
        null = SensoryInput()
        for _ in range(150):
            b.step(null)
        peak = 0.0
        for _ in range(20):
            turn = b.step(sensors).motor.turn
            if abs(turn) > abs(peak):
                peak = turn
        peaks[name] = peak
    assert peaks['right'] > .4 and peaks['left'] < 0, f'no lateral separation: {peaks}'
    assert peaks['right'] - peaks['left'] > .8
