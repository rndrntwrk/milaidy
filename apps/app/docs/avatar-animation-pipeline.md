# Avatar Animation Pipeline

## Assets

- Alice model: `/vrms/alice.vrm`
- Alice motion library: `/animations/alice`
- Generic Mixamo-compatible library: `/animations/emotes` and related legacy clips

The Alice GLBs are raw armature exports. They are not pre-normalized VRM humanoid clips.

## Why Alice Clips Cannot Be Copied To Normalized VRM Bones

Alice motion GLBs animate raw rig nodes such as `Hips`, `Spine01`, `LeftArm`, and `RightForeArm`. The VRM runtime also exposes normalized humanoid bones through `vrm.humanoid.getNormalizedBoneNode(...)`.

Those are different pose spaces.

If a raw Alice quaternion track is copied directly onto normalized VRM bones, the clip is interpreted in the wrong rest-pose basis. The result is the folded or contorted pose that showed up on stage during the failed direct-binding experiment.

## Alice Vs Mixamo Retargeting

### Alice raw rig

- Source clips use Alice raw armature names.
- Target playback writes onto raw Alice nodes inside `vrm.scene`.
- Alice raw clips are sanitized, not retargeted.
- Matching raw bone quaternion tracks are copied directly onto the same raw bone names in `alice.vrm`.
- Translation and scale tracks are discarded.
- `Armature` tracks are ignored.
- This path is used for explicit Alice motion clips on stage.

### Mixamo humanoid path

- Source clips use Mixamo-style names such as `mixamorig:Hips`.
- Target playback writes onto normalized humanoid bones.
- The existing Mixamo retargeter remains the correct path for those clips.

## `autoUpdateHumanBones`

`vrm.update()` will overwrite raw scene bones when `vrm.humanoid.autoUpdateHumanBones` is enabled.

That means:

- `alice-raw` motion clips must run with `autoUpdateHumanBones = false`
- `mixamo-retargeted` clips must run with `autoUpdateHumanBones = true`
- procedural fallback must run with `autoUpdateHumanBones = true`
- when no Alice raw-rig clip is active, the safe default is `true`

## Stage Invariant

Stage movement is external to the clip data.

- idle clips must be in-place
- action clips should not rely on baked root motion to place the character on stage
- scene placement, mark transitions, and framing remain owned by the stage runtime rather than by animation translation tracks

## Stage Idle Strategy

- Pro Streamer stage neutral idle is procedural by design.
- The shipped Alice idle GLBs are not treated as neutral-safe automatic idle rotation in this pass.
- Alice GLB files remain available for explicit actions such as dance, gesture, and movement triggers.
