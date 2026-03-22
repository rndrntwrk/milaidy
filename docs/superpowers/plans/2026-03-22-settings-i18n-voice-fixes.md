# Settings, i18n & Voice Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve settings page UX (connectors-style sidebar, section consolidation, RPC simplification), complete i18n coverage across all 6 languages, and fix garbled voice streaming.

**Architecture:** Three sequential passes — each independently reviewable and mergeable. Pass 1 restructures settings UI components. Pass 2 adds missing i18n keys and replaces hardcoded strings. Pass 3 fixes voice streaming edge cases and lifecycle issues.

**Tech Stack:** React 18, TypeScript ESM, Tailwind CSS, Vitest, custom i18n system, ElevenLabs/Edge TTS

**Spec:** `docs/superpowers/specs/2026-03-22-settings-i18n-voice-fixes-design.md`

---

## File Map

### Pass 1: Settings Page UX
| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/app-core/src/components/SettingsView.tsx` | Sidebar restyle, section consolidation, section order |
| Modify | `packages/app-core/src/components/ConfigPageView.tsx` | RPC simplification when cloud enabled |
| Modify | `packages/app-core/src/components/MediaSettingsSection.tsx` | Merge into combined Media & Voice section |
| Modify | `packages/app-core/src/components/VoiceConfigView.tsx` | Merge into combined Media & Voice section |
| Modify | `packages/app-core/src/i18n/locales/en.json` | New i18n keys for merged/moved sections |

### Pass 2: i18n Completeness
| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/app-core/src/i18n/locales/zh-CN.json` | Add 83 missing keys |
| Modify | `packages/app-core/src/i18n/locales/ko.json` | Add 84 missing keys |
| Modify | `packages/app-core/src/i18n/locales/es.json` | Add 84 missing keys |
| Modify | `packages/app-core/src/i18n/locales/pt.json` | Add 84 missing keys |
| Modify | `packages/app-core/src/i18n/locales/vi.json` | Add 9 missing keys |
| Modify | `packages/app-core/src/components/SettingsView.tsx` | Replace hardcoded Desktop strings |
| Modify | Various components (ChatMessage, ChatComposer, Header, etc.) | Replace hardcoded aria-labels/titles |
| Modify | `packages/app-core/test/app/i18n.test.ts` | Add key-sync regression tests |

### Pass 3: Voice Quality
| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/app-core/src/utils/streaming-text.ts` | Fix mergeStreamingText overlap detection |
| Modify | `packages/app-core/src/hooks/useVoiceChat.ts` | Fix splitFirstSentence edge cases, cleanup on conv switch |
| Modify | `packages/app-core/src/api/streaming-text.test.ts` | Add edge case tests for streaming merge |
| Modify | `packages/app-core/test/avatar/voice-chat-streaming-text.test.ts` | Add splitFirstSentence edge case tests |

---

## Pass 1: Settings Page UX

### Task 1: Restyle Settings Sidebar to Connectors-Style Cards

**Files:**
- Modify: `packages/app-core/src/components/SettingsView.tsx:184-214` (sidebar nav rendering)
- Modify: `packages/app-core/src/components/SettingsView.tsx:150` (sidebar container)

- [ ] **Step 1: Widen sidebar container**

In `SettingsView.tsx`, find the `<aside>` element at line ~150:

```tsx
// BEFORE (line 150):
<aside className="hidden w-52 shrink-0 self-stretch border-r border-border bg-bg-accent xl:sticky xl:top-0 xl:flex xl:h-screen">

// AFTER:
<aside className="hidden w-[16rem] shrink-0 self-stretch border-r border-border/50 bg-bg/35 backdrop-blur-xl xl:sticky xl:top-0 xl:flex xl:h-screen">
```

Changes: `w-52` → `w-[16rem]`, `border-border` → `border-border/50`, `bg-bg-accent` → `bg-bg/35 backdrop-blur-xl` (matches connectors sidebar styling from `PluginsView.tsx`).

- [ ] **Step 2: Replace sidebar nav buttons with connectors-style cards**

Replace the nav button rendering at lines ~184-214. Current code uses flat `<button>` elements with `font-mono text-[11px]` and a left accent bar.

```tsx
// BEFORE (lines 184-214):
<nav className="flex-1 py-3 px-2">
  <div className="space-y-0.5">
    {sections.map((section) => {
      const Icon = section.icon;
      const isActive = activeSection === section.id;
      return (
        <button
          key={section.id}
          type="button"
          onClick={() => onSectionChange(section.id)}
          aria-current={isActive ? "page" : undefined}
          className={`group w-full flex items-center gap-2.5 text-left px-3 py-2 relative
            font-mono text-[11px] tracking-wide transition-all duration-150
            ${
              isActive
                ? "text-txt bg-surface"
                : "text-muted hover:text-txt hover:bg-surface/50"
            }`}
        >
          {isActive && (
            <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent" />
          )}
          <Icon
            className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-accent" : ""}`}
          />
          <span className="truncate">{t(section.label)}</span>
        </button>
      );
    })}
  </div>
</nav>

// AFTER:
<nav className="flex-1 py-4 px-3">
  <div className="space-y-1.5">
    {sections.map((section) => {
      const Icon = section.icon;
      const isActive = activeSection === section.id;
      return (
        <button
          key={section.id}
          type="button"
          onClick={() => onSectionChange(section.id)}
          aria-current={isActive ? "page" : undefined}
          className={`group w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-2xl border transition-all duration-150
            ${
              isActive
                ? "border-accent/40 bg-accent/10 text-txt shadow-[0_10px_30px_rgba(var(--accent),0.08)]"
                : "border-transparent bg-transparent text-muted hover:border-border/60 hover:bg-card/55 hover:text-txt"
            }`}
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border p-1.5 transition-colors
              ${
                isActive
                  ? "border-accent/30 bg-accent/18"
                  : "border-border/50 bg-bg-accent/80"
              }`}
          >
            <Icon
              className={`w-4 h-4 ${isActive ? "text-accent" : ""}`}
            />
          </span>
          <span className="truncate text-sm font-semibold">{t(section.label)}</span>
        </button>
      );
    })}
  </div>
</nav>
```

Key changes:
- `font-mono text-[11px]` → `text-sm font-semibold`
- Flat button → `rounded-2xl border` card
- `w-3.5 h-3.5` icon → `w-4 h-4` inside 32px container (`h-8 w-8 rounded-xl border`)
- Left accent bar removed → card border/background for active state
- `space-y-0.5` → `space-y-1.5` for card spacing

- [ ] **Step 3: Verify visually in the app**

Run: `cd apps/app && bun run dev`

Check both light and dark mode. Verify:
- Active section shows accent border/bg tint
- Inactive sections show hover effect
- Icons are centered in their containers
- Text is readable and truncates on long labels

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/src/components/SettingsView.tsx
git commit -m "feat(settings): restyle sidebar to connectors-style cards"
```

---

### Task 2: Consolidate Media + Voice into Single Section

**Files:**
- Modify: `packages/app-core/src/components/SettingsView.tsx:52-113` (SETTINGS_SECTIONS array)
- Modify: `packages/app-core/src/components/SettingsView.tsx:707-727` (content rendering)
- Modify: `packages/app-core/src/i18n/locales/en.json` (new key for merged section)

- [ ] **Step 1: Add i18n key for merged section**

In `en.json`, add under the `settings.sections` namespace:

```json
"settings.sections.mediavoice.label": "Media & Voice",
"settings.sections.mediavoice.desc": "Image, video, audio generation and voice configuration"
```

- [ ] **Step 2: Update SETTINGS_SECTIONS array**

In `SettingsView.tsx`, replace the separate `media` and `voice` entries (lines ~88-99) with a single entry:

```tsx
// BEFORE:
{
  id: "media",
  label: "settings.sections.media.label",
  icon: Image,
  description: "settings.sections.media.desc",
},
{
  id: "voice",
  label: "settings.sections.voice.label",
  icon: Mic,
  description: "settings.sections.voice.desc",
},

// AFTER:
{
  id: "media-voice",
  label: "settings.sections.mediavoice.label",
  icon: Image,
  description: "settings.sections.mediavoice.desc",
},
```

Also add the `Mic` import removal cleanup — but keep `Mic` imported since `VoiceConfigView` may still use it.

- [ ] **Step 3: Update content rendering for merged section**

Replace the separate media and voice content blocks (lines ~707-727) with a combined one:

```tsx
// BEFORE:
{visibleSectionIds.has("media") && (
  <SectionCard id="media" title={t("settings.sections.media.label")} description={t("settings.sections.media.desc")}>
    <MediaSettingsSection />
  </SectionCard>
)}
{visibleSectionIds.has("voice") && (
  <SectionCard id="voice" title={t("settings.sections.voice.label")} description={t("settings.sections.voice.desc")}>
    <VoiceConfigView />
  </SectionCard>
)}

// AFTER:
{visibleSectionIds.has("media-voice") && (
  <SectionCard id="media-voice" title={t("settings.sections.mediavoice.label")} description={t("settings.sections.mediavoice.desc")}>
    <MediaSettingsSection />
    <div className="mt-6 pt-6 border-t border-border/40">
      <h3 className="text-sm font-semibold text-txt mb-4">{t("settings.sections.voice.label")}</h3>
      <VoiceConfigView />
    </div>
  </SectionCard>
)}
```

- [ ] **Step 4: Verify the merged section renders correctly**

Run: `cd apps/app && bun run dev`

Navigate to Settings → Media & Voice. Verify:
- Media providers appear at the top
- Voice config appears below with a separator
- Both subsections function independently (cloud toggle, provider selection, etc.)

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/components/SettingsView.tsx packages/app-core/src/i18n/locales/en.json
git commit -m "feat(settings): consolidate media and voice into single section"
```

---

### Task 3: Move Desktop Workspace Under Advanced

**Files:**
- Modify: `packages/app-core/src/components/SettingsView.tsx:52-113` (remove desktop from sections)
- Modify: `packages/app-core/src/components/SettingsView.tsx:751-760` (advanced section content)

- [ ] **Step 1: Remove desktop from SETTINGS_SECTIONS**

In `SettingsView.tsx`, delete the desktop entry from the array (lines ~79-83):

```tsx
// DELETE this entire entry:
{
  id: "desktop",
  label: "Desktop Workspace",
  icon: Monitor,
  description: "Native window, clipboard, dialog, and detached surface tools",
},
```

- [ ] **Step 2: Remove standalone desktop content block**

Delete the desktop section rendering (lines ~696-705):

```tsx
// DELETE:
{visibleSectionIds.has("desktop") && (
  <SectionCard id="desktop" title="Desktop Workspace" ...>
    <DesktopWorkspaceSection />
  </SectionCard>
)}
```

- [ ] **Step 3: Add Desktop Workspace as subsection inside Advanced**

In the Advanced section content block (lines ~751-760), add `DesktopWorkspaceSection` at the top, conditionally rendered for Electrobun:

```tsx
{visibleSectionIds.has("advanced") && (
  <SectionCard id="advanced" title={t("nav.advanced")} description={t("settings.sections.advanced.desc")}>
    {/* Desktop workspace — only on Electrobun runtime */}
    {isElectrobun && (
      <div className="mb-6 pb-6 border-b border-border/40">
        <h3 className="text-sm font-semibold text-txt mb-4">{t("settings.sections.desktop.label")}</h3>
        <DesktopWorkspaceSection />
      </div>
    )}
    <AdvancedSection />
  </SectionCard>
)}
```

Check how `isElectrobun` is determined in the existing code (likely via `useApp()` or a runtime check). Use the same pattern already used to conditionally show the desktop section.

- [ ] **Step 4: Add i18n key for desktop label**

In `en.json`, add:

```json
"settings.sections.desktop.label": "Desktop Workspace",
"settings.sections.desktop.desc": "Native window, clipboard, dialog, and detached surface tools"
```

- [ ] **Step 5: Verify Desktop appears under Advanced on desktop, hidden on web**

Run the app. If on Electrobun desktop runtime, verify Desktop Workspace appears at the top of the Advanced section. On web/mobile, verify it does not appear.

- [ ] **Step 6: Commit**

```bash
git add packages/app-core/src/components/SettingsView.tsx packages/app-core/src/i18n/locales/en.json
git commit -m "feat(settings): move desktop workspace under advanced tab"
```

---

### Task 4: Simplify RPC Section When Cloud Enabled

**Files:**
- Modify: `packages/app-core/src/components/ConfigPageView.tsx:691-782` (RPC rendering)

- [ ] **Step 1: Find cloud detection logic**

Read `ConfigPageView.tsx`. The component gets `elizaCloudConnected` from `useApp()` (line ~487). The RPC provider sections render at lines ~691-782, likely behind a `!elizaCloudConnected` guard already.

Verify the existing conditional structure — the report indicated:
- Lines 653-688: Cloud connected → shows status bar
- Lines 691-782: Custom RPC providers → shows only when `!elizaCloudConnected`

If RPC providers already hide when cloud is connected, add a simple "Using Eliza Cloud" indicator when cloud IS connected.

- [ ] **Step 2: Add cloud-active RPC placeholder**

Where the RPC sections are rendered, add a cloud-mode indicator:

```tsx
{elizaCloudConnected ? (
  <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-surface/50 px-4 py-3">
    <Cloud className="w-4 h-4 text-muted" />
    <span className="text-sm text-muted">{t("configpageview.UsingElizaCloudRpcs")}</span>
  </div>
) : (
  /* existing RPC provider sections */
)}
```

- [ ] **Step 3: Add i18n key**

In `en.json`:

```json
"configpageview.UsingElizaCloudRpcs": "Using Eliza Cloud RPCs"
```

- [ ] **Step 4: Verify both modes**

Run the app with Eliza Cloud connected → should show grey "Using Eliza Cloud RPCs" line.
Disconnect → should show full RPC provider dropdowns.

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/components/ConfigPageView.tsx packages/app-core/src/i18n/locales/en.json
git commit -m "feat(settings): simplify RPC section when eliza cloud enabled"
```

---

### Task 5: Field Condensing & Light/Dark Color Audit

**Files:**
- Modify: `packages/app-core/src/components/SettingsView.tsx` (any hardcoded colors)
- Modify: `packages/app-core/src/components/ConfigPageView.tsx` (any hardcoded colors)
- Modify: `packages/app-core/src/components/MediaSettingsSection.tsx` (any hardcoded colors)
- Modify: `packages/app-core/src/components/VoiceConfigView.tsx` (any hardcoded colors)

- [ ] **Step 1: Grep for hardcoded color values in settings components**

Run:
```bash
cd /Users/pleasures/Documents/GitHub/milady
grep -n 'rgba\|rgb(\|hsl(\|#[0-9a-fA-F]\{3,8\}' \
  packages/app-core/src/components/SettingsView.tsx \
  packages/app-core/src/components/ConfigPageView.tsx \
  packages/app-core/src/components/MediaSettingsSection.tsx \
  packages/app-core/src/components/VoiceConfigView.tsx \
  packages/app-core/src/components/DesktopWorkspaceSection.tsx
```

- [ ] **Step 2: Replace hardcoded colors with theme CSS variables**

For each match, replace with the appropriate Tailwind theme class:
- Hardcoded white/light → `text-txt` or `bg-surface`
- Hardcoded grey/muted → `text-muted` or `border-border`
- Hardcoded dark backgrounds → `bg-card` or `bg-bg`
- Inline `var(--muted)` → Tailwind `text-muted` class
- Inline `var(--text)` → Tailwind `text-txt` class
- Inline `var(--border)` → Tailwind `border-border` class
- Inline `var(--accent)` → Tailwind `text-accent` or `border-accent` class

Note: `VoiceConfigView.tsx` uses `var(--muted)`, `var(--text)`, `var(--border)`, `var(--accent)`, `var(--bg-accent)`, `var(--bg-hover)`, `var(--border-strong)` as inline style references in className strings. These should be converted to Tailwind equivalents where possible.

- [ ] **Step 3: Look for fields that can be condensed onto same row**

Scan each settings section for pairs of short inputs (toggles, small text fields, dropdowns) that sit on separate rows but could share one. Use `grid grid-cols-2 gap-3` for field pairs.

Focus on:
- `VoiceConfigView`: stability + similarity boost sliders could share a row
- `ConfigPageView`: chain-specific RPC sections may have toggle + dropdown pairs
- `MediaSettingsSection`: mode toggle + provider selector could potentially share a row

Only condense where both fields are short enough. Don't force it.

- [ ] **Step 4: Verify light and dark mode**

Run: `cd apps/app && bun run dev`

Toggle between light and dark mode. Check every settings section for:
- Text contrast (readable in both modes)
- Border visibility (not invisible in either mode)
- Background layering (cards distinct from background)
- Input fields (visible placeholder text, readable values)

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/components/
git commit -m "fix(settings): replace hardcoded colors with theme variables, condense fields"
```

---

## Pass 2: i18n Completeness

### Task 6: Add Missing Translation Keys to All Locales

**Files:**
- Modify: `packages/app-core/src/i18n/locales/zh-CN.json` (83 missing keys)
- Modify: `packages/app-core/src/i18n/locales/ko.json` (84 missing keys)
- Modify: `packages/app-core/src/i18n/locales/es.json` (84 missing keys)
- Modify: `packages/app-core/src/i18n/locales/pt.json` (84 missing keys)
- Modify: `packages/app-core/src/i18n/locales/vi.json` (9 missing keys)
- Modify: `packages/app-core/src/i18n/locales/en.json` (new keys from Pass 1)

- [ ] **Step 1: Script the key diff to confirm exact missing keys**

Run a quick Node script to diff keys:

```bash
cd /Users/pleasures/Documents/GitHub/milady
node -e "
const en = Object.keys(require('./packages/app-core/src/i18n/locales/en.json'));
for (const lang of ['zh-CN','ko','es','pt','vi']) {
  const loc = Object.keys(require('./packages/app-core/src/i18n/locales/' + lang + '.json'));
  const missing = en.filter(k => !loc.includes(k));
  console.log(lang + ': ' + missing.length + ' missing');
  if (missing.length) console.log('  ' + missing.join(', '));
}
"
```

This confirms the exact set of missing keys before adding translations.

- [ ] **Step 2: Add missing keys to zh-CN.json**

Add proper Simplified Chinese translations for all 83 missing keys. Group by namespace:

- `appsview.*` (12 keys) — Apps view UI
- `charactereditor.*` (25 keys) — Character editor
- `configpageview.*` (10 keys) — Config/RPC page
- `onboarding.*` (8 keys) — Onboarding step names
- `skillsview.*` (12 keys) — Skills/talents view
- `trajectorydetailview.*` (7 keys) — Trajectory detail
- `vectorbrowserview.*` (9 keys) — Vector browser

Use natural, idiomatic Simplified Chinese. Match the tone and terminology of existing zh-CN translations.

- [ ] **Step 3: Add missing keys to ko.json**

Add proper Korean translations for all 84 missing keys (same 83 as zh-CN + `heartbeatsview.selectAHeartbeat`).

- [ ] **Step 4: Add missing keys to es.json**

Add proper Spanish translations for all 84 missing keys.

- [ ] **Step 5: Add missing keys to pt.json**

Add proper Brazilian Portuguese translations for all 84 missing keys.

- [ ] **Step 6: Add missing keys to vi.json**

Add proper Vietnamese translations for the 9 missing `onboarding.*` keys.

- [ ] **Step 7: Add new keys from Pass 1 to all locales**

Add translations for keys added during Pass 1 to all 5 non-English locales:
- `settings.sections.mediavoice.label`
- `settings.sections.mediavoice.desc`
- `settings.sections.desktop.label`
- `settings.sections.desktop.desc`
- `configpageview.UsingElizaCloudRpcs`

- [ ] **Step 8: Run the key diff again to verify zero missing**

Re-run the diff script from Step 1. Expected output: 0 missing keys for all languages.

- [ ] **Step 9: Commit**

```bash
git add packages/app-core/src/i18n/locales/
git commit -m "feat(i18n): add all missing translation keys across 6 languages"
```

---

### Task 7: Replace Hardcoded English Strings in Components

**Files:**
- Modify: `packages/app-core/src/components/SettingsView.tsx:79-81` (Desktop hardcoded strings)
- Modify: `packages/app-core/src/components/ChatMessage.tsx` (aria-labels, button text)
- Modify: `packages/app-core/src/components/ChatComposer.tsx` (aria-labels)
- Modify: `packages/app-core/src/components/Header.tsx` (aria-labels)
- Modify: `packages/app-core/src/components/CharacterEditor.tsx` (button title)
- Modify: `packages/app-core/src/components/ConfirmModal.tsx` (default title)
- Modify: `packages/app-core/src/components/ElizaCloudDashboard.tsx` (section title)
- Modify: `packages/app-core/src/components/BrowserSurfaceWindow.tsx` (placeholder)
- Modify: `packages/app-core/src/components/SkillsView.tsx` (placeholders)
- Modify: Various other components (ThemeToggle, ShortcutsOverlay, GameViewOverlay, etc.)
- Modify: `packages/app-core/src/i18n/locales/en.json` (new keys for all hardcoded strings)

- [ ] **Step 1: Add new i18n keys to en.json**

Add keys for all hardcoded strings found in the audit. Group under appropriate namespaces:

```json
"aria.editMessage": "Edit message",
"aria.playMessage": "Play message",
"aria.deleteMessage": "Delete message",
"aria.attachImage": "Attach image",
"aria.agentVoiceOn": "Agent voice on",
"aria.agentVoiceOff": "Agent voice off",
"aria.openNavMenu": "Open navigation menu",
"aria.navMenu": "Navigation menu",
"aria.closeNavMenu": "Close navigation menu",
"aria.toggleTheme": "Toggle theme",
"aria.keyboardShortcuts": "Keyboard shortcuts",
"aria.close": "Close",
"aria.upload": "Upload",
"aria.dragOverlay": "Drag overlay",
"aria.reconnecting": "Reconnecting",
"aria.closePanel": "Close panel",
"aria.knowledgeUpload": "Knowledge upload controls",
"aria.searchLogs": "Search logs",
"aria.closeDialog": "Close dialog",
"aria.chatWorkspace": "Chat workspace",
"aria.browserAddress": "Browser address",
"common.cancel": "Cancel",
"common.remove": "Remove",
"common.confirm": "Confirm",
"common.enterValue": "Enter Value",
"browsersurface.enterUrlOrSearch": "Enter a URL or search",
"skillsview.searchByKeyword": "Search skills by keyword...",
"skillsview.filterSkills": "Filter skills...",
"elizaclouddashboard.agentDetails": "Agent Details"
```

- [ ] **Step 2: Replace hardcoded strings in components**

For each component, replace the hardcoded string with `t("key")`. Each component already has access to `t` via `useApp()` or props.

Example pattern:
```tsx
// BEFORE:
aria-label="Edit message"

// AFTER:
aria-label={t("aria.editMessage")}
```

Work through all components listed in the Files section above. For `ConfirmModal.tsx`, the default prop value becomes:
```tsx
// BEFORE:
title = "Confirm"

// AFTER:
title = t("common.confirm")
```

Note: `ConfirmModal` may not have access to `t` — check if it uses `useApp()`. If not, either add it or accept the default as English-only (modal titles are often not translated in practice).

- [ ] **Step 3: Replace hardcoded Desktop strings in SETTINGS_SECTIONS**

This was already addressed in Task 3 Step 4, but verify the entries now use:
```tsx
{
  id: "desktop",
  label: "settings.sections.desktop.label",
  description: "settings.sections.desktop.desc",
  ...
}
```

(If desktop was removed from SETTINGS_SECTIONS in Task 3, this step is N/A — just ensure the Advanced section subsection heading uses `t("settings.sections.desktop.label")`.)

- [ ] **Step 4: Add new keys to all non-English locales**

Add translations for all new keys (aria.*, common.cancel, common.remove, etc.) to zh-CN, ko, es, pt, vi locale files.

- [ ] **Step 5: Run i18n test suite**

Run: `cd /Users/pleasures/Documents/GitHub/milady && bunx vitest run packages/app-core/test/app/i18n.test.ts`

Expected: All tests pass. The key-sync test should catch any missing translations.

- [ ] **Step 6: Commit**

```bash
git add packages/app-core/src/components/ packages/app-core/src/i18n/locales/
git commit -m "feat(i18n): replace hardcoded strings with translation keys"
```

---

### Task 8: Add i18n Key-Sync Regression Test

**Files:**
- Modify: `packages/app-core/test/app/i18n.test.ts`

- [ ] **Step 1: Read existing i18n test**

Read `packages/app-core/test/app/i18n.test.ts` (159 lines). It already validates message key sync across locales. Understand the current test structure.

- [ ] **Step 2: Add strict key-count assertion**

Add a test that asserts every locale has the exact same number of keys as `en.json`:

```typescript
it("all locales have the same number of keys as en.json", () => {
  const enKeys = Object.keys(en);
  for (const [lang, messages] of Object.entries(allLocales)) {
    const localeKeys = Object.keys(messages);
    const missing = enKeys.filter((k) => !localeKeys.includes(k));
    expect(missing, `${lang} is missing keys: ${missing.join(", ")}`).toHaveLength(0);
  }
});
```

Where `allLocales` is an object mapping language codes to their imported locale data. Check how the existing test imports locales and follow the same pattern.

- [ ] **Step 3: Run the test**

Run: `bunx vitest run packages/app-core/test/app/i18n.test.ts`

Expected: PASS — all locales should now have complete keys after Task 6-7.

- [ ] **Step 4: Commit**

```bash
git add packages/app-core/test/app/i18n.test.ts
git commit -m "test(i18n): add strict key-sync regression test"
```

---

## Pass 3: Voice Quality Fixes

### Task 9: Fix Streaming Text Merge Edge Cases

**Files:**
- Modify: `packages/app-core/src/utils/streaming-text.ts:56-108`
- Modify: `packages/app-core/src/api/streaming-text.test.ts`

- [ ] **Step 1: Write failing tests for known edge cases**

Add tests to `streaming-text.test.ts` for:

```typescript
describe("mergeStreamingText edge cases", () => {
  it("handles case-different resend (snapshot)", () => {
    // Provider resends same content with different casing
    const result = mergeStreamingText("Hello world", "Hello World");
    expect(result).toBe("Hello World"); // Accept corrected version
  });

  it("handles punctuation-different resend", () => {
    // Provider resends with added punctuation
    const result = mergeStreamingText("Hello world", "Hello world.");
    expect(result).toBe("Hello world.");
  });

  it("does not create false overlap with short common prefix", () => {
    // Two unrelated messages sharing only "I "
    const result = mergeStreamingText("I went to the store", "I like cats");
    // Should detect snapshot replacement, not append
    expect(result).toBe("I like cats");
  });

  it("handles trailing whitespace differences", () => {
    const result = mergeStreamingText("Hello ", "Hello world");
    expect(result).toBe("Hello world");
  });

  it("handles unicode normalization differences", () => {
    // é as single codepoint vs e + combining accent
    const nfc = "caf\u00e9";
    const nfd = "cafe\u0301";
    const result = mergeStreamingText(nfc, nfd);
    // Should treat as same content, accept incoming
    expect(result).toBe(nfd);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run packages/app-core/src/api/streaming-text.test.ts`

Expected: Some tests may fail depending on current logic.

- [ ] **Step 3: Fix mergeStreamingText**

In `streaming-text.ts`, update `mergeStreamingText()` (lines 56-108):

1. **Add Unicode normalization** before comparison (at the top of the function):
   ```typescript
   const normalizedExisting = existing.normalize("NFC");
   const normalizedIncoming = incoming.normalize("NFC");
   ```
   Use normalized versions for all comparisons, but return the original `incoming` when choosing it.

2. **Improve `isLikelySnapshotReplacement`** (lines 37-54):
   - The current threshold of `sharedPrefix >= 8` is too aggressive for short strings
   - Add: if both strings are < 20 chars AND share prefix >= 3 chars, treat as snapshot
   - This prevents "I went to the store" + "I like cats" from appending

3. **Handle trailing whitespace** in the overlap loop (lines 76-99):
   - Before the overlap search, trim trailing whitespace from `existing` for comparison
   - This prevents `"Hello " + "Hello world"` from failing to detect the overlap

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run packages/app-core/src/api/streaming-text.test.ts`

Expected: All tests PASS including new edge case tests.

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/utils/streaming-text.ts packages/app-core/src/api/streaming-text.test.ts
git commit -m "fix(voice): fix streaming text merge edge cases causing garbled output"
```

---

### Task 10: Fix Sentence Splitting Edge Cases

**Files:**
- Modify: `packages/app-core/src/hooks/useVoiceChat.ts:228-261` (splitFirstSentence)
- Modify: `packages/app-core/test/avatar/voice-chat-streaming-text.test.ts`

- [ ] **Step 1: Write failing tests for sentence splitting edge cases**

Add tests to `voice-chat-streaming-text.test.ts`:

```typescript
describe("splitFirstSentence edge cases", () => {
  it("does not split on abbreviation periods", () => {
    const result = splitFirstSentence("Dr. Smith went to the store. He bought milk.");
    expect(result.firstSentence).toBe("Dr. Smith went to the store.");
    expect(result.remainder).toBe("He bought milk.");
    expect(result.complete).toBe(true);
  });

  it("does not split on decimal numbers", () => {
    const result = splitFirstSentence("The price is 3.14 dollars. That is cheap.");
    expect(result.firstSentence).toBe("The price is 3.14 dollars.");
    expect(result.remainder).toBe("That is cheap.");
    expect(result.complete).toBe(true);
  });

  it("handles ellipsis correctly", () => {
    const result = splitFirstSentence("Well... I think so. Maybe not.");
    expect(result.firstSentence).toBe("Well... I think so.");
    expect(result.remainder).toBe("Maybe not.");
    expect(result.complete).toBe(true);
  });

  it("does not split on URLs", () => {
    const result = splitFirstSentence("Visit https://example.com for details. It is free.");
    expect(result.firstSentence).toBe("Visit https://example.com for details.");
    expect(result.remainder).toBe("It is free.");
    expect(result.complete).toBe(true);
  });

  it("handles text with no punctuation under 180 chars", () => {
    const result = splitFirstSentence("Hello world this has no ending");
    expect(result.complete).toBe(false);
    expect(result.firstSentence).toBe("Hello world this has no ending");
    expect(result.remainder).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to confirm failures**

Run: `bunx vitest run packages/app-core/test/avatar/voice-chat-streaming-text.test.ts`

- [ ] **Step 3: Fix splitFirstSentence**

In `useVoiceChat.ts`, update `splitFirstSentence` (lines 228-261):

1. **Pre-process: strip URLs** before sentence detection:
   ```typescript
   // Temporarily replace URLs to prevent splitting on periods in URLs
   const urlPlaceholders: string[] = [];
   const withoutUrls = value.replace(/https?:\/\/\S+/g, (match) => {
     urlPlaceholders.push(match);
     return `__URL${urlPlaceholders.length - 1}__`;
   });
   ```

2. **Improve regex** to avoid splitting on abbreviations and decimals:
   ```typescript
   // Match sentence-ending punctuation NOT preceded by common abbreviations
   // and NOT followed by a digit (decimal numbers)
   const sentenceEnd = /(?<![A-Z]|Dr|Mr|Mrs|Ms|Jr|Sr|St|vs|etc|approx|\d)([.!?]+(?:["')\]]+)?)(?:\s|$)/g;
   ```

   Note: The negative lookbehind approach may be complex. An alternative is to use a simpler heuristic: only split on `.` if it's followed by a space and then a capital letter or end of string.

3. **Restore URLs** after splitting:
   ```typescript
   // Restore URL placeholders
   firstSentence = firstSentence.replace(/__URL(\d+)__/g, (_, i) => urlPlaceholders[Number(i)]);
   remainder = remainder.replace(/__URL(\d+)__/g, (_, i) => urlPlaceholders[Number(i)]);
   ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run packages/app-core/test/avatar/voice-chat-streaming-text.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/hooks/useVoiceChat.ts packages/app-core/test/avatar/voice-chat-streaming-text.test.ts
git commit -m "fix(voice): handle abbreviations, decimals, and URLs in sentence splitting"
```

---

### Task 11: Fix Voice Lifecycle on Conversation Switch

**Files:**
- Modify: `packages/app-core/src/hooks/useVoiceChat.ts` (cleanup)
- Modify: `packages/app-core/src/components/ChatView.tsx` (conversation switch handling)

- [ ] **Step 1: Read current conversation-switch handling in ChatView.tsx**

Read `ChatView.tsx` around lines 215-354 (the `useChatVoiceController` hook) and find where conversation ID changes are handled. Look for:
- A `useEffect` that depends on `conversationId`
- Any call to `stopSpeaking()` when conversation changes
- The `assistantSpeechRef` reset logic

- [ ] **Step 2: Ensure stopSpeaking is called on conversation switch**

If there isn't already a `useEffect` that calls `stopSpeaking()` when the conversation ID changes, add one:

```typescript
// Reset voice state when conversation changes
useEffect(() => {
  stopSpeaking();
  // Clear the assistant speech tracking so old messages don't replay
  if (assistantSpeechRef?.current) {
    assistantSpeechRef.current = new Map();
  }
}, [conversationId, stopSpeaking]);
```

Check the code comment at line ~434-436 which says:
> "intentionally no stopSpeaking() here — the auto-speak effect's queueAssistantSpeech already cancels old speech before queuing new"

Understand the existing cancellation flow before adding. The issue may be that `queueAssistantSpeech` cancels via generation counter, but the old audio buffer may still be playing. Verify that `cancelPlayback()` (called internally) actually stops the current `AudioContext` playback.

- [ ] **Step 3: Verify useChatAvatarVoice cleanup**

Read `useChatAvatarVoice.ts` lines 72-83 (cleanup effect). It already:
- Emits speaking change to false on unmount
- Dispatches silence event
- Resets `lastVoiceRef`

This is correct for unmount, but the hook may not re-mount on conversation switch (same `ChatView` component, different conversation). Verify that `mouthOpen` and `isSpeaking` reset to 0/false when `stopSpeaking()` is called. This should happen via the `useVoiceChat` hook setting `isSpeaking = false` and `mouthOpen = 0` in `cancelPlayback()`.

- [ ] **Step 4: Test conversation switch manually**

Run: `cd apps/app && bun run dev`

1. Start a conversation, trigger voice response
2. While voice is playing, switch to a different conversation
3. Verify: old voice stops immediately, no garbled overlap
4. Start new voice in new conversation — should work cleanly
5. Switch back to original conversation — no ghost audio

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/hooks/useVoiceChat.ts packages/app-core/src/components/ChatView.tsx
git commit -m "fix(voice): ensure clean voice state reset on conversation switch"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/pleasures/Documents/GitHub/milady
bunx vitest run packages/app-core/src/api/streaming-text.test.ts \
  packages/app-core/test/avatar/voice-chat-streaming-text.test.ts \
  packages/app-core/test/avatar/voice-chat.test.ts \
  packages/app-core/test/app/i18n.test.ts \
  packages/app-core/src/utils/spoken-text.test.ts
```

Expected: All tests PASS.

- [ ] **Step 2: Run lint**

```bash
cd /Users/pleasures/Documents/GitHub/milady
bunx biome check packages/app-core/src/
```

Fix any lint errors introduced by our changes.

- [ ] **Step 3: Manual QA checklist (i18n + voice)**

Verify spec sections 2.3 and 2.4 manually:
- Switch UI language to zh-CN → type Chinese characters in chat input → verify rendering and wrapping
- Switch to ko → send a message → verify character greeting comes back in Korean (or gracefully in English)
- Switch to es → trigger voice → verify TTS plays en-US fallback without errors or crashes
- Switch to vi → trigger voice → same fallback verification
- Test emoji input in chat across 2+ languages

- [ ] **Step 4: Build check**

```bash
cd /Users/pleasures/Documents/GitHub/milady
bun run build
```

Expected: Clean build with no type errors.

- [ ] **Step 5: Commit any lint/build fixes**

```bash
git add -A
git commit -m "chore: fix lint and type errors from settings/i18n/voice changes"
```
