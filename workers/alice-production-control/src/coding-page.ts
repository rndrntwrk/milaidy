const page = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Alice coding task</title>
<h1>Alice coding task</h1>
<p>Telegram pairing/Elevated is separate from approval of this coding task. A device passkey approves each exact repository task.</p>
<form id="task">
  <p><label>Repository <input name="repository" required placeholder="rndrntwrk/repository" autocomplete="off"></label></p>
  <p><label>Base commit SHA <input name="baseCommit" required pattern="[a-f0-9]{40}" autocomplete="off"></label></p>
  <p><label>Task<br><textarea name="prompt" required rows="8" cols="70" maxlength="16384"></textarea></label></p>
  <p><label><input type="checkbox" name="pullRequest" checked> Open a draft GitHub pull request for review when the task succeeds</label></p>
  <p><button type="button" id="register">Register device passkey</button> <button type="submit">Approve and run</button></p>
</form>
<p role="status" id="status">Ready.</p><pre id="result"></pre>
<h2>Recent coding tasks</h2><ul id="history"></ul>
<script src="/control/coding.js" defer></script></html>`;

const script = String.raw`const form = document.getElementById('task');
const status = document.getElementById('status');
const result = document.getElementById('result');
const history = document.getElementById('history');
const button = form.querySelector('button[type=submit]');
let selectedTaskId = null;
async function post(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json();
  const blockedMergeTask = path === '/control/api/v1/coding/merge' && response.status === 409 &&
    value.ok === false && value.status === 'blocked' &&
    typeof value.taskId === 'string' && /^task-cap-[a-f0-9-]{36}$/.test(value.taskId);
  if (!blockedMergeTask && (!response.ok || value.ok !== true)) throw new Error(value.code || 'REQUEST_FAILED');
  return value;
}
function passkeyApi() {
  if (!window.PublicKeyCredential?.parseCreationOptionsFromJSON ||
      !window.PublicKeyCredential?.parseRequestOptionsFromJSON) {
    throw new Error('This browser cannot use the required device passkey API.');
  }
}
function mergeButton(request, label = 'Approve squash merge') {
  const approve = document.createElement('button');
  approve.type = 'button';
  approve.textContent = label;
  approve.addEventListener('click', async () => {
    approve.disabled = true;
    try {
      passkeyApi();
      status.textContent = 'Approve PR #' + request.pullRequestNumber + ' at head ' + request.headCommit + ' with your device passkey…';
      const challenge = await post('/control/api/v1/webauthn/approve/options', { operation: 'repository.merge', request });
      const credential = await navigator.credentials.get({
        publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(challenge.options),
      });
      if (!credential) throw new Error('PASSKEY_CANCELLED');
      const approval = await post('/control/api/v1/webauthn/approve/verify', { response: credential.toJSON() });
      const task = await post('/control/api/v1/coding/merge', { request, grant: approval.grant });
      await watchTask(task.taskId);
      if (task.status === 'pending') status.textContent = 'Merge pending: ' + task.code + '. Check GitHub before approving a retry.';
    } catch (error) { status.textContent = error.message; }
    finally { approve.disabled = false; }
  });
  return approve;
}
async function loadTasks() {
  const response = await fetch('/control/api/v1/coding/tasks');
  const value = await response.json();
  if (!response.ok || value.ok !== true || !Array.isArray(value.tasks)) {
    throw new Error(value.code || 'TASK_LIST_UNAVAILABLE');
  }
  history.replaceChildren();
  for (const task of value.tasks) {
    const row = document.createElement('li');
    const link = document.createElement('button');
    link.type = 'button';
    link.textContent = task.taskId + ' · ' + new Date(task.updatedAt).toLocaleString();
    link.addEventListener('click', () => { void watchTask(task.taskId); });
    row.append(link);
    history.append(row);
  }
}
async function watchTask(taskId) {
  selectedTaskId = taskId;
  localStorage.setItem('alice-coding-last-task', taskId);
  result.textContent = '';
  status.textContent = 'Loading task ' + taskId + '…';
  try {
    for (let attempt = 0; attempt < 100 && selectedTaskId === taskId; attempt++) {
      const response = await fetch('/control/api/v1/coding/tasks/' + encodeURIComponent(taskId));
      const current = await response.json();
      if (selectedTaskId !== taskId) return;
      if (!response.ok || current.ok !== true) throw new Error(current.code || 'TASK_STATUS_UNAVAILABLE');
      const work = current.work;
      if (work?.action === 'repository.merge' && (work.state === 'pending' || work.state === 'blocked')) {
        status.textContent = work.state === 'blocked' ? 'Merge blocked: ' + work.code : 'Merge has no verified completion yet. Check the PR before approving a retry.';
        result.append(document.createTextNode('PR #' + work.request.pullRequestNumber + '\nHead: ' + work.request.headCommit + '\n'),
          mergeButton(work.request, 'Approve retry for this exact PR'));
        const reconcile = document.createElement('button');
        reconcile.type = 'button';
        reconcile.textContent = 'Check merge result';
        reconcile.addEventListener('click', async () => {
          try {
            await post('/control/api/v1/coding/merge', { taskId, reconcileOnly: true });
            await watchTask(taskId);
          } catch (error) { status.textContent = error.message; }
        });
        result.append(reconcile);
        await loadTasks();
        return;
      }
      if (work?.state === 'completed') {
        const pr = work.result?.pullRequestUrl;
        if (typeof pr === 'string' && /^https:\/\/github\.com\/(?:rndrntwrk|Render-Network-OS)\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/.test(pr)) {
          status.textContent = work.action === 'repository.merge'
            ? 'Squash merge verified: ' + taskId
            : 'Draft pull request ready for review: ' + taskId;
          const link = document.createElement('a');
          link.href = pr;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = pr;
          result.append(link, document.createTextNode('\n' + (work.result.summary || '')));
          if (work.action === 'repository.merge') {
            result.append(document.createTextNode('\nMerged by ' + work.result.mergedBy + '\nMerge commit: ' + work.result.mergeCommit));
          } else if (work.action === 'coding.pr.create' && /^[a-f0-9]{40}$/.test(work.result.commitSha || '')) {
            const parts = new URL(pr).pathname.split('/');
            const request = { repository: parts[1] + '/' + parts[2], sourceTaskId: taskId,
              pullRequestNumber: Number(parts[4]), headCommit: work.result.commitSha };
            result.append(document.createTextNode('\nHead: ' + request.headCommit + '\n'), mergeButton(request));
          }
        } else {
          status.textContent = 'Patch ready for review: ' + taskId;
          result.textContent = work.result?.patch || 'No patch was produced.';
        }
        await loadTasks();
        return;
      }
      if (work?.state === 'failed' || work?.state === 'dead-lettered' || current.workflow?.status === 'errored') {
        const guidance = {
          CODING_RESULT_TOO_LARGE: 'The generated patch exceeded Alice’s durable task limit. Split the request into smaller repository changes and try again.',
          CODING_CHANGE_SET_TOO_LARGE: 'The generated changes are too large for one draft pull request. Split the task into smaller changes.',
          CODING_BASE_MOVED: 'The repository moved after this task was approved. Start a new task from its current base commit.',
          CODING_EMPTY_PATCH: 'The task finished without any file changes, so there is no pull request to open.',
          CODING_PUBLISH_AUTH_DENIED: 'The exact task approval is no longer valid. Start a new task and approve it again.',
        };
        throw new Error(guidance[work?.code] || work?.code || current.workflow?.error?.message || 'CODING_TASK_FAILED');
      }
      status.textContent = 'Task ' + taskId + ' is ' + (work?.state || 'starting') + '…';
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    if (selectedTaskId === taskId) status.textContent = 'Still running. Task ID: ' + taskId;
  } catch (error) {
    if (selectedTaskId === taskId) status.textContent = error.message;
  }
}
void loadTasks().then(() => {
  if (selectedTaskId !== null) return;
  const last = localStorage.getItem('alice-coding-last-task');
  if (last) void watchTask(last);
}).catch((error) => { if (selectedTaskId === null) status.textContent = error.message; });
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
      baseCommit: String(data.get('baseCommit')).trim(), prompt: String(data.get('prompt')),
      ...(data.get('pullRequest') ? { delivery: 'pull-request' } : {}) };
    status.textContent = 'Approve this exact repository task with your device passkey…';
    const challenge = await post('/control/api/v1/webauthn/approve/options', { request });
    const credential = await navigator.credentials.get({
      publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(challenge.options),
    });
    if (!credential) throw new Error('PASSKEY_CANCELLED');
    const approval = await post('/control/api/v1/webauthn/approve/verify', { response: credential.toJSON() });
    localStorage.setItem('alice-coding-last-task', 'task-' + approval.grant.capabilityId);
    const task = await post('/control/api/v1/coding/tasks', { request, grant: approval.grant });
    await watchTask(task.taskId);
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
