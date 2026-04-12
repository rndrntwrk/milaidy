# Beyond-Sprint: Desktop Issues — #1819-#1821

**Priority:** Beyond current sprint
**Theme:** Desktop polish and platform coverage
**Status recommendation:** ALL VALID

---

## #1819 — Experience-mode picker full implementation + persistence

### Current State
- No experience-mode picker scaffold exists yet (W16 #1801 creates the scaffold)
- Modes proposed: dev, companion, co-work, streaming, trading
- Some `experienceMode` references in config-ui and cloud-dashboard-utils
- Current companion UI at `packages/app-core/src/components/companion/`

### Integration Work
- Full implementation of mode picker with persistence
- Route different UI layouts based on selected mode
- Settings persistence across restarts
- Migration path for existing users (default mode assignment)

### Estimated Effort
- 1-2 weeks
- Touches multiple shell views and routing logic

### Risks
- Large UX surface — each mode implies different feature sets
- Mode switching at runtime vs restart-only needs design decision
- Testing all 5 modes × multiple platforms is expensive

---

## #1820 — Auto-updater reliability on slow/flaky connections

### Current State
- Electrobun auto-updater exists (specifics in electrobun shell)
- Tester complaint from 2026-03-08: "GitHub download speed and reliability are becoming a recurring tester complaint"
- No CDN mirroring in place

### Integration Work
- Evaluate resume/retry/backoff behavior of Electrobun auto-updater
- Add progress transparency (download percentage, speed, ETA)
- Consider CDN mirroring (GitHub Releases → CloudFront/Cloudflare)
- Handle partial downloads / connection drops gracefully

### Estimated Effort
- 3-5 days for retry/progress work
- 1 week additional for CDN setup

### Risks
- Electrobun's auto-updater internals may be limited
- CDN adds infrastructure cost and maintenance
- Different reliability characteristics per platform (macOS vs Windows vs Linux)

---

## #1821 — Linux packaging polish (.deb + AppImage)

### Current State
- Linux was explicitly out of scope for W16 ("doesn't crash on launch" baseline only)
- Electrobun build targets include Linux
- No Linux-specific polish: first-run, tray, autostart, file association, package metadata

### Integration Work
- .deb package: desktop entry, icons, MIME types, package metadata
- AppImage: proper AppRun, icon embedding, desktop integration
- Tray icon support on Linux (systray varies by DE)
- Autostart via XDG autostart spec
- File association for `.milady` files (if applicable)
- Test on Ubuntu 22.04+, Fedora, Arch (common DE: GNOME, KDE)

### Estimated Effort
- 1 week for packaging basics
- Ongoing for DE-specific quirks

### Risks
- Linux desktop fragmentation (Wayland vs X11, GNOME vs KDE vs others)
- Systray support varies wildly across DEs
- Limited testing infrastructure for Linux DEs
