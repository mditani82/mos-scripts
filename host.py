#!/usr/bin/env python3
# Native messaging host. Actions: "list", "add" (macOS file dialog, saved under an alias), "run", "stop", "remove", "rename", "log" (output of the last/current run).
# Paths only ever come from the dialog; the extension can only refer to saved scripts by alias.
import json, os, signal, struct, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(HERE, 'scripts.json')
RUNNING = os.path.join(HERE, 'running.json')
LOGS = os.path.join(HERE, 'logs')
WAIT = 10  # seconds; scripts still running after this (tunnels, servers) are left running in the background
OLD = os.path.join(HERE, 'saved_script.txt')

def reply(obj):
    out = json.dumps(obj).encode()
    sys.stdout.buffer.write(struct.pack('<I', len(out)) + out)
    sys.stdout.buffer.flush()
    sys.exit()

def write_json(path, obj):
    # Write to a temp file and swap it in, so a crash mid-write can't empty the file.
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(obj, f, indent=2)
    os.replace(tmp, path)

def save(scripts):
    write_json(STORE, scripts)

scripts = json.load(open(STORE)) if os.path.exists(STORE) else {}
if not scripts and os.path.exists(OLD):  # migrate the single saved script from the earlier version
    path = open(OLD).read().strip()
    if path:
        scripts = {os.path.splitext(os.path.basename(path))[0]: path}
        save(scripts)
    os.remove(OLD)

def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False

running = json.load(open(RUNNING)) if os.path.exists(RUNNING) else {}
# ponytail: liveness is by pid only; a reused pid after a reboot could look alive. Store start time too if that bites.
running = {a: pid for a, pid in running.items() if alive(pid)}

def update_running(alias, pid=None):
    # Re-read first: a "run" host may be waiting while a "stop" host edits the file.
    # ponytail: no file lock; two hosts writing in the same millisecond can drop an entry.
    cur = json.load(open(RUNNING)) if os.path.exists(RUNNING) else {}
    cur = {a: p for a, p in cur.items() if alive(p)}
    if pid is None:
        cur.pop(alias, None)
    else:
        cur[alias] = pid
    write_json(RUNNING, cur)
    return cur

def tail(path):
    with open(path, errors='replace') as f:
        return f.read()[-4000:]

n = sys.stdin.buffer.read(4)
msg = json.loads(sys.stdin.buffer.read(struct.unpack('<I', n)[0])) if n else {}
action, alias = msg.get('action'), str(msg.get('alias') or '').strip()[:60]

if action == 'add':
    pick = subprocess.run(['osascript', '-e', 'activate', '-e',
                           'POSIX path of (choose file with prompt "Pick a script to save" of type {"sh", "public.shell-script"})'],
                          capture_output=True, text=True)
    if pick.returncode == 0:
        path = pick.stdout.strip()
        scripts[alias or os.path.splitext(os.path.basename(path))[0]] = path
        save(scripts)

elif action in ('stop', 'remove'):
    if alias in running:
        try:
            os.killpg(running[alias], signal.SIGTERM)  # the script and everything it started (ssh, aws ssm, ...)
        except ProcessLookupError:
            pass
        running = update_running(alias)
    if action == 'remove':
        scripts.pop(alias, None)
        save(scripts)

elif action == 'rename':
    to = str(msg.get('to') or '').strip()[:60]
    if alias in scripts and to and to != alias:
        if to in scripts:
            reply({'scripts': scripts, 'running': list(running), 'error': f'"{to}" already exists.'})
        scripts = {to if a == alias else a: p for a, p in scripts.items()}
        save(scripts)
        if alias in running:
            update_running(alias)
            running = update_running(to, running[alias])
        for ext in ('.log', '.log.exit'):
            old = os.path.join(LOGS, alias.replace('/', '_') + ext)
            if os.path.exists(old):
                os.replace(old, os.path.join(LOGS, to.replace('/', '_') + ext))

elif action == 'log':
    log = os.path.join(LOGS, alias.replace('/', '_') + '.log')
    if not os.path.exists(log):
        reply({'alias': alias, 'never': True, 'stdout': '(not run yet)', 'stderr': ''})
    code = open(log + '.exit').read().strip() if os.path.exists(log + '.exit') else ''
    reply({'alias': alias, 'running': alias in running, 'code': int(code) if code.lstrip('-').isdigit() else None,
           'stopped': code.startswith('-'), 'stdout': tail(log), 'stderr': ''})

elif action == 'run':
    path = scripts.get(alias, '')
    if not os.path.isfile(path):
        reply({'alias': alias, 'code': -1, 'stdout': '', 'stderr': f'Script not found: {path or alias}. Re-add it.'})
    if alias in running:
        reply({'alias': alias, 'running': True, 'stdout': f'Already running (pid {running[alias]}).\n', 'stderr': ''})
    os.makedirs(LOGS, exist_ok=True)
    log = os.path.join(LOGS, alias.replace('/', '_') + '.log')
    # Chrome gives the host a bare PATH; a zsh login shell loads the user's PATH (Homebrew, /usr/local/bin, ...).
    # Own session + output to a file (not pipes) so long-running scripts survive Chrome killing this host.
    if os.path.exists(log + '.exit'):
        os.remove(log + '.exit')
    with open(log, 'w') as out:
        p = subprocess.Popen(['/bin/zsh', '-lc', 'exec /bin/bash "$1"', '_', path], cwd=os.path.dirname(path),
                             stdin=subprocess.DEVNULL, stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
    update_running(alias, p.pid)  # registered immediately so Stop works from the first second
    try:
        code = p.wait(timeout=WAIT)
    except subprocess.TimeoutExpired:
        reply({'alias': alias, 'running': True, 'stdout': tail(log) + f'\n[still running in background, pid {p.pid}, log: {log}]\n', 'stderr': ''})
    update_running(alias)
    with open(log + '.exit', 'w') as f:  # so "log" can show how a finished run ended
        f.write(str(code))
    if code < 0:  # killed by a signal, i.e. Stop was pressed
        reply({'alias': alias, 'code': code, 'stopped': True, 'stdout': tail(log) + '\n[stopped]\n', 'stderr': ''})
    reply({'alias': alias, 'code': code, 'stdout': tail(log), 'stderr': ''})

reply({'scripts': scripts, 'running': list(running)})
