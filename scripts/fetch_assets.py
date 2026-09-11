"""Reproduce vendored Kenney CC0 assets, embedding external texture images in GLB."""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import struct
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'food-kit': 'https://kenney.nl/media/pages/assets/food-kit/83086fa91c-1719418518/kenney_food-kit.zip',
    'furniture-kit': 'https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip',
}


def embed_glb(raw, resolve):
    _, version, _ = struct.unpack_from('<III', raw)
    json_length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+json_length])
    offset = 20+json_length
    bin_length = struct.unpack_from('<I', raw, offset)[0]
    binary = bytearray(raw[offset+8:offset+8+bin_length])
    for img in doc.get('images', []):
        if 'uri' not in img:
            continue
        image_data = resolve(img.pop('uri'))
        while len(binary) % 4:
            binary.append(0)
        views = doc.setdefault('bufferViews', [])
        views.append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(image_data)})
        img.update(bufferView=len(views)-1, mimeType='image/png')
        binary.extend(image_data)
    doc['buffers'][0]['byteLength'] = len(binary)
    while len(binary) % 4:
        binary.append(0)
    js = json.dumps(doc, separators=(',', ':')).encode()
    js += b' ' * ((-len(js)) % 4)
    size = 12+8+len(js)+8+len(binary)
    return struct.pack('<III', 0x46546C67, version, size)+struct.pack('<II', len(js), 0x4E4F534A)+js+struct.pack('<II', len(binary), 0x004E4942)+binary


def main():
    target = ROOT / 'frontend/public/models'
    manifest = json.loads((target / 'manifest.json').read_text())
    for kit, url in SOURCES.items():
        with urllib.request.urlopen(url, timeout=60) as response:
            archive = zipfile.ZipFile(io.BytesIO(response.read()))
        for item in manifest:
            if not item['source'].endswith(kit):
                continue
            path = next(p for p in archive.namelist() if p.endswith('/'+item['file']))
            raw = archive.read(path)
            packed = embed_glb(raw, lambda uri: archive.read(str(PurePosixPath(path).parent / uri)))
            (target / item['file']).write_bytes(packed)
            item.update(sha256=hashlib.sha256(packed).hexdigest(), source_sha256=hashlib.sha256(raw).hexdigest(),
                        modification='External atlas embedded in GLB; geometry and texture pixels unchanged.')
        print(f'Vendored {kit} assets with embedded textures.')
    (target / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')


if __name__ == '__main__':
    main()
