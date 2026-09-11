"""Bounded integration check for startup, busy ports, SIGINT, and owned-child cleanup."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def main():
    be, fe = free_port(), free_port()
    while be == fe:
        fe = free_port()
    env = {**os.environ, 'BACKEND_PORT': str(be), 'FRONTEND_PORT': str(fe),
           'BACKEND_HOST':'127.0.0.1', 'FRONTEND_HOST':'127.0.0.1'}
    (ROOT / '.cache').mkdir(exist_ok=True)
    proc = None
    children = []
    with (ROOT / '.cache/launcher-test.log').open('w') as log:
        try:
            proc = subprocess.Popen(['./start.sh'], cwd=ROOT, env=env, stdout=log, stderr=log, start_new_session=True)
            deadline = time.monotonic()+35
            while time.monotonic()<deadline:
                assert proc.poll() is None, 'Launcher exited during startup.'
                try:
                    with urllib.request.urlopen(f'http://127.0.0.1:{fe}', timeout=.5) as r:
                        assert r.status==200
                    break
                except (OSError,TimeoutError):
                    time.sleep(.2)
            else:
                raise AssertionError('Frontend did not become ready.')
            children_path=Path(f'/proc/{proc.pid}/task/{proc.pid}/children')
            children=[int(p) for p in children_path.read_text().split()]
            assert len(children)==2, f'Expected exactly 2 children, got {children}'
            conflict=subprocess.run(['./start.sh'],cwd=ROOT,env=env,capture_output=True,text=True,timeout=10)
            assert conflict.returncode==1 and 'occupied' in conflict.stderr
            with urllib.request.urlopen(f'http://127.0.0.1:{be}/api/health') as r:
                assert json.load(r)['status']=='ok', 'Conflict check disrupted the original backend.'
            proc.send_signal(signal.SIGINT)
            assert proc.wait(timeout=15)==0
            assert all(not Path(f'/proc/{pid}').exists() for pid in children), 'Owned children were not reaped.'
            for port in (be,fe):
                with socket.socket() as s:
                    assert s.connect_ex(('127.0.0.1',port))!=0, 'Owned server still listening.'
            print('PASS: configurable ports, live service, conflict refusal, SIGINT, and reaped child processes.')
        finally:
            if proc and proc.poll() is None:
                proc.send_signal(signal.SIGTERM)
                proc.wait(timeout=15)


if __name__=='__main__':
    main()
