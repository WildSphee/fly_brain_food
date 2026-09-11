"""Download an explicitly bounded, authentic MaleCNS induced circuit from neuPrint.

No IDs, annotations, or edges are synthesized. Refresh is an explicit developer action.
Run: .venv/bin/python scripts/import_connectome.py
"""
import gzip
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.settings import settings  # noqa: E402


def main():
    token = settings.neuprint_api_key.get_secret_value()
    if not token:
        raise SystemExit('Set NEUPRINT_API_KEY in .env to refresh the real circuit.')
    queries = []
    with httpx.Client(base_url='https://neuprint.janelia.org', headers={'Authorization': f'Bearer {token}'}, timeout=120) as client:
        def query(cypher):
            queries.append(cypher)
            response = client.post('/api/custom/custom', json={'dataset': settings.neuprint_dataset, 'cypher': cypher})
            if response.status_code != 200:
                raise RuntimeError(f'neuPrint returned HTTP {response.status_code}; existing snapshot was preserved.')
            return response.json()['data']

        rows = query('MATCH (n:Neuron) WHERE n.type IN ["ORN_DM1", "ORN_DM2", "ORN_VA2", "LC4"] '
                     'OR n.class IN ["thermosensory", "gustatory"] RETURN n.bodyId ORDER BY n.bodyId')
        seeds = {int(r[0]) for r in rows}
        selected = set(seeds)
        frontier = seeds
        print(f'Actual annotated sensory/projection seeds: {len(seeds)}', flush=True)
        for limit in [700, 1000, 900]:
            ids = json.dumps(sorted(frontier))
            rows = query(f'MATCH (a:Neuron)-[c:ConnectsTo]->(b:Neuron) WHERE a.bodyId IN {ids} '
                         f'AND c.weight >= 5 AND NOT b.bodyId IN {json.dumps(sorted(selected))} '
                         f'RETURN b.bodyId, sum(c.weight) AS w ORDER BY w DESC, b.bodyId LIMIT {limit}')
            frontier = {int(r[0]) for r in rows}
            selected.update(frontier)
            print(f'Expanded circuit to {len(selected)} measured neurons', flush=True)
        ids = json.dumps(sorted(selected))
        rows = query(f'MATCH (n:Neuron) WHERE n.bodyId IN {ids} RETURN n.bodyId, n.type, n.instance, '
                     'n.class, n.superclass, n.somaSide, n.rootSide, n.consensusNt, n.predictedNt ORDER BY n.bodyId')
        neurons = []
        for body, kind, instance, cls, superclass, soma, root, consensus, predicted in rows:
            side = root or soma or ('L' if (instance or '').endswith('_L') else 'R' if (instance or '').endswith('_R') else 'U')
            modality = 'olfactory' if (kind or '').startswith('ORN') else 'thermal' if cls == 'thermosensory' else 'taste' if cls == 'gustatory' else 'visual' if kind == 'LC4' else None
            neurons.append(dict(id=str(body), type=kind or 'untyped', instance=instance, group=superclass or 'unknown',
                                side=side, nt=consensus or predicted or 'unknown', modality=modality if body in seeds else None))
        edges = []
        # Batches bound response size. ConnectsTo stores total synapses per pair, not per-ROI duplicates.
        for offset in range(0, len(neurons), 250):
            batch = [int(n['id']) for n in neurons[offset:offset + 250]]
            rows = query(f'MATCH (a:Neuron)-[c:ConnectsTo]->(b:Neuron) WHERE a.bodyId IN {json.dumps(batch)} '
                         f'AND b.bodyId IN {ids} AND c.weight >= 3 RETURN a.bodyId,b.bodyId,c.weight ORDER BY a.bodyId,b.bodyId')
            edges.extend([str(a), str(b), int(w)] for a, b, w in rows)
        if not edges or not any(n['group'] == 'descending_neuron' for n in neurons):
            raise RuntimeError('Circuit has no measured edges or descending readouts; refusing to save.')
        payload = dict(dataset=settings.neuprint_dataset, source='https://neuprint.janelia.org',
            license='CC-BY-4.0', fetched_at=datetime.now(timezone.utc).isoformat(),
            selection='Sensory seeds + three strongest outgoing expansions (700/1000/900); induced edges >=3 synapses.',
            queries=queries, neurons=neurons, edges=edges)
        raw = json.dumps(payload, separators=(',', ':')).encode()
        target = ROOT / 'backend/data/malecns-circuit.json.gz'
        target.parent.mkdir(exist_ok=True)
        packed = gzip.compress(raw, mtime=0)
        temporary = target.with_suffix('.tmp')
        temporary.write_bytes(packed)
        temporary.replace(target)
        manifest = {k: v for k, v in payload.items() if k not in ('neurons', 'edges', 'queries')}
        manifest.update(neurons=len(neurons), edges=len(edges), synapses=sum(e[2] for e in edges),
                        sha256=hashlib.sha256(packed).hexdigest(), descending_neurons=sum(n['group']=='descending_neuron' for n in neurons))
        (target.parent / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
        print(json.dumps(manifest, indent=2), flush=True)


if __name__ == '__main__':
    main()
