const $ = (id) => document.getElementById(id);
// Reading lastError marks it handled, so Chrome doesn't log "Unchecked runtime.lastError" when the popup closes mid-call.
const send = (msg) => new Promise((resolve) =>
  chrome.runtime.sendMessage(msg, (res) => resolve(chrome.runtime.lastError ? {} : res)));
const isProd = (path) => /\/prod(uction)?\//i.test(path);

let viewing = null, pollTimer = null;
let scripts = {}, active = new Set(), lastRunAt = {}, visible = [], sel = 0, running = false, armed = null;

function render() {
  const q = $('search').value.trim().toLowerCase();
  visible = Object.keys(scripts)
    .filter((a) => !q || a.toLowerCase().includes(q) || scripts[a].toLowerCase().includes(q))
    .sort((a, b) => (lastRunAt[b] || 0) - (lastRunAt[a] || 0) || a.localeCompare(b));
  sel = Math.min(sel, Math.max(visible.length - 1, 0));

  const list = $('list');
  list.replaceChildren();
  if (!visible.length) {
    list.innerHTML = `<li class="empty">${Object.keys(scripts).length ? 'No matches.' : 'No scripts yet. Click + to add one.'}</li>`;
    return;
  }
  visible.forEach((name, i) => {
    const li = document.createElement('li');
    li.className = i === sel ? 'sel' : '';
    li.innerHTML = `<div class="line"><span class="alias"></span>${isProd(scripts[name]) ? '<span class="prod">PROD</span>' : ''}
      ${active.has(name) ? '<span class="live">● running</span>' : ''}
      <button class="ghost edit" title="Rename">✎</button><button class="ghost del" title="Remove from list">✕</button><button class="primary run">▶</button></div><div class="path"></div>`;
    li.querySelector('.alias').textContent = name;
    li.querySelector('.alias').title = name;
    li.querySelector('.path').textContent = scripts[name];
    const btn = li.querySelector('.run');
    btn.disabled = running;
    if (armed === name) { btn.textContent = 'Confirm'; btn.className = 'danger run'; }
    if (active.has(name)) { btn.textContent = 'Stop'; btn.className = 'run'; btn.disabled = false; }
    btn.onclick = (e) => { e.stopPropagation(); active.has(name) ? stop(name) : trigger(name); };
    li.querySelector('.edit').onclick = (e) => { e.stopPropagation(); rename(li, name); };
    li.querySelector('.del').onclick = async (e) => {
      e.stopPropagation();
      const res = await send({ action: 'remove', alias: name });
      scripts = res.scripts || scripts;
      active = new Set(res.running || []);
      render();
    };
    if (name === viewing) li.classList.add('open');
    li.querySelector('.line').onclick = () => {
      sel = i;
      list.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel'));
      li.classList.add('sel');
      view(name);
    };
    list.append(li);
  });
  list.children[sel]?.scrollIntoView({ block: 'nearest' });
}

// Prod scripts need two presses within 3s.
function trigger(name) {
  if (active.has(name)) return stop(name);
  if (running) return;
  if (isProd(scripts[name]) && armed !== name) {
    armed = name;
    render();
    setTimeout(() => { if (armed === name) { armed = null; render(); } }, 3000);
    return;
  }
  armed = null;
  run(name);
}

function showRun(res, busy) {
  $('result').classList.remove('hidden');
  $('result').open = true;
  $('runName').textContent = res.alias || '';
  $('status').textContent = busy ? '· running…' : res.stopped ? '· stopped' : res.running ? '· running' :
    res.never ? '' : res.code == null ? '· last run' : `· exit ${res.code}`;
  $('status').className = res.running && !busy ? 'ok' : busy || res.stopped || res.never || res.code == null ? 'busy' : res.code === 0 ? 'ok' : 'err';
  const out = $('out');
  const atBottom = out.scrollTop + out.clientHeight >= out.scrollHeight - 4;
  out.textContent = busy ? '' : (res.stdout || '') + (res.stderr || '') || '(no output)';
  if (atBottom) out.scrollTop = out.scrollHeight;  // follow live output unless the user scrolled up
}

async function run(alias) {
  running = true;
  active.add(alias);  // shows Stop on this row straight away
  lastRunAt[alias] = Date.now();
  render();
  showRun({ alias }, true);
  view(alias);
  const res = await send({ action: 'run', alias });
  if (!res.running) active.delete(alias);
  showRun(res);
  running = false;
  render();
}

// Swaps the alias for an input. Enter or clicking away saves, Esc cancels.
function rename(li, name) {
  const span = li.querySelector('.alias');
  const input = document.createElement('input');
  input.className = 'rename';
  input.value = name;
  input.maxLength = 60;
  span.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    const to = input.value.trim();
    if (save && to && to !== name) {
      const res = await send({ action: 'rename', alias: name, to });
      if (res.error) showRun({ alias: name, code: -1, stdout: 'Rename failed: ' + res.error });
      else if (res.scripts) {
        scripts = res.scripts;
        active = new Set(res.running || []);
        if (lastRunAt[name]) {
          lastRunAt[to] = lastRunAt[name];
          delete lastRunAt[name];
          chrome.storage.local.set({ lastRunAt });
        }
        if (viewing === name) viewing = to;
      }
    }
    render();
    $('search').focus();
  };
  input.onclick = (e) => e.stopPropagation();
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  };
  input.onblur = () => finish(true);
}

// Shows a script's output; refreshes every second while it's running.
async function view(alias) {
  viewing = alias;
  clearTimeout(pollTimer);
  document.querySelectorAll('#list li').forEach((li) =>
    li.classList.toggle('open', li.querySelector('.alias')?.textContent === alias));
  const res = await send({ action: 'log', alias });
  if (viewing !== alias) return;
  if (res.stdout !== undefined && !(res.never && active.has(alias))) showRun(res);
  if (res.running || active.has(alias)) pollTimer = setTimeout(() => viewing === alias && view(alias), 1000);
}

async function stop(alias) {
  const res = await send({ action: 'stop', alias });
  active = new Set(res.running || []);
  chrome.action.setBadgeText({ text: '' });
  showRun({ alias, stopped: true, stdout: 'Stopped.\n' });
  render();
}

$('search').oninput = () => { sel = 0; armed = null; render(); };
$('search').onkeydown = (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sel = Math.max(0, Math.min(visible.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
    armed = null;
    render();
  } else if (e.key === 'Enter' && visible[sel]) {
    trigger(visible[sel]);
  }
};

$('toggleHelp').onclick = () => {
  const hidden = $('help').classList.toggle('hidden');
  $('toggleHelp').setAttribute('aria-expanded', String(!hidden));
};
$('toggleAdd').onclick = () => {
  const hidden = $('addForm').classList.toggle('hidden');
  $('toggleAdd').setAttribute('aria-expanded', String(!hidden));
  $('toggleAdd').textContent = hidden ? '+' : '×';
  (hidden ? $('search') : $('alias')).focus();
};
$('add').onclick = async () => {
  $('add').disabled = true;
  const res = await send({ action: 'add', alias: $('alias').value });
  $('alias').value = '';
  $('add').disabled = false;
  if (res.scripts) { scripts = res.scripts; active = new Set(res.running || []); render(); }
};

Promise.all([send({ action: 'list' }), chrome.storage.local.get(['lastRunAt', 'lastRun'])]).then(([res, st]) => {
  scripts = res.scripts || {};
  active = new Set(res.running || []);
  lastRunAt = st.lastRunAt || {};
  if (st.lastRun) showRun(st.lastRun);
  render();
});

$('ver').textContent = 'v' + chrome.runtime.getManifest().version;
