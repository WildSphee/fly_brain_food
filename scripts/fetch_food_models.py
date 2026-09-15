"""Vendor realistic food as self-contained GLBs. Requires Blender 5.0.x + NumPy/Pillow.

Run: python3 scripts/fetch_food_models.py
Source meshes and authored UVs are retained; scan maps become standard PBR.
Only selected cheese geometry is exported from the CC0 pack. No runtime network.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache/food-models'
OUT = ROOT / 'frontend/public/models'
SOURCES = {
    '3DApple002_SQ-1K-JPG.zip': 'https://ambientcg.com/get?file=3DApple002_SQ-1K-JPG.zip&download=1',
    '3DBread011_SQ-1K-JPG.zip': 'https://ambientcg.com/get?file=3DBread011_SQ-1K-JPG.zip&download=1',
    'banana.tgz': 'https://ycb-benchmarks.s3.amazonaws.com/data/google/011_banana_google_16k.tgz',
    'foodPackOGACC0.blend': 'https://opengameart.org/sites/default/files/foodPackOGACC0.blend',
}
CREDITS = {
    'apple': {'source': 'https://ambientcg.com/view?id=3DApple002', 'author': 'Lennart Demes / ambientCG', 'license': 'CC0-1.0'},
    'bread': {'source': 'https://ambientcg.com/view?id=3DBread011', 'author': 'Lennart Demes / ambientCG', 'license': 'CC0-1.0'},
    'banana': {'source': 'https://ycb-benchmarks.s3.amazonaws.com/index.html', 'author': 'YCB Object and Model Set / Google scanner', 'license': 'CC-BY-4.0'},
    'cheese': {'source': 'https://opengameart.org/content/food-pack-0', 'author': 'yd', 'license': 'CC0-1.0'},
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def download(item):
    name, url = item
    dest = CACHE / name
    if not dest.exists():
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://ambientcg.com/'})
        dest.write_bytes(urllib.request.urlopen(req, timeout=90).read())
    if name.endswith('.zip'):
        with zipfile.ZipFile(dest) as archive:
            archive.extractall(CACHE / name.split('_')[0])
    elif name.endswith('.tgz'):
        with tarfile.open(dest) as archive:
            archive.extractall(CACHE, filter='data')


def convert():
    import bpy

    def material(name, color, normal=None, roughness=None, rough=0.65):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nodes, links = m.node_tree.nodes, m.node_tree.links
        shader = nodes.get('Principled BSDF')
        shader.inputs['Roughness'].default_value = rough

        def image_node(image, noncolor=False):
            node = nodes.new('ShaderNodeTexImage')
            node.image = image if isinstance(image, bpy.types.Image) else bpy.data.images.load(str(image), check_existing=True)
            if noncolor:
                node.image.colorspace_settings.name = 'Non-Color'
            return node

        links.new(image_node(color).outputs['Color'], shader.inputs['Base Color'])
        if normal:
            tex = image_node(normal, True)
            bump = nodes.new('ShaderNodeNormalMap')
            links.new(tex.outputs['Color'], bump.inputs['Color'])
            links.new(bump.outputs['Normal'], shader.inputs['Normal'])
        if roughness:
            links.new(image_node(roughness, True).outputs['Color'], shader.inputs['Roughness'])
        return m

    summary = {}
    for kind in ('apple', 'bread', 'banana', 'cheese'):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        if kind == 'cheese':
            # This pack has whole wheels, cut wheels and slices. Keep one cut wheel.
            bpy.ops.wm.open_mainfile(filepath=str(CACHE / 'foodPackOGACC0.blend'))
            objects = [bpy.data.objects['Circle.004']]
            mat = material('Cheese rind and cut surface', bpy.data.images['cheese'], bpy.data.images['cheese01N.png'], rough=0.72)
        else:
            if kind == 'banana':
                folder = CACHE / '011_banana/google_16k'
                obj = folder / 'textured.obj'
                mat = material('YCB banana scan', folder / 'texture_map.png', rough=0.56)
            else:
                asset = '3DApple002' if kind == 'apple' else '3DBread011'
                folder = CACHE / asset
                base = folder / (asset + '_SQ-1K-JPG')
                obj = base.with_suffix('.obj')
                roughness = Path(str(base) + '_Roughness.jpg')
                mat = material(asset, Path(str(base) + '_Color.jpg'), Path(str(base) + '_NormalGL.jpg'), roughness if roughness.exists() else None, rough=0.86)
            bpy.ops.wm.obj_import(filepath=str(obj), forward_axis='NEGATIVE_Y' if kind == 'banana' else 'NEGATIVE_Z', up_axis='Z' if kind == 'banana' else 'Y')
            objects = list(bpy.context.selected_objects)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
            obj.data.materials.clear()
            obj.data.materials.append(mat)
            # Preserve the authored cheese's hard edges; smooth scanned surfaces.
            if kind != 'cheese':
                for poly in obj.data.polygons:
                    poly.use_smooth = True
            obj.name = 'food-' + kind
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bpy.context.scene.render.image_settings.file_format = 'PNG'
        output = OUT / f'food-{kind}.glb'
        bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
                                  export_yup=True, export_animations=False, export_cameras=False,
                                  export_lights=False, export_extras=False, export_copyright=f"{CREDITS[kind]['author']} · {CREDITS[kind]['license']}. Converted for Fly Matrix.")
        for obj in objects:
            obj.data.calc_loop_triangles()
        summary[kind] = {**CREDITS[kind], 'file': output.name,
                         'triangles': sum(len(o.data.loop_triangles) for o in objects),
                         'bytes': output.stat().st_size, 'sha256': sha(output),
                         'changes': 'Selected source mesh; coordinate conversion; standard PBR material with original UVs/textures; self-contained GLB export.'}
    manifest = {'converter': 'Blender ' + bpy.app.version_string, 'models': summary,
                'sources': [{'url': url, 'sha256': sha(CACHE / name)} for name, url in SOURCES.items()]}
    (OUT / 'food-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(download, SOURCES.items()))
    subprocess.run(['blender', '--background', '--python-exit-code', '1', '--python', str(Path(__file__).resolve()), '--', '--convert'], check=True)


if __name__ == '__main__':
    convert() if '--convert' in sys.argv else main()
