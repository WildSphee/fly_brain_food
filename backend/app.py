import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from backend.neural import Brain, Circuit
from backend.schemas import StepRequest
from backend.settings import settings

logger = logging.getLogger('fly-kitchen')


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.circuit = Circuit()
    app.state.sessions = 0
    yield


app = FastAPI(title='Fly Kitchen', version='0.1.0', lifespan=lifespan)


@app.get('/api/health')
def health():
    return {'status': 'ok', 'dataset': app.state.circuit.manifest['dataset'], 'sessions': app.state.sessions}


@app.get('/api/circuit')
def circuit():
    return app.state.circuit.summary()


@app.get('/api/circuit/graph')
def graph():
    c = app.state.circuit
    # Representative view from actual measured edges, never a generated topology.
    ordered = sorted(c.edges, key=lambda e: e[2], reverse=True)
    ids: set[str] = set()
    for a, b, _ in ordered:
        if len(ids | {a, b}) <= 120:
            ids.update((a, b))
    edges = [e for e in ordered if e[0] in ids and e[1] in ids][:320]
    return {'nodes': [n for n in c.neurons if n['id'] in ids], 'edges': edges,
            'view': 'Strongest connected 120-neuron sample; not anatomical positions.', 'total_neurons': c.n}


@app.websocket('/api/simulation')
async def simulation(ws: WebSocket):
    await ws.accept()
    if app.state.sessions >= settings.max_sessions:
        await ws.send_json({'type': 'error', 'message': 'All neural sessions are occupied. Close another tab and reconnect.'})
        await ws.close(code=1013)
        return
    app.state.sessions += 1
    brain = Brain(app.state.circuit, settings.neural_seed)
    try:
        await ws.send_json({'type': 'connected', **app.state.circuit.summary()})
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=90)
            except asyncio.TimeoutError:
                await ws.close(code=1000, reason='Idle session expired')
                break
            if len(raw) > 4096:
                await ws.send_json({'type': 'error', 'message': 'Simulation packet exceeds 4096 characters.'})
                continue
            try:
                request = StepRequest.model_validate_json(raw)
            except ValidationError:
                await ws.send_json({'type': 'error', 'message': 'Invalid simulation input; values must be finite and within the documented ranges.'})
                continue
            if request.command == 'reset':
                brain.reset()
            result = await asyncio.to_thread(brain.step, request.sensors, request.gain, request.silenced, request.running)
            await ws.send_json(result.model_dump())
            await asyncio.sleep(0.02)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception('Neural session failed')
        try:
            await ws.send_json({'type': 'error', 'message': 'Neural session failed. Reconnect to reset this session.'})
            await ws.close(code=1011)
        except RuntimeError:
            pass
    finally:
        app.state.sessions -= 1
