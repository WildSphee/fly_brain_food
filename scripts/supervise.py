"""Own the app's two process groups; never search for or kill other users' PIDs."""
import os
from contextlib import suppress
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.settings import settings  # noqa: E402


def main() -> int:
    children: list[subprocess.Popen] = []
    stopping = False

    def stop(_signum=None, _frame=None):
        nonlocal stopping
        stopping = True

    # SIGHUP matters: children are session leaders, so a closed terminal would
    # otherwise leave them running forever holding the configured ports.
    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, stop)
    if settings.backend_port == settings.frontend_port:
        print('BACKEND_PORT and FRONTEND_PORT must be different.', file=sys.stderr)
        return 1
    # Fail before creating either child. No port reclamation and no nginx changes.
    for port in (settings.backend_port, settings.frontend_port):
        try:
            with socket.socket() as sock:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                sock.bind(('0.0.0.0', port))
        except OSError:
            print(f'Port {port} is occupied. Set a free port in .env. No processes were stopped.', file=sys.stderr)
            return 1
    env = os.environ.copy()
    # Keep BLAS from allocating a thread pool on the shared VM.
    env.update(OPENBLAS_NUM_THREADS='1', OMP_NUM_THREADS='1', PYTHONUNBUFFERED='1')
    backend_host = settings.backend_host
    probe_host = '127.0.0.1' if backend_host == '0.0.0.0' else backend_host
    try:
        children.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', 'backend.app:app', '--host', backend_host,
            '--port', str(settings.backend_port), '--workers', '1', '--ws-max-size', '65536'], cwd=ROOT, env=env, start_new_session=True))
        deadline = time.monotonic() + 30
        while not stopping and time.monotonic() < deadline:
            if children[0].poll() is not None:
                raise RuntimeError('Backend exited during startup.')
            try:
                with urllib.request.urlopen(f'http://{probe_host}:{settings.backend_port}/api/health', timeout=0.5) as r:
                    if r.status == 200:
                        break
            except (OSError, TimeoutError):
                time.sleep(0.15)
        else:
            if stopping:
                return 0
            raise RuntimeError('Backend did not become ready in 30 seconds.')
        if stopping:
            return 0
        children.append(subprocess.Popen(['node', 'node_modules/vite/bin/vite.js'], cwd=ROOT / 'frontend', env=env, start_new_session=True))
        print(f'\nFly Matrix → http://localhost:{settings.frontend_port}\nCtrl-C stops this application and its children.\n', flush=True)
        while not stopping:
            for child in children:
                if child.poll() is not None:
                    raise RuntimeError(f'Application child {child.pid} exited with code {child.returncode}.')
            time.sleep(0.2)
        return 0
    except (OSError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        for child in children:
            if child.poll() is None:
                with suppress(ProcessLookupError):
                    os.killpg(child.pid, signal.SIGTERM)
        for child in children:
            try:
                child.wait(timeout=6)
            except subprocess.TimeoutExpired:
                with suppress(ProcessLookupError):
                    os.killpg(child.pid, signal.SIGKILL)
                child.wait()
        print('Fly Matrix stopped; all owned children reaped.', flush=True)


if __name__ == '__main__':
    sys.exit(main())
