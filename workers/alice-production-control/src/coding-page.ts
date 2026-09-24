const page = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Alice coding task</title>
<h1>Alice coding task</h1>
<p>Telegram pairing signs you in to chat. A device passkey approves each exact repository task.</p>
<form id="task">
  <p><label>Repository <input name="repository" required placeholder="rndrntwrk/repository" autocomplete="off"></label></p>
  <p><label>Base commit SHA <input name="baseCommit" required pattern="[a-f0-9]{40}" autocomplete="off"></label></p>
  <p><label>Task<br><textarea name="prompt" required rows="8" cols="70" maxlength="16384"></textarea></label></p>
  <p><button type="button" id="register">Register device passkey</button> <button type="submit">Approve and run</button></p>
</form>
<p role="status" id="status">Ready.</p><pre id="result"></pre>
<script src="/control/coding.js" defer></script></html>`;

const script = `const form = document.getElementById('task');
const status = document.getElementById('status');
const result = document.getElementById('result');
const button = form.querySelector('button[type=submit]');
async function post(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok || value.ok !== true) throw new Error(value.code || 'REQUEST_FAILED');
  return value;
}
function passkeyApi() {
  if (!window.PublicKeyCredential?.parseCreationOptionsFromJSON ||
      !window.PublicKeyCredential?.parseRequestOptionsFromJSON) {
    throw new Error('This browser cannot use the required device passkey API.');
  }
}
document.getElementById('register').addEventListener('click', async () => {
  try {
    passkeyApi();
    status.textContent = 'Waiting for device passkey registration…';
    const challenge = await post('/control/api/v1/webauthn/register/options', {});
    const credential = await navigator.credentials.create({
      publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(challenge.options),
    });
    if (!credential) throw new Error('PASSKEY_CANCELLED');
    await post('/control/api/v1/webauthn/register/verify', { response: credential.toJSON() });
    status.textContent = 'Device passkey registered.';
  } catch (error) { status.textContent = error.message; }
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  result.textContent = '';
  try {
    passkeyApi();
    const data = new FormData(form);
    const request = { repository: String(data.get('repository')).trim(),
      baseCommit: String(data.get('baseCommit')).trim(), prompt: String(data.get('prompt')) };
    status.textContent = 'Approve this exact repository task with your device passkey…';
    const challenge = await post('/control/api/v1/webauthn/approve/options', { request });
    const credential = await navigator.credentials.get({
      publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(challenge.options),
    });
    if (!credential) throw new Error('PASSKEY_CANCELLED');
    const approval = await post('/control/api/v1/webauthn/approve/verify', { response: credential.toJSON() });
    const task = await post('/control/api/v1/coding/tasks', { request, grant: approval.grant });
    status.textContent = 'Task ' + task.taskId + ' queued. Waiting for result…';
    for (let attempt = 0; attempt < 100; attempt++) {
      const response = await fetch('/control/api/v1/coding/tasks/' + encodeURIComponent(task.taskId));
      const current = await response.json();
      if (!response.ok || current.ok !== true) throw new Error(current.code || 'TASK_STATUS_UNAVAILABLE');
      const work = current.work;
      if (work?.state === 'completed') {
        status.textContent = 'Patch ready for review.';
        result.textContent = work.result?.patch || 'No patch was produced.';
        return;
      }
      if (work?.state === 'failed' || work?.state === 'dead-lettered' || current.workflow?.status === 'errored') {
        throw new Error(work?.code || current.workflow?.error?.message || 'CODING_TASK_FAILED');
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    status.textContent = 'Still running. Task ID: ' + task.taskId;
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});`;

export function codingPageResponse(path: string): Response | null {
  if (path === "/control/coding") {
    return new Response(page, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff" },
    });
  }
  if (path === "/control/coding.js") {
    return new Response(script, { headers: { "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
  return null;
}
