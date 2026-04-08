# Browser Workspace Agent-Browser Parity TODOs

This checklist tracks the browser-workspace parity work requested for Milady's single `MANAGE_MILADY_BROWSER_WORKSPACE` action. The requested parity buckets are now implemented under one main browser action plus browser subactions.

## Input And Control Parity

- [x] Add `clipboard` subactions for `read`, `write`, `copy`, and `paste`.
- [x] Add `mouse` subactions for `move`, `down`, `up`, and `wheel`.
- [x] Add `drag` subactions for source/target drag-and-drop flows.
- [x] Add `upload` subactions for file-input workflows.
- [x] Add richer keyboard/browser-input aliases to the raw command path so API calls and action calls behave identically.

## Browser Settings And Emulation

- [x] Add `set` subactions for `viewport`.
- [x] Add `set` subactions for `device`.
- [x] Add `set` subactions for `geo`.
- [x] Add `set` subactions for `offline`.
- [x] Add `set` subactions for extra `headers`.
- [x] Add `set` subactions for `credentials` / basic auth state.
- [x] Add `set` subactions for `media` / color-scheme emulation.

## Session, Storage, And Network

- [x] Add `cookies` subactions for list/get-all.
- [x] Add `cookies` subactions for set.
- [x] Add `cookies` subactions for clear.
- [x] Add `storage` subactions for localStorage get/set/clear.
- [x] Add `storage` subactions for sessionStorage get/set/clear.
- [x] Add `network` subactions for request routing/interception.
- [x] Add `network` subactions for request blocking/abort.
- [x] Add `network` subactions for mocked response bodies/status/headers.
- [x] Add `network` subactions for unroute.
- [x] Add `network` subactions for tracked request listing/filtering.
- [x] Add `network` subactions for single-request detail lookup.
- [x] Add `network` subactions for HAR start/stop capture.

## Runtime Inspection And Debugging

- [x] Add `dialog` subactions for `accept`.
- [x] Add `dialog` subactions for `dismiss`.
- [x] Add `dialog` subactions for `status`.
- [x] Add `console` subactions for listing buffered console messages.
- [x] Add `console` subactions for clearing buffered console messages.
- [x] Add `errors` subactions for listing buffered page errors.
- [x] Add `errors` subactions for clearing buffered page errors.
- [x] Add `highlight` subactions for emphasizing a target element.
- [x] Add `diff` subactions for snapshot-to-snapshot comparisons.
- [x] Add `diff` subactions for screenshot comparisons.
- [x] Add `diff` subactions for URL-vs-URL comparisons.
- [x] Add `trace` subactions for start/stop recording.
- [x] Add `profiler` subactions for start/stop profiling.

## State, Auth, Frames, Tabs, And Windows

- [x] Add `state` subactions for save.
- [x] Add `state` subactions for load.
- [x] Ensure saved state includes auth-relevant cookies/storage/session settings.
- [x] Add `frame` subactions for selecting an iframe context.
- [x] Add `frame` subactions for returning to the main frame.
- [x] Make DOM subactions honor the currently selected frame context.
- [x] Add `tab` subactions for list.
- [x] Add `tab` subactions for new.
- [x] Add `tab` subactions for switch.
- [x] Add `tab` subactions for close.
- [x] Add `window` subactions for new-window creation.

## Capture And Export

- [x] Add web/desktop-compatible `pdf` export support.
- [x] Extend screenshot/diff capture paths so browser parity tests can validate them deterministically.

## Action Surface And Planner Compatibility

- [x] Extend the main browser action schema/docs to expose every new subaction family.
- [x] Extend structured parameter parsing so planner JSON for the new command families normalizes correctly.
- [x] Keep natural-language/browser-planner inference working for the new subactions when safe.

## Validation

- [x] Add unit coverage for every new command family in `browser-workspace.test.ts`.
- [x] Add API E2E coverage for every new command family in `browser-workspace-api.e2e.test.ts`.
- [x] Add plugin/action parsing coverage for the new subactions.
- [x] Keep chat E2E green after the parity expansion.
- [x] Keep live real-LLM browser validation green after the parity expansion.
- [x] Re-run the focused browser test slice and fix regressions.

