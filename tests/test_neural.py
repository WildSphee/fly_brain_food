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
    assert high.motor.forward>0
