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
