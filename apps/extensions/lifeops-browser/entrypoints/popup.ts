import type {
  BackgroundState,
  CompanionConfig,
  PopupRequest,
  PopupResponse,
} from "../src/protocol";
import { sendRuntimeMessage } from "../src/webextension";

type FormRefs = {
  apiBaseUrl: HTMLInputElement;
  companionId: HTMLInputElement;
  pairingToken: HTMLInputElement;
  profileId: HTMLInputElement;
  profileLabel: HTMLInputElement;
  label: HTMLInputElement;
  status: HTMLElement;
  meta: HTMLElement;
  saveButton: HTMLButtonElement;
  syncButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
};

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing element ${selector}`);
  }
  return element as T;
}

function getFormRefs(): FormRefs {
  return {
    apiBaseUrl: requireElement<HTMLInputElement>("#apiBaseUrl"),
    companionId: requireElement<HTMLInputElement>("#companionId"),
    pairingToken: requireElement<HTMLInputElement>("#pairingToken"),
    profileId: requireElement<HTMLInputElement>("#profileId"),
    profileLabel: requireElement<HTMLInputElement>("#profileLabel"),
    label: requireElement<HTMLInputElement>("#label"),
    status: requireElement<HTMLElement>("#status"),
    meta: requireElement<HTMLElement>("#meta"),
    saveButton: requireElement<HTMLButtonElement>("#save"),
    syncButton: requireElement<HTMLButtonElement>("#sync"),
    clearButton: requireElement<HTMLButtonElement>("#clear"),
  };
}

function renderState(refs: FormRefs, state: BackgroundState): void {
  const config = state.config;
  refs.apiBaseUrl.value = config?.apiBaseUrl ?? "http://127.0.0.1:31337";
  refs.companionId.value = config?.companionId ?? "";
  refs.pairingToken.value = config?.pairingToken ?? "";
  refs.profileId.value = config?.profileId ?? "default";
  refs.profileLabel.value = config?.profileLabel ?? "default";
  refs.label.value = config?.label ?? "";
  refs.status.textContent =
    state.lastError ??
    state.lastSessionStatus ??
    (state.lastSyncAt
      ? `Synced ${new Date(state.lastSyncAt).toLocaleTimeString()}`
      : "Not synced yet");
  refs.meta.textContent = [
    `Remembered tabs: ${state.rememberedTabCount}`,
    state.settingsSummary ? `Settings: ${state.settingsSummary}` : null,
    state.activeSessionId ? `Session: ${state.activeSessionId}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function sendMessage<T extends PopupRequest>(
  request: T,
): Promise<PopupResponse> {
  return await sendRuntimeMessage<PopupResponse>(request);
}

function readConfig(refs: FormRefs): Partial<CompanionConfig> {
  return {
    apiBaseUrl: refs.apiBaseUrl.value,
    companionId: refs.companionId.value,
    pairingToken: refs.pairingToken.value,
    profileId: refs.profileId.value,
    profileLabel: refs.profileLabel.value,
    label: refs.label.value,
  };
}

async function refresh(refs: FormRefs): Promise<void> {
  const response = await sendMessage({ type: "lifeops-browser:get-state" });
  if (!response.ok || !response.state) {
    refs.status.textContent = response.error;
    return;
  }
  renderState(refs, response.state);
}

document.addEventListener("DOMContentLoaded", () => {
  const refs = getFormRefs();

  void refresh(refs);

  refs.saveButton.addEventListener("click", async () => {
    refs.status.textContent = "Saving companion pairing...";
    const response = await sendMessage({
      type: "lifeops-browser:save-config",
      config: readConfig(refs),
    });
    if (!response.ok || !response.state) {
      refs.status.textContent = response.error;
      return;
    }
    renderState(refs, response.state);
  });

  refs.syncButton.addEventListener("click", async () => {
    refs.status.textContent = "Syncing...";
    const response = await sendMessage({ type: "lifeops-browser:sync-now" });
    if (!response.ok || !response.state) {
      refs.status.textContent = response.error;
      return;
    }
    renderState(refs, response.state);
  });

  refs.clearButton.addEventListener("click", async () => {
    const response = await sendMessage({
      type: "lifeops-browser:clear-config",
    });
    if (!response.ok || !response.state) {
      refs.status.textContent = response.error;
      return;
    }
    renderState(refs, response.state);
  });
});
