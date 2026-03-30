# Alice Avatar Blender Handoff

Date: 2026-03-30

Branch:
- `feat/alice-operator-ui-pass`

Checkpoint commit already on branch:
- `0fdf7271` `feat: checkpoint alice operator and speech runtime`

Related architecture review:
- `docs/alice-facial-animation-architecture-review.md`

## Purpose

This handoff captures the current state of the Alice replacement-character experiment, with a focus on:
- what is already committed in git
- what was discovered in Blender
- what remains manual and cannot be treated as a simple code task
- the safest next steps for testing a replacement avatar in the Milady runtime

## Repo State

Committed:
- the Alice operator and speech-runtime checkpoint is committed on `feat/alice-operator-ui-pass`
- the facial-animation architecture review is now part of the repo

Not part of git history:
- the live Blender scene state
- the imported GLB files in `~/Downloads`
- any temporary Blender-only face-rig experiments
- generated Playwright artifact `output/playwright/alice-runtime-probe.png`

Important implication:
- code and docs are checkpointed in git
- Blender authoring work is still an external manual asset-prep track

## Model Files Used

Original static model:
- `/Users/mac/Downloads/Meshy_AI_Golden_Halo_Girl_0329215826_texture.glb`

Rigged-body model:
- `/Users/mac/Downloads/Meshy_AI_Golden_Halo_Girl_biped/Meshy_AI_Golden_Halo_Girl_biped_Character_output.glb`

## What Was Verified In Blender

### Original static GLB

Findings:
- single mesh
- no armature
- no skin
- no shape keys
- face heavily texture-authored

Conclusion:
- not a realistic quick path to a usable VRM avatar

### Rigged-body GLB

Findings after import:
- armature exists
- mesh name was `char1`
- body is skinned to the armature
- armature has `24` humanoid bones
- no facial shape keys were present initially

Conclusion:
- this is a valid body-rig base
- face is still the blocking issue

## Face-Rig Investigation Summary

### What was tried

On the rigged-body mesh, a first-pass VRM-style shape-key set was created for testing:
- `blinkLeft`
- `blinkRight`
- `blink`
- `aa`
- `ih`
- `ou`
- `ee`
- `oh`

The first implementation failed because world-space anchors were applied against local-space shape-key data. That bug was corrected and the keys were rebuilt.

### What was learned

The corrected keys do produce real vertex deltas, but the visible result is still weak:
- blink does not visibly shut the eyes
- mouth motion is minimal on the rendered face

This is not just a rigging bug. It is primarily an asset-authoring problem:
- the eyes are largely texture-defined
- the mouth is weakly expressed in geometry
- the face is not built like a normal morph-friendly eyelid/lip setup

### Final technical conclusion

For this character, pure morph-based blinking is not sufficient.

The viable paths are:
- manual texture/material blink and mouth authoring
- deeper face re-authoring
- switching to a more face-ready base avatar

## Recommended Manual Blender Tasks

These tasks are the real remaining work if this character is kept.

### 1. Clean the scene before continuing

Remove Blender-only debug objects from the experiment:
- any `BlinkLid*` objects
- any `BlinkCard*` objects
- any temporary debug materials created just for placement tests

Restore:
- original material image `texture_0`
- shape-key preview values back to `0`

Goal:
- leave only the rigged mesh, armature, and intentional facial authoring data

### 2. Build a real blink for this asset

Do not spend more time on morph-only blink unless eyelid geometry is first improved.

Preferred options:
- author a texture/material blink by painting or masking the eye texture into a closed state
- or add explicit eyelid geometry that can convincingly cover the eye

Acceptance:
- at full blink, the visible eye is actually closed from the camera view
- blink can be driven as a single `blink` expression and optionally split to `blinkLeft` / `blinkRight`

### 3. Build readable mouth shapes

Current mouth shapes exist only as experimental morphs and do not read well enough.

Manual work needed:
- either re-author mouth geometry so morphs are visible
- or create texture/material mouth states if the face remains texture-driven

Minimum required expression set for current app compatibility:
- `aa`
- `ih`
- `ou`
- `ee`
- `oh`

Acceptance:
- each mouth shape is visually distinct in the front camera view
- `aa` in particular reads as an obvious open-mouth speaking pose

### 4. Convert the face work into VRM expressions

After blink and mouth states are genuinely working in Blender:
- use the VRM Add-on to map expressions correctly
- ensure the avatar exports with:
  - `blink`
  - `blinkLeft`
  - `blinkRight`
  - `aa`
  - `ih`
  - `ou`
  - `ee`
  - `oh`

Acceptance:
- the exported `.vrm` carries those expressions
- the avatar opens in a VRM-compatible viewer without broken hierarchy

### 5. Validate app behavior before replacing Alice

Do not replace bundled Alice first.

Safer path:
- upload the exported `.vrm` as a custom avatar
- test it against the current app runtime

Required runtime checks:
- blink works
- mouth movement works
- look-at works
- current body animation and talk-body clip behavior do not break the model

Only after that should a bundled-Alice replacement be considered.

## Practical Tool Guidance

Best tool options from this point:
- `Blender + VRM Add-on` for final expression mapping and export
- `Faceit` if purchased and installed, for stronger facial authoring support
- manual texture work for blink and mouth if the asset stays texture-driven

What not to rely on:
- pure morph-only blink on this exact mesh
- VRoid Studio as a general re-edit tool for arbitrary imported VRMs
- Mixamo as a face-rig solution

## App-Side Follow-Up After Asset Prep

Once a usable `.vrm` exists:

1. Upload it as a custom avatar in the app.
2. Validate current runtime behaviors:
   - mouth movement
   - blink
   - look-at
   - body rig compatibility
3. Compare it against bundled Alice.
4. Decide whether the replacement character removes enough pressure from the Alice facial-animation ticket program.

If the replacement model performs well enough, the larger Alice GPU facial-animation effort can be deprioritized or moved behind a later quality milestone.

## Suggested Decision Gate

Use this simple gate after the first usable VRM export:

Ship this replacement path only if all are true:
- blink is visibly believable
- mouth movement is readable during speech
- no major regression to current VRM runtime behavior
- the character quality is acceptable in the companion page

If any of those fail, stop and pick a better face-ready avatar base instead of sinking more time into this asset.
