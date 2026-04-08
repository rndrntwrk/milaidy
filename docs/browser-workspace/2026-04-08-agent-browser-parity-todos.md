# Browser Workspace Agent-Browser Parity TODOs

This checklist tracks the remaining browser-workspace parity work requested for Milady's single `MANAGE_MILADY_BROWSER_WORKSPACE` action. Every capability below must stay a subaction of the one main browser action.

## Input And Control Parity

- [ ] Add `clipboard` subactions for `read`, `write`, `copy`, and `paste`.
- [ ] Add `mouse` subactions for `move`, `down`, `up`, and `wheel`.
- [ ] Add `drag` subactions for source/target drag-and-drop flows.
- [ ] Add `upload` subactions for file-input workflows.
- [ ] Add richer keyboard/browser-input aliases to the raw command path so API calls and action calls behave identically.

## Browser Settings And Emulation

- [ ] Add `set` subactions for `viewport`.
- [ ] Add `set` subactions for `device`.
- [ ] Add `set` subactions for `geo`.
- [ ] Add `set` subactions for `offline`.
- [ ] Add `set` subactions for extra `headers`.
- [ ] Add `set` subactions for `credentials` / basic auth state.
- [ ] Add `set` subactions for `media` / color-scheme emulation.

## Session, Storage, And Network

- [ ] Add `cookies` subactions for list/get-all.
- [ ] Add `cookies` subactions for set.
- [ ] Add `cookies` subactions for clear.
- [ ] Add `storage` subactions for localStorage get/set/clear.
- [ ] Add `storage` subactions for sessionStorage get/set/clear.
- [ ] Add `network` subactions for request routing/interception.
- [ ] Add `network` subactions for request blocking/abort.
- [ ] Add `network` subactions for mocked response bodies/status/headers.
- [ ] Add `network` subactions for unroute.
- [ ] Add `network` subactions for tracked request listing/filtering.
- [ ] Add `network` subactions for single-request detail lookup.
- [ ] Add `network` subactions for HAR start/stop capture.

## Runtime Inspection And Debugging

- [ ] Add `dialog` subactions for `accept`.
- [ ] Add `dialog` subactions for `dismiss`.
- [ ] Add `dialog` subactions for `status`.
- [ ] Add `console` subactions for listing buffered console messages.
- [ ] Add `console` subactions for clearing buffered console messages.
- [ ] Add `errors` subactions for listing buffered page errors.
- [ ] Add `errors` subactions for clearing buffered page errors.
- [ ] Add `highlight` subactions for emphasizing a target element.
- [ ] Add `diff` subactions for snapshot-to-snapshot comparisons.
- [ ] Add `diff` subactions for screenshot comparisons.
- [ ] Add `diff` subactions for URL-vs-URL comparisons.
- [ ] Add `trace` subactions for start/stop recording.
- [ ] Add `profiler` subactions for start/stop profiling.

## State, Auth, Frames, Tabs, And Windows

- [ ] Add `state` subactions for save.
- [ ] Add `state` subactions for load.
- [ ] Ensure saved state includes auth-relevant cookies/storage/session settings.
- [ ] Add `frame` subactions for selecting an iframe context.
- [ ] Add `frame` subactions for returning to the main frame.
- [ ] Make DOM subactions honor the currently selected frame context.
- [ ] Add `tab` subactions for list.
- [ ] Add `tab` subactions for new.
- [ ] Add `tab` subactions for switch.
- [ ] Add `tab` subactions for close.
- [ ] Add `window` subactions for new-window creation.

## Capture And Export

- [ ] Add web/desktop-compatible `pdf` export support.
- [ ] Extend screenshot/diff capture paths so browser parity tests can validate them deterministically.

## Action Surface And Planner Compatibility

- [ ] Extend the main browser action schema/docs to expose every new subaction family.
- [ ] Extend structured parameter parsing so planner JSON for the new command families normalizes correctly.
- [ ] Keep natural-language/browser-planner inference working for the new subactions when safe.

## Validation

- [ ] Add unit coverage for every new command family in `browser-workspace.test.ts`.
- [ ] Add API E2E coverage for every new command family in `browser-workspace-api.e2e.test.ts`.
- [ ] Add plugin/action parsing coverage for the new subactions.
- [ ] Keep chat E2E green after the parity expansion.
- [ ] Keep live real-LLM browser validation green after the parity expansion.
- [ ] Re-run the focused browser test slice and fix regressions.
