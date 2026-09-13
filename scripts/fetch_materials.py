"""Vendor ambientCG's CC0 1K PBR maps; runtime stays entirely local.

Only color, OpenGL normal, and roughness maps are needed by the renderer.
Source archive and exact file hashes are recorded for reproducibility.
"""
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

OUT = Path(__file__).resolve().parents[1] / 'frontend/public/materials'
ASSETS = ['Marble012', 'Wood049', 'Metal032', 'Plaster001', 'Fabric032']


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for asset in ASSETS:
        url = f'https://ambientcg.com/get?file={asset}_1K-JPG.zip&download=1'
        request = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0', 'Referer': 'https://ambientcg.com/'})
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
        files = []
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            for channel in ['Color', 'NormalGL', 'Roughness']:
                name = next(n for n in archive.namelist() if n.endswith(f'_{channel}.jpg'))
                data = archive.read(name)
                filename = f'{asset}_1K-JPG_{channel}.jpg'
                (OUT / filename).write_bytes(data)
                files.append({'file': filename, 'sha256': hashlib.sha256(data).hexdigest()})
        manifest.append({'id': asset, 'source': f'https://ambientcg.com/view?id={asset}',
                         'download': url, 'license': 'CC0-1.0',
                         'archive_sha256': hashlib.sha256(raw).hexdigest(), 'files': files})
        print(f'Vendored {asset}', flush=True)
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
