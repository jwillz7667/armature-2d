# Gunner N Pals pilot authoring

This production uses Armature's existing command handlers to author nine rigs
(eight characters plus George's rescue pose) and twelve scenes. SVG artwork,
sound recordings and scene data are in the separate Gunner N Pals Armature
Project download. The engine and document format are unchanged.

## Open and edit

Extract the project download and open any document under `editor/scenes` in
Armature 2D. Keep its sibling `.textures` folder. Select the `pilot` animation.
Individual rigs and demonstration clips are under `editor/rigs`.

Head, eye, ear, tail and torso bones control those pieces. Each leg has a
two-bone IK chain, a weighted mesh and an independent foot control. Mouths use
attachment keys. Stage roots place characters; the camera bone controls framing.
Audio is supplied as aligned media and is muxed into the final movie; the scene
documents do not embed it.

## Dependencies

Use the repository's Node and pnpm versions, then run `pnpm install --frozen-lockfile`.
Rendering needs FFmpeg and Python 3 with Pillow. Rebuilding the artwork also needs
NumPy, SciPy, lxml, vtracer and Sharp. Sharp can be installed in a separate tools
directory; set `ARMATURE_PILOT_NODE_MODULES` to that directory's `node_modules`.
`ARMATURE_PILOT_PYTHON` can select a Python executable for the alpha-bleed helper.

Run the following commands from the repository root. Set `ARMATURE_PILOT_DIR` to
the absolute path of the extracted project, with its `episode-timeline.json`.

```bash
export ARMATURE_PILOT_DIR=/absolute/path/to/armature-project
```

## Render the supplied project

```bash
python3 demo/pilot/tools/render-backgrounds.py "$ARMATURE_PILOT_DIR"
for scene in 01 02 03 04 05 06 07 08 09 10 11 12; do
  pnpm --filter @marionette/render-preview exec node --import tsx "$PWD/demo/pilot/tools/render-scene.mts" "$scene" video
done
python3 demo/pilot/tools/assemble-episode.py "$ARMATURE_PILOT_DIR" "$ARMATURE_PILOT_DIR/audio/final-mix.m4a" "$ARMATURE_PILOT_DIR/Gunner-N-Pals-Pilot-1080p.mp4"
```

Each scene render validates its native document hash and decoded output frame
count. The assembler checks all scene lengths, muxes AAC stereo, decodes the
entire final movie and writes `qa/episode-verification.json`.

The CPU preview renderer supplies the native character geometry and pixels.
FFmpeg handles static backgrounds, compositing and encoding. Every RGBA frame
is copied before asynchronous piping because the runtime reuses its buffer.

## Rebuild rig or placement changes

The Python `layer-characters.py` step creates layered vector artwork from the
included source references. It is only needed when retracing those references;
it overwrites the SVGs. For manual art edits, keep the layer IDs, canvas bounds
and joint registration, then synchronize the edited layers into their `parts`
SVG files:

```bash
python3 demo/pilot/tools/sync-svg-parts.py "$ARMATURE_PILOT_DIR"
```

After changing the vector parts, rebuild both atlases and every document:

```bash
pnpm --filter @marionette/render-preview exec node --import tsx "$PWD/demo/pilot/tools/prepare-atlas.mts"
pnpm --filter @marionette/render-preview exec node --import tsx "$PWD/demo/pilot/tools/prepare-scene-atlas.mts"
pnpm --filter @marionette/render-preview exec node --import tsx "$PWD/demo/pilot/tools/rig-author.mts"
pnpm --filter @marionette/render-preview exec node --import tsx "$PWD/demo/pilot/tools/author-scenes.mts"
pnpm --filter @marionette/render-preview exec node --import tsx "$PWD/demo/pilot/tools/package-editor.mts"
```

Placement and motion inputs are in `scene-controls/scene-XX.json`. If only those
inputs change, rerun `author-scenes.mts` and `package-editor.mts`, then render.
Atlas repacking requires reauthoring all documents because packed coordinates
can change. `prepare-scenes.py` is an optional migration from the older production
archive's `project/render_revised.py`; the supplied controls already include that
migration, so the older archive is not needed for playback or rendering.

## Verification

```bash
pnpm exec tsc -p demo/pilot/tsconfig.json
pnpm exec eslint demo/pilot/tools
pnpm --filter @marionette/render-preview exec node --import tsx "$PWD/demo/pilot/tools/render-rig-review.mts"
```

The rig review renders representative poses and checks that native IK preserves
registered rest joints and that stationary foot controls stay fixed. The editor
packager validates each document and its texture sidecars. Desktop UI playback
was not exercised in the headless production environment.
