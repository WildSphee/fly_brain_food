"""Run the browser play-test against a temporary app instance and always clean up.

Starts ./start.sh on two free ports so it never collides with a copy the user is
running, executes the Playwright suite, then stops the launcher and its children.
"""
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def free_port() -> int:
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def main() -> int:
    be, fe = free_port(), free_port()
    while be == fe:
        fe = free_port()
    env = {**os.environ, 'BACKEND_PORT': str(be), 'FRONTEND_PORT': str(fe),
           'BACKEND_HOST': '127.0.0.1', 'FRONTEND_HOST': '127.0.0.1'}
    (ROOT / '.cache').mkdir(exist_ok=True)
    launcher = None
    try:
        with (ROOT / '.cache/browser-test-app.log').open('w') as log:
            launcher = subprocess.Popen(['./start.sh'], cwd=ROOT, env=env, stdout=log,
                                        stderr=log, start_new_session=True)
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline:
                if launcher.poll() is not None:
                    print('Launcher exited before the app was ready.', file=sys.stderr)
                    return 1
                try:
                    with urllib.request.urlopen(f'http://127.0.0.1:{fe}', timeout=1) as r:
                        if r.status == 200:
                            break
                except (OSError, TimeoutError):
                    time.sleep(0.25)
            else:
                print('Frontend did not become ready.', file=sys.stderr)
                return 1
            print(f'App under test: http://127.0.0.1:{fe} (backend {be})', flush=True)
            run = subprocess.run(['npx', 'playwright', 'test', *sys.argv[1:]],
                                 cwd=ROOT / 'frontend',
                                 env={**env, 'E2E_BASE_URL': f'http://127.0.0.1:{fe}'})
            return run.returncode
    finally:
        # Stop only the launcher this script created; it reaps its own children.
        if launcher and launcher.poll() is None:
            launcher.send_signal(signal.SIGINT)
            try:
                launcher.wait(timeout=20)
            except subprocess.TimeoutExpired:
                launcher.kill()
                launcher.wait()
        print('Temporary app instance stopped.', flush=True)


if __name__ == '__main__':
    sys.exit(main())
