const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Alice coding task</title>
<link rel="stylesheet" href="/control/coding.css"></head>
<body><main>
<header><div class="brand">ALICE <span>CODING</span></div>
<h1>Give Alice a coding task.</h1>
<p class="intro">Describe a focused change. Approve it with your passkey, then review the result.</p></header>
<div class="workspace">
<section class="panel" aria-labelledby="task-heading">
<div class="section-heading"><span class="step">01</span><h2 id="task-heading">Prepare your task</h2></div>
<form id="task">
  <label for="repository">Repository</label>
  <input id="repository" name="repository" required placeholder="rndrntwrk/repository" autocomplete="off" spellcheck="false">
  <label for="baseCommit">Base commit SHA</label>
  <input id="baseCommit" name="baseCommit" required pattern="[a-f0-9]{40}" autocomplete="off" spellcheck="false" aria-describedby="base-help">
  <p class="hint" id="base-help">Use the current 40-character commit for the change you want Alice to make.</p>
  <label for="prompt">What should Alice do?</label>
  <textarea id="prompt" name="prompt" required rows="8" maxlength="16384" placeholder="Describe the change, the files in scope, and how to verify it."></textarea>
  <label class="checkbox"><input type="checkbox" name="pullRequest" checked> <span>Open a draft GitHub pull request for review when the task succeeds</span></label>
  <div class="actions"><button class="primary" type="submit">Approve and run</button><p class="hint">Your passkey approves this exact task.</p></div>
</form>
</section>
<aside class="panel passkey" aria-labelledby="passkey-heading">
<div class="section-heading"><span class="step">02</span><h2 id="passkey-heading">Approve with your device</h2></div>
<p id="passkey-help">First time here? Register a device passkey before approving a task.</p>
<button type="button" id="register" aria-describedby="passkey-help">Register device passkey</button>
<p class="hint">Once registered, use <strong>Approve and run</strong> to confirm your task with that passkey.</p>
<hr><p class="hint">Chat pairing is separate from task approval. A completed draft is ready for your review; merging requires another approval.</p>
</aside></div>
<section class="panel activity" aria-labelledby="activity-heading"><h2 id="activity-heading">Task activity</h2>
<p role="status" aria-live="polite" aria-atomic="true" id="status">Ready. Register a passkey before your first approval.</p><pre id="result"></pre></section>
<section class="recent" aria-labelledby="history-heading"><h2 id="history-heading">Recent coding tasks</h2><ul id="history"></ul></section>
</main><script src="/control/coding.js" defer></script></body></html>`;

const styles = `:root{color-scheme:dark;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0d1015;color:#edf1f7;font-synthesis:none}
*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:48px 28px 64px}
.brand{display:flex;align-items:center;gap:12px;font-size:14px;font-weight:800;letter-spacing:.16em;color:#c8efdd}.brand span{font-size:10px;letter-spacing:.12em;color:#a9b4c3;border-left:1px solid #34404c;padding-left:12px}
h1{font-size:clamp(28px,4vw,42px);line-height:1.15;letter-spacing:-.035em;margin:24px 0 12px}h2{font-size:17px;font-weight:650;letter-spacing:-.015em;margin:0}.intro{color:#a9b4c3;font-size:16px;line-height:1.6;margin:0 0 32px;max-width:620px}
.workspace{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(260px,1fr);gap:20px;align-items:start}.panel{background:#151a22;border:1px solid #2a3341;border-radius:16px;padding:26px}.section-heading{display:flex;align-items:center;gap:12px;margin-bottom:24px}.step{color:#9cabbc;font-size:11px;font-weight:650;letter-spacing:.08em}
label:not(.checkbox){display:block;font-size:13px;font-weight:600;margin:22px 0 9px}form>label:first-child{margin-top:0}input:not([type=checkbox]),textarea{display:block;width:100%;border:1px solid #394557;border-radius:9px;background:#0e131b;color:#edf1f7;padding:12px 14px;font:inherit;font-size:14px;line-height:1.5}input[name=repository],input[name=baseCommit]{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}textarea{resize:vertical;min-height:180px}input::placeholder,textarea::placeholder{color:#8795a8}
.hint{font-size:12px;line-height:1.65;color:#a9b4c3;margin:9px 0 0}.checkbox{display:flex;align-items:flex-start;gap:10px;margin:22px 0;font-size:13px;line-height:1.55;color:#c4cdda}.checkbox input{accent-color:#a8e7c9;width:17px;height:17px;margin:2px 0 0;flex-shrink:0}.actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap}.actions .hint{margin:0}
button{border:1px solid #48566b;border-radius:9px;background:#202936;color:#edf1f7;padding:11px 15px;min-height:44px;font:inherit;font-size:13px;font-weight:650;cursor:pointer;transition:background .15s,border-color .15s}button:hover{background:#2b3748;border-color:#718298}button.primary{background:#b2eacd;border-color:#b2eacd;color:#10241c}button.primary:hover{background:#cdf4df;border-color:#cdf4df}button:disabled{cursor:wait;opacity:.55}input:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid #a8e7c9;outline-offset:3px}
.passkey>p{font-size:14px;line-height:1.65;color:#c4cdda}.passkey #register{width:100%;margin:3px 0 6px}.passkey .hint{font-size:12px;color:#a9b4c3}.needs-registration{outline:2px solid #f1ce8a;outline-offset:4px;border-color:#f1ce8a;background:#382d20}hr{border:0;border-top:1px solid #2a3341;margin:24px 0}
.activity{margin-top:20px}#status{font-size:14px;line-height:1.7;color:#c4cdda;overflow-wrap:anywhere;margin:14px 0 0}#result:empty{display:none}#result{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace;margin:20px 0 0;padding:18px;background:#0e131b;border-radius:9px}#result button{margin:12px 8px 0 0}a{color:#b2eacd;text-underline-offset:3px}.recent{margin-top:32px}#history{list-style:none;padding:0;margin:16px 0 0}#history li{margin:8px 0}#history button{width:100%;text-align:left;overflow-wrap:anywhere;background:#151a22;font-size:12px;font-weight:500}
@media(max-width:740px){main{padding:28px 18px 40px}.workspace{grid-template-columns:1fr}.panel{padding:22px}.passkey{grid-row:1}.intro{margin-bottom:24px}.actions{align-items:flex-start;flex-direction:column;gap:10px}.actions button{width:100%}.brand{font-size:12px}}
@media(prefers-reduced-motion:reduce){button{transition:none}}`;

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
  if (!response.ok && value.code === 'WEBAUTHN_CREDENTIAL_REQUIRED') {
    const register = document.getElementById('register');
    register.classList.add('needs-registration');
    register.focus();
    throw new Error('Register a device passkey first, then approve this task again. Your task details are still here.');
  }
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
    document.getElementById('register').classList.remove('needs-registration');
    status.textContent = 'Device passkey registered. Choose Approve and run to confirm your task.';
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
        "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff" },
    });
  }
  if (path === "/control/coding.js") {
    return new Response(script, { headers: { "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
  if (path === "/control/coding.css") {
    return new Response(styles, { headers: { "content-type": "text/css; charset=utf-8",
      "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
  return null;
}
