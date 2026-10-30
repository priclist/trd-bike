# TRD Bike

A web project for TRD Bike.

## Getting Started

Install dependencies:
```bash
npm install
```

Run the development server:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

## Project Structure

- `index.html` - Main HTML entry point
- `assets/` - Static assets
- `data/` - Data files
- `scraper/` - Web scraping utilities
- `tools/` - Development tools

## 3D bike (S1000 RR section)

The section under the hero draws a 3D model with three.js (`assets/bike3d.js`). Until the model file is in
place, the cut-out photo of the bike shows instead, so the page works either way.

1. Sign in to Sketchfab and open https://sketchfab.com/3d-models/bmw-s1000-rr-1873aed292d6465694119bd81860a0c2
2. Click **Download 3D Model** and pick **glTF Binary (.glb)**.
3. Shrink it (the original is ~300k triangles), then save it as `assets/models/bmw-s1000rr.glb`:
   ```bash
   npx @gltf-transform/cli optimize ~/Downloads/bmw_s1000_rr.glb assets/models/bmw-s1000rr.glb \
     --compress meshopt --texture-compress webp --texture-size 2048
   ```
4. If the bike loads facing the wrong way, set `FLIP = true` at the top of `assets/bike3d.js`.

Licence: the model is CC BY-NC-SA 4.0 by VTX_car. The credit line in the finale section is required, and the
licence does not allow commercial use, so get the author's permission (or buy/commission a commercially
licensed model) before this goes on the live dealership site.
