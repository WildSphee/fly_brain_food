# Asset credits and reproducibility

The kitchen uses 36 locally vendored glTF/GLB models from Kenney:

- [Food Kit](https://kenney.nl/assets/food-kit), CC0 1.0.
- [Furniture Kit](https://kenney.nl/assets/furniture-kit), CC0 1.0.

All model files and exact source links are listed in
`frontend/public/models/manifest.json`. Some original GLBs referenced external PNG
atlases. `scripts/fetch_assets.py` embeds those unchanged texture pixels into each GLB,
records both original and transformed hashes, and keeps runtime loading entirely local.
Run `python3 scripts/fetch_assets.py` to reproduce the asset vendoring.

Architecture, fly geometry, food icons, illustrative brain graphic, and interface are
original procedural work in this repository. The neural graph view uses real measured
edges; its layout is illustrative. The small decorative brain graphic is illustrative.

DM Sans and DM Mono are from Google Fonts under the SIL Open Font License. Fonts and
license texts are stored under `frontend/public/fonts`. No font CDN is contacted at runtime.

Three.js and Rapier supply rendering and rigid-body dynamics; their packages retain
their upstream license files in `node_modules`. Data attribution is in `docs/science.md`.
