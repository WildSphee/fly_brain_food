"""Vendor actual MaleCNS neuron centerlines for the anatomical circuit viewer.

Select six high-connectivity, type-diverse neurons from each of eight circuit groups.
SWC coordinates and parent links are preserved, including disconnected fragments.
No synthetic points, branches, or anatomical positions are added.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import sys

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.settings import settings  # noqa: E402

GROUPS = ['visual', 'olfactory', 'taste', 'thermal', 'cb_intrinsic',
          'descending_neuron', 'ascending_neuron', 'vnc_intrinsic']


def parse_swc(text):
    rows = [line.split() for line in text.splitlines() if line.strip() and not line.startswith('#')]
    index = {int(row[0]): i for i, row in enumerate(rows)}
    return [[float(row[2]), float(row[3]), float(row[4]), index.get(int(row[6]), -1)] for row in rows]


def main():
    token = settings.neuprint_api_key.get_secret_value()
    if not token:
        raise SystemExit('Set NEUPRINT_API_KEY in .env to import anatomical skeletons.')
    circuit_path = ROOT / 'backend/data/malecns-circuit.json.gz'
    circuit = json.loads(gzip.decompress(circuit_path.read_bytes()))
    strength = {}
    for a, b, weight in circuit['edges']:
        strength[a] = strength.get(a, 0) + weight
        strength[b] = strength.get(b, 0) + weight
    selected = []
    for group in GROUPS:
        candidates = [n for n in circuit['neurons'] if (n['modality'] or n['group']) == group]
        candidates.sort(key=lambda n: (-strength.get(n['id'], 0), int(n['id'])))
        chosen = []; types = set()
        # Balance left/right where annotations allow, then fill any remaining slots.
        for side in ['L', 'R', None]:
            for n in candidates:
                if len(chosen) >= (3 if side == 'L' else 6): break
                key = (n['type'], n['side'])
                if n in chosen or key in types or (side and n['side'] != side): continue
                chosen.append(n); types.add(key)
        selected.extend(chosen)
    cache = ROOT / '.cache/anatomy-swc'; cache.mkdir(parents=True, exist_ok=True)
    with httpx.Client(base_url='https://neuprint.janelia.org', headers={'Authorization': f'Bearer {token}'}, timeout=90) as client:
        def download(n):
            endpoint = f"/api/skeletons/skeleton/{circuit['dataset']}/{n['id']}?format=swc"
            raw_path = cache / f"{n['id']}.swc"
            if raw_path.exists(): raw = raw_path.read_bytes()
            else:
                r = client.get(endpoint)
                if r.status_code != 200:
                    raise RuntimeError(f"Skeleton {n['id']}: HTTP {r.status_code}; current snapshot preserved.")
                raw = r.content; raw_path.write_bytes(raw)
            points = parse_swc(raw.decode())
            if len(points) < 2: raise RuntimeError(f"No centerline for {n['id']}")
            print(f"{n['id']} {n['type']}: {len(points)} measured points", flush=True)
            return {**n, 'points': points, 'source': 'https://neuprint.janelia.org' + endpoint,
                    'swc_sha256': hashlib.sha256(raw).hexdigest()}
        with ThreadPoolExecutor(max_workers=4) as pool:
            neurons = list(pool.map(download, selected))
    ids = {n['id'] for n in neurons}
    payload = {'dataset': circuit['dataset'], 'license': 'CC-BY-4.0',
               'source': 'https://male-cns.janelia.org/download/',
               'attribution': 'FlyEM / HHMI Janelia, University of Cambridge, MRC LMB, Google Research',
               'fetched_at': datetime.now(timezone.utc).isoformat(),
               'coordinate_space': 'MaleCNS EM; xyz in 8 nm voxels',
               'selection': 'Up to six high-connectivity, type-diverse circuit neurons per group, balanced by annotated side where available.',
               'circuit_sha256': hashlib.sha256(circuit_path.read_bytes()).hexdigest(),
               'neurons': neurons, 'edges': [e for e in circuit['edges'] if e[0] in ids and e[1] in ids]}
    output = ROOT / 'backend/data/malecns-anatomy.json.gz'
    packed = gzip.compress(json.dumps(payload, separators=(',', ':')).encode(), mtime=0)
    temporary = output.with_suffix('.tmp'); temporary.write_bytes(packed); temporary.replace(output)
    manifest = {k: v for k, v in payload.items() if k not in ('neurons', 'edges')}
    manifest.update(neurons=len(neurons), points=sum(len(n['points']) for n in neurons),
                    edges=len(payload['edges']), sha256=hashlib.sha256(packed).hexdigest())
    (output.parent / 'anatomy-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == '__main__':
    main()
