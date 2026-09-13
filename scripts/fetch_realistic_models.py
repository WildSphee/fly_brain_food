"""Vendor detailed fly/plant visuals with pinned sources and local-only runtime files.

Run in a separate tools venv with trimesh==5.1.0, fast-simplification==0.2.0,
numpy==2.5.3, scipy==1.18.1, pillow==12.3.0. These are import-time tools only.
Fly meshes are simplified and assembled from the MJCF reference pose; MuJoCo
dynamics and research locomotion policies are not imported into the application.
"""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import struct
import urllib.request
import xml.etree.ElementTree as ET

import numpy as np
from scipy.spatial.transform import Rotation
import trimesh

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'frontend/public/models'
CACHE = ROOT / '.cache/realistic-models'
FLY_COMMIT = 'ac6b2b09983786f3036cab1000221017fa2193b4'
PLANT_COMMIT = '81e8b567643b5166e6ff40024e4ff71ad4b18676'
FLY_BASE = f'https://raw.githubusercontent.com/google-deepmind/mujoco_menagerie/{FLY_COMMIT}/flybody/'
PLANT_BASE = f'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/{PLANT_COMMIT}/Models/DiffuseTransmissionPlant/'
sources = {}


def fetch(base, name):
    url = base + name
    path = CACHE / hashlib.sha256(url.encode()).hexdigest()
    if not path.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'FlyMatrix-asset-import/1.0'})
        path.write_bytes(urllib.request.urlopen(request, timeout=90).read())
    data = path.read_bytes()
    sources[url] = hashlib.sha256(data).hexdigest()
    return data


def transform(element):
    matrix = np.eye(4)
    matrix[:3, 3] = np.fromstring(element.get('pos', '0 0 0'), sep=' ')
    if 'quat' in element.attrib:
        w, x, y, z = np.fromstring(element.get('quat'), sep=' ')
        matrix[:3, :3] = Rotation.from_quat([x, y, z, w]).as_matrix()
    elif 'euler' in element.attrib:
        matrix[:3, :3] = Rotation.from_euler('xyz', np.fromstring(element.get('euler'), sep=' ')).as_matrix()
    return matrix


def fly():
    import io
    xml = ET.fromstring(fetch(FLY_BASE, 'fruitfly.xml'))
    (OUTPUT / 'flybody-LICENSE.txt').write_bytes(fetch(FLY_BASE, 'LICENSE'))
    meshes = {m.get('name'): m.get('file') for m in xml.findall('asset/mesh')}
    with ThreadPoolExecutor(max_workers=4) as pool:
        blobs = dict(zip(meshes, pool.map(lambda f: fetch(FLY_BASE, 'assets/' + f), meshes.values())))
    # +X forward, +Z up in MJCF becomes +Z forward, +Y up in Three.js.
    axes = np.eye(4)
    axes[:3, :3] = [[0, 1, 0], [0, 0, 1], [1, 0, 0]]
    parts = defaultdict(list)
    pivots = {}
    original_faces = 0

    def visit(body, parent, assembly='body'):
        nonlocal original_faces
        world = parent @ transform(body)
        if body.get('name') in ('wing_left', 'wing_right'):
            assembly = body.get('name')
            pivots[assembly] = (axes @ world)[:3, 3]
        for geom in body.findall('geom'):
            name = geom.get('mesh')
            if not name:
                continue
            mesh = trimesh.load(io.BytesIO(blobs[name]), file_type='obj', force='mesh', process=True)
            original_faces += len(mesh.faces)
            material = geom.get('material', 'body')
            budget = 2200 if name == 'head_red' else 1800 if name in ('thorax', 'head') else 500 if assembly.startswith('wing') else 260
            if len(mesh.faces) > budget:
                mesh = mesh.simplify_quadric_decimation(face_count=budget)
            mesh.apply_scale(0.1)  # MJCF's default mesh scale.
            mesh.apply_transform(axes @ world @ transform(geom))
            parts[assembly, material].append(mesh)
        for child in body.findall('body'):
            visit(child, world, assembly)

    visit(xml.find('worldbody/body'), np.eye(4))
    scene = trimesh.Scene()
    materials = {}
    for entry in xml.findall('asset/material'):
        rgba = np.fromstring(entry.get('rgba'), sep=' ')
        materials[entry.get('name')] = trimesh.visual.material.PBRMaterial(
            name=entry.get('name'), baseColorFactor=np.round(rgba * 255).astype(np.uint8),
            metallicFactor=0, roughnessFactor=0.48,
            alphaMode='BLEND' if rgba[3] < 1 else 'OPAQUE', doubleSided=rgba[3] < 1,
        )
    for name, pivot in pivots.items():
        matrix = np.eye(4)
        matrix[:3, 3] = pivot
        scene.graph.update(frame_from='world', frame_to=name, matrix=matrix)
    count = 0
    for (assembly, material), group in parts.items():
        mesh = trimesh.util.concatenate(group)
        if assembly in pivots:
            mesh.apply_translation(-pivots[assembly])
        mesh.visual = trimesh.visual.TextureVisuals(material=materials[material])
        name = f'{assembly}_{material}'
        scene.add_geometry(mesh, node_name=name, geom_name=name,
                           parent_node_name=assembly if assembly in pivots else 'world')
        count += len(mesh.faces)
    scene.metadata['copyright'] = 'Flybody: Google DeepMind and HHMI Janelia. Apache-2.0. Simplified and converted for Fly Matrix.'
    (OUTPUT / 'fruitfly.glb').write_bytes(scene.export(file_type='glb', include_normals=True))
    print(f'Fly: {original_faces:,} source triangles -> {count:,} triangles', flush=True)
    return count


def plant():
    data = fetch(PLANT_BASE, 'glTF-Binary/DiffuseTransmissionPlant.glb')
    length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + length])
    # Keep only the authored plant. Sample fireflies, lights, and cameras do not
    # belong in the kitchen, and must not affect the simulation's illumination.
    nodes = [n for n in doc['nodes'] if n.get('name') in ('pot', 'leaves', 'dirt')]
    assert len(nodes) == 3
    doc['nodes'] = nodes
    doc['scenes'] = [{'nodes': list(range(len(nodes)))}]
    doc['scene'] = 0
    for key in ('animations', 'cameras', 'extensions'):
        doc.pop(key, None)
    # This Three.js version renders the standard PBR leaf material. Retain its
    # original color/normal/roughness/alpha maps without the sample-only extension.
    doc.pop('extensionsUsed', None)
    doc.pop('extensionsRequired', None)
    for material in doc['materials']:
        material.pop('extensions', None)
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary_chunk = data[20 + length:]
    result = struct.pack('<4sII', b'glTF', 2, 20 + len(encoded) + len(binary_chunk))
    result += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + binary_chunk
    (OUTPUT / 'realisticPlant.glb').write_bytes(result)
    (OUTPUT / 'realisticPlant-LICENSE.md').write_bytes(fetch(PLANT_BASE, 'LICENSE.md'))
    (OUTPUT / 'realisticPlant-source.md').write_bytes(fetch(PLANT_BASE, 'README.body.md'))


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    triangles = fly()
    plant()
    manifest = {
        'fly': {'source': 'https://github.com/google-deepmind/mujoco_menagerie/tree/' + FLY_COMMIT + '/flybody',
                'license': 'Apache-2.0', 'triangles': triangles,
                'changes': 'Simplified meshes; assembled reference pose; changed axes; separate animated wing pivots; GLB export.'},
        'plant': {'source': 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/' + PLANT_COMMIT + '/Models/DiffuseTransmissionPlant',
                  'original': 'https://polyhaven.com/a/potted_plant_02',
                  'credit': 'Rico Cilliers / Poly Haven (CC0); Darmstadt Graphics Group, 2024, and Eric Chadwick (CC BY 4.0).',
                  'license': 'CC-BY-4.0 / CC0-1.0',
                  'changes': 'Removed sample fireflies, animations, cameras, lights, and diffuse-transmission extension; retained standard PBR plant meshes and textures.'},
        'source_sha256': dict(sorted(sources.items())),
        'output_sha256': {name: hashlib.sha256((OUTPUT / name).read_bytes()).hexdigest()
                          for name in ('fruitfly.glb', 'realisticPlant.glb')},
    }
    (OUTPUT / 'realism-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
