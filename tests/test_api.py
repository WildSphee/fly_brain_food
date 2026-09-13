from fastapi.testclient import TestClient
from backend.app import app


def test_health_provenance_and_representative_graph():
    with TestClient(app) as client:
        assert client.get('/api/health').json()['status']=='ok'
        summary=client.get('/api/circuit').json()
        assert summary['neurons']==4390
        assert summary['window_ms']==20
        graph=client.get('/api/circuit/graph').json()
        assert len(graph['nodes'])<=120
        ids={n['id'] for n in graph['nodes']}
        assert all(a in ids and b in ids for a,b,_ in graph['edges'])


def test_websocket_validation_reset_and_session_cleanup():
    with TestClient(app) as client:
        with client.websocket_connect('/api/simulation') as ws:
            assert ws.receive_json()['type']=='connected'
            assert client.get('/api/health').json()['sessions']==1
            ws.send_json({'sensors':{'odor_left':-4}})
            assert ws.receive_json()['type']=='error'
            ws.send_json({'sensors':{'odor_left':1}})
            assert ws.receive_json()['neural_ms']==20
            ws.send_json({'silenced':True})
            assert ws.receive_json()['spikes']==0
            ws.send_json({'command':'reset','running':False})
            assert ws.receive_json()['neural_ms']==0
        assert client.get('/api/health').json()['sessions']==0


def test_anatomy_is_measured_and_matches_the_simulated_circuit():
    import gzip
    import hashlib
    import json
    from pathlib import Path
    data_dir = Path(__file__).resolve().parents[1] / 'backend/data'
    with gzip.open(data_dir / 'malecns-circuit.json.gz', 'rt') as source:
        source_circuit = json.load(source)
    source_ids = {n['id'] for n in source_circuit['neurons']}
    source_edges = {tuple(edge) for edge in source_circuit['edges']}
    with TestClient(app) as client:
        anatomy = client.get('/api/circuit/anatomy').json()
    assert 30 < len(anatomy['neurons']) <= 48
    assert anatomy['coordinate_space'] == 'MaleCNS EM; xyz in 8 nm voxels'
    assert anatomy['circuit_sha256'] == hashlib.sha256((data_dir / 'malecns-circuit.json.gz').read_bytes()).hexdigest()
    for neuron in anatomy['neurons']:
        assert neuron['id'] in source_ids
        assert neuron['source'].startswith('https://neuprint.janelia.org/api/skeletons/skeleton/')
        assert len(neuron['swc_sha256']) == 64
        points = neuron['points']
        assert len(points) > 100
        assert any(p[3] == -1 for p in points)
        assert all(len(p) == 4 and -1 <= p[3] < len(points) for p in points)
    assert set(map(tuple, anatomy['edges'])) <= source_edges
