# Structure Synth Web

A browser remake of [Structure Synth](https://structuresynth.sourceforge.net/). Write rules in EisenScript, watch the 3D model build as you type, and raytrace it to an image.

This is an independent project, not affiliated with the original. Structure Synth was created by Mikael Hvidtfeldt Christensen.

**Try it:** https://bazz123.github.io/structure-synth-web/

## Run it locally

Browsers don't start Web Workers from `file://` pages, so serve the folder locally:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## What it does

- Rebuilds the model as you type, and points to the line of any script error
- Shows a live 3D view you can orbit and zoom
- Raytraces with shadows, ambient occlusion, reflections, transparency and depth of field
- Includes a seed control for repeatable variations
- Exports PNG, OBJ with MTL, and the script

Save buttons download files directly when the page runs on its own. Inside the Claude Artifact viewer they use its save service, or open a panel where you can right-click the image or copy the text.

## Files

| File | Purpose |
|---|---|
| `index.html` | Editor, live view and page logic |
| `engine.js` | EisenScript parser and rule engine |
| `raytrace.js` | Raytracer worker |
| `objexport.js` | OBJ, MTL and ZIP export worker |
| `examples.js` | Starter examples written for this project |
| `examples-original.js` | Example scripts from the Structure Synth 1.5.0 download |

The engine was written from the language's behavior, not translated from the original C++ source.

## Known differences from Structure Synth

- Random results differ from the original, even with the same seed
- Raytrace settings are an approximation, and the field of view is an estimate
- `cylinder` draws as a box
- Templates and image color pools aren't supported
- Grids, lines and dots appear only in the live view, not in raytraced images
- Builds stop at 1,000,000 objects, and OBJ export stops at 300,000

## License

GPL 3. See [LICENSE](LICENSE). The scripts in `examples-original.js` come from the Structure Synth 1.5.0 download, which is licensed under LGPL 2.1 or GPL 3.
