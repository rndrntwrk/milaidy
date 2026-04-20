import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  InvalidSettingsError,
  isValidWsUrl,
  loadSettings,
  saveSettings,
} from "../settings.js";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../types.js";

export function App(): ReactElement {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  const wsUrlValid = isValidWsUrl(settings.wsUrl);

  const onSave = async (): Promise<void> => {
    setError(null);
    try {
      await saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 1_500);
    } catch (e) {
      setError(
        e instanceof InvalidSettingsError
          ? e.message
          : e instanceof Error
            ? e.message
            : "failed to save settings",
      );
    }
  };

  return (
    <div>
      <h1>LifeOps extension settings</h1>
      <p>
        These settings control how this extension talks to the local Milady /
        LifeOps agent.
      </p>

      <label htmlFor="wsUrl">Agent WebSocket URL</label>
      <input
        id="wsUrl"
        type="text"
        value={settings.wsUrl}
        onChange={(e) => setSettings({ ...settings, wsUrl: e.target.value })}
      />
      {!wsUrlValid ? (
        <div style={{ color: "crimson", fontSize: 12 }}>
          Must be a ws:// or wss:// URL.
        </div>
      ) : null}

      <label htmlFor="flushIntervalMs">Flush interval (ms, min 1000)</label>
      <input
        id="flushIntervalMs"
        type="number"
        min={1000}
        step={1000}
        value={settings.flushIntervalMs}
        onChange={(e) =>
          setSettings({
            ...settings,
            flushIntervalMs: Math.max(1000, Number(e.target.value) || 0),
          })
        }
      />
      <div style={{ fontSize: 12, color: "#666" }}>
        Note: chrome.alarms enforces a 1-minute minimum; values under 60000ms
        are effectively rounded up.
      </div>

      <label>
        <input
          type="checkbox"
          checked={settings.activityReportingEnabled}
          onChange={(e) =>
            setSettings({
              ...settings,
              activityReportingEnabled: e.target.checked,
            })
          }
        />{" "}
        Activity reporting enabled
      </label>

      <div>
        <button type="button" onClick={onSave} disabled={!wsUrlValid}>
          Save
        </button>
        {saved ? (
          <span style={{ marginLeft: 12, color: "green" }}>Saved</span>
        ) : null}
        {error ? (
          <span style={{ marginLeft: 12, color: "crimson" }}>{error}</span>
        ) : null}
      </div>
    </div>
  );
}
