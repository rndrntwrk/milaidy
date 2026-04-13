# Cloud Docker image optimization notes

## Result

`deploy/Dockerfile.cloud` switches the cloud image from "copy the whole repo + existing Bun node_modules" to a production-only runtime assembly.

In local validation, the assembled runtime footprint was roughly:

- `node_modules`: **~346MB**
- `apps/app/dist`: **~149MB**
- `dist`: **~1.4MB**
- `tsx` loader: **~12MB**

That puts the final image comfortably below the previous **5.25GB** image and well under the **2GB** target after adding the base image/runtime packages.

## What was making the old image huge

Biggest culprits in the existing install:

- `node_modules/.bun`: **~3.3GB** by itself
- `node_modules/@node-llama-cpp`: **~702MB**
- `node_modules/onnxruntime-node`: **~212MB**
- `node_modules/@biomejs`: **~100MB**
- `node_modules/testcafe`: **~79MB**
- `node_modules/@storybook`: **~54MB**
- `node_modules/three`: **~37MB**
- `node_modules/electrobun`: **~24MB**

The Bun store also contained lots of duplicate and multi-platform payloads, for example:

- `@elizaos/core`: **13 versions**
- `three`: **3 versions**
- `lucide-react`: **3 versions**
- `typescript`: **3 versions**
- `@rolldown/binding-linux-x64-*`: **5 versions each**

The heaviest `.bun` entries included:

- `@node-llama-cpp+linux-x64-cuda-ext`: **444MB**
- `onnxruntime-node`: **208MB**
- `@node-llama-cpp+linux-x64-cuda`: **153MB**
- `onnxruntime-web`: **91MB**
- `@node-llama-cpp+linux-x64-vulkan`: **76MB**

## Strategy used in `deploy/Dockerfile.cloud`

1. **Production-only install** via Bun (`bun install --production --frozen-lockfile --ignore-scripts`)
2. **Manifest-only dependency resolution** in the deps stage so the builder does not need the entire repo for install
3. **Flatten Bun symlinks** with `cp -aL node_modules/. ...` into a runtime tree
4. **Delete `node_modules/.bun` entirely** after flattening
5. **Embed only required workspace source packages** into `node_modules/@miladyai/*`
   - `agent`
   - `app-core`
   - `shared`
   - `ui`
6. **Copy only runtime artifacts**
   - root `dist/`
   - `apps/app/dist/`
   - `milady.mjs`
   - `plugins.json`
   - docker entrypoint
7. **Preserve compatibility patches** from `deploy/Dockerfile.ci`
   - plugin-agent-skills crash guard
   - version patching for `@elizaos/agent`
8. **Prune obvious non-runtime weight** from the flattened runtime tree
   - source maps
   - test directories
   - Storybook
   - TestCafe / Playwright
   - Biome / TypeScript / Vite / prettier / type packages

## Runtime compatibility note

The CLI still imports workspace package source paths like `@elizaos/agent/src/...`, so the cloud image cannot be fully `dist`-only yet. To keep startup working, `deploy/Dockerfile.cloud` includes the required workspace source packages and uses a tiny standalone `tsx` loader path:

```sh
node --import /opt/tsx/node_modules/tsx/dist/loader.mjs milady.mjs start
```

## Validation performed

Validated the assembled runtime tree outside Docker with:

```sh
sh ./scripts/docker-entrypoint.sh \
  node --import /opt/tsx/node_modules/tsx/dist/loader.mjs \
  milady.mjs start --help
```

That successfully parsed the entrypoint and CLI startup path.
