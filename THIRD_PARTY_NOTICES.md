# Third-Party Notices

This page lists third-party software, models, platform names, and visual assets that are bundled with or actively used by Mon Mur.

The bundled software and model licenses identified below (Apache License 2.0 and BSD 3-Clause) are compatible with GPLv3. Their original notices and license terms still apply. That compatibility does not grant rights to redistribute third-party logos, artwork, or other brand assets; see the visual-asset notes below and `docs/amo/ASSET-LICENSES.fr.md`.

## Browser-provided features

Mon Mur uses Firefox's built-in Web Speech API for optional article read-aloud. The available voices are supplied by the browser and depend on the user's Firefox and operating-system configuration. Mon Mur does not bundle a speech engine or voice model.

The **Affiliation dans les contenus** smart filter uses Mon Mur's own detection rules. It does not bundle a third-party library or use an external affiliation-analysis service.

## Bundled software and models

### hls.js 1.7.2

`vendor/hls.min.js` is loaded on demand to play discovered HLS streams through the browser's Media Source Extensions API. It is not loaded for ordinary MP4/WebM videos or embedded players.

- Upstream project: <https://github.com/video-dev/hls.js>
- License: Apache License 2.0. The distributed license text, including notices for derived code, is included in `vendor/HLS-LICENSE.txt`.

### dash.js 5.2.1

`vendor/dash.all.min.js` is loaded only when a DASH stream is explicitly played in an article.

- Upstream project: <https://github.com/Dash-Industry-Forum/dash.js>
- Release: <https://github.com/Dash-Industry-Forum/dash.js/releases/tag/v5.2.1>
- License: BSD 3-Clause. The upstream license is included in `vendor/DASH-LICENSE.txt`.

### Mozilla Readability

`vendor/Readability.js` is bundled and used to extract readable article content from web pages when a feed does not provide the full text.

- Upstream project: <https://github.com/mozilla/readability>
- License: Apache License 2.0 <https://www.apache.org/licenses/LICENSE-2.0>. The distributed license text is included in `vendor/READABILITY-LICENSE.md`.

### MediaPipe Tasks Vision for Web 0.10.21

The bundled `vendor/vision_bundle.mjs` and files under `vendor/wasm/` provide the local face-detection runtime used by the optional **Visages dans les vignettes** filter.

- Package: <https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.21>
- Upstream source: <https://github.com/google-ai-edge/mediapipe>
- `vendor/vision_bundle.mjs`, both `vendor/wasm/vision_wasm_*.js` glue files, and both `.wasm` binaries are byte-identical to the official package 0.10.21. Mon Mur imports the official bundle and supplies the local WASM directory URL through the public MediaPipe API.
- License: Apache License 2.0 <https://www.apache.org/licenses/LICENSE-2.0>.
- A copy of the Apache License 2.0 is included as `vendor/MEDIAPIPE-APACHE-LICENSE-2.0.txt`.

The JavaScript runtime and WebAssembly files are bundled locally; face detection does not use a remote inference service.

### BlazeFace short-range model

`models/blaze_face_short_range.tflite` is Google's BlazeFace short-range float16 model. It is loaded by the local MediaPipe face detector.

- Model card: <https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf>
- Model family documentation: <https://developers.google.com/edge/mediapipe/solutions/vision/face_detector>
- License identified by the model card: Apache License 2.0 <https://www.apache.org/licenses/LICENSE-2.0>.
- The same included copy of the Apache License 2.0 applies to this model.
- SHA-256 of the distributed model: `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f`.

## Platforms and visual identifiers

Mon Mur uses these third-party platforms for source collection, article links, or automatic walls. Their names and marks remain the property of their respective owners; their appearance in Mon Mur does not imply endorsement.

- **YouTube** and **PeerTube**: optional video sources. The simplified SVG identifiers in `icons/youtube.svg` and `icons/peertube.svg` are used in preferences and video cards.
- **CrowdBunker**: optional video source. `icons/crowdbunker.png` is its public site favicon, downloaded from <https://crowdbunker.com/favicon.png>.
- **Rumble**: optional video source. `icons/rumble.svg` is the Rumble mark from Simple Icons, licensed CC0 1.0: <https://github.com/simple-icons/simple-icons>.
- **Bluesky**: optional social source. `icons/bluesky.svg` is the standalone butterfly from Bluesky's official brand assets: <https://bsky.social/about/support/icons>. Use remains subject to Bluesky's trademark policy and brand guidelines.
- **LinkedIn**: optional social source. `icons/linkedin.svg` is used by the interface; its author, source, and redistribution permission are not documented in this repository.
- **Internet Archive**: public metadata and document listings are used by the optional PDF automatic wall: <https://archive.org/>.
- **AlloCiné** and **Wikipedia**: optional cinema metadata lookups use article titles to find matching public film or series information when the user has allowed automatic searches. The resulting pages remain under their respective services' terms and attribution requirements.
- **Dailymotion**: compatible video articles can use Dailymotion's embedded player. Mon Mur does not bundle its player code or visual assets.
- **Vimeo** and **France Télévisions**: video playback is supported for compatible articles, using their embedded players or discoverable HLS/DASH streams. Mon Mur does not bundle their logos or player code; their names and services remain subject to their respective terms and trademark policies.
