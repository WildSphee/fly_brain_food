# Asset credits and reproducibility

The kitchen props include locally vendored glTF/GLB models from Kenney:

- [Food Kit](https://kenney.nl/assets/food-kit), CC0 1.0.
- [Furniture Kit](https://kenney.nl/assets/furniture-kit), CC0 1.0.

All model files and exact source links are listed in
`frontend/public/models/manifest.json`. Some original GLBs referenced external PNG
atlases. `scripts/fetch_assets.py` embeds those unchanged texture pixels into each GLB,
records both original and transformed hashes, and keeps runtime loading entirely local.
Run `python3 scripts/fetch_assets.py` to reproduce the asset vendoring.

The material pass uses five locally vendored [ambientCG](https://ambientcg.com/)
texture sets, released under [CC0 1.0](https://docs.ambientcg.com/license/):

| Asset | Use |
|---|---|
| [Marble 012](https://ambientcg.com/view?id=Marble012) | Countertops and window sill |
| [Wood 049](https://ambientcg.com/view?id=Wood049) | Shelves, stools, boards, and wooden props |
| [Metal 032](https://ambientcg.com/view?id=Metal032) | Sink, appliances, cookware, and brass hardware |
| [Plaster 001](https://ambientcg.com/view?id=Plaster001) | Walls; subtle surface detail on paint, ceramic, and food |
| [Fabric 032](https://ambientcg.com/view?id=Fabric032) | Rug and stool upholstery |

Color, OpenGL normal, and roughness maps are included at 1K. Exact download links
and SHA-256 hashes are in `frontend/public/materials/manifest.json`.
`python3 scripts/fetch_materials.py` reproduces the downloads. All maps load locally;
no runtime requests go to asset providers. Imported models retain their original
color atlases where needed, with a separate UV channel for material detail.
The geometry remains a lightweight stylized kitchen, with physically based surfaces.

The fly now uses the anatomical [Flybody model](https://github.com/TuragaLab/flybody),
created by Google DeepMind and HHMI Janelia, distributed through
[MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie/tree/ac6b2b09983786f3036cab1000221017fa2193b4/flybody)
under Apache-2.0. The 272,550-triangle source is simplified to 32,412 triangles and
assembled from the MJCF reference pose into an 809 KB GLB with smooth normals and separate wing pivots.
It retains segmented anatomy, six jointed legs, antennae, red eyes, and wing veins.
Coordinate conversion, simplification, subtle identification tint, and illustrative
wing animation are local adaptations. The research locomotion controller and MuJoCo
body dynamics are not used; the application still uses its existing Rapier body.
The upstream license is stored in `frontend/public/models/flybody-LICENSE.txt`.

All four plants use [Potted Plant 02](https://polyhaven.com/a/potted_plant_02)
by Rico Cilliers / Poly Haven (CC0), via the
[Khronos Diffuse Transmission Plant](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/81e8b567643b5166e6ff40024e4ff71ad4b18676/Models/DiffuseTransmissionPlant)
adaptation by Darmstadt Graphics Group (2024) and Eric Chadwick (CC BY 4.0).
The local 5.75 MB GLB keeps textured leaves, stems, soil, and terracotta pot. Sample
fireflies, lights, cameras, animations, and the unsupported diffuse-transmission
extension are removed; standard PBR textures and leaf transparency remain intact.
Credits and upstream license notices are stored beside the GLB.

`scripts/fetch_realistic_models.py` reproduces both conversions from pinned commits.
Its import-only dependencies are documented in the script; they are not needed to
run the app. Source and output SHA-256 hashes are in
`frontend/public/models/realism-manifest.json`. All models load locally at runtime.

Architecture, food icons, illustrative brain graphic, and interface are
original procedural work in this repository. The neural viewer uses real MaleCNS centerline skeletons in measured coordinates;
its data provenance is described in `docs/science.md`. The binary-rain background
is original procedural canvas work.

DM Sans and DM Mono are from Google Fonts under the SIL Open Font License. Fonts and
license texts are stored under `frontend/public/fonts`. No font CDN is contacted at runtime.

Three.js and Rapier supply rendering and rigid-body dynamics; their packages retain
their upstream license files in `node_modules`. Data attribution is in `docs/science.md`.
