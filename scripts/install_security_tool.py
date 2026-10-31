"""Install one pinned project security tool: skillspector, osv, or codex-security."""
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.request import Request, urlopen

project = Path(__file__).resolve().parents[1]
root = project / '.tools/security'
root.mkdir(parents=True, exist_ok=True)
versions = json.loads((project / 'tools/security/versions.json').read_text())
env = {k: v for k, v in os.environ.items() if k in {
    'PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL',
    'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY',
}}
env['UV_CACHE_DIR'] = str(root / 'cache/uv')
env['NPM_CONFIG_CACHE'] = str(root / 'cache/npm')

def run(*args):
    subprocess.run(args, env=env, check=True)

tool = sys.argv[1]
if tool == 'skillspector':
    python = root / 'python/bin/python'
    if not python.exists():
        run('uv', 'venv', '--python', 'python3.12', str(root / 'python'))
    commit = versions['skillspector']['commit']
    assert len(commit) == 40 and all(c in '0123456789abcdef' for c in commit)
    run('uv', 'pip', 'install', '--python', str(python), '--constraint', str(project / 'tools/security/python-requirements.lock.txt'), f'https://github.com/NVIDIA/SkillSpector/archive/{commit}.tar.gz')
    with (root / 'python-freeze.txt').open('w') as stream:
        subprocess.run(['uv', 'pip', 'freeze', '--python', str(python)], stdout=stream, env=env, check=True)
elif tool == 'osv':
    info = versions['osv_scanner']
    assert info['url'].startswith('https://github.com/google/osv-scanner/releases/download/')
    with urlopen(Request(info['url'], headers={'User-Agent': 'make-the-one-security-setup'}), timeout=60) as response:
        data = response.read(200_000_001)
    if len(data) > 200_000_000:
        raise SystemExit('Binary unexpectedly exceeds 200 MB')
    digest = 'sha256:' + hashlib.sha256(data).hexdigest()
    if not info['digest'] or digest != info['digest']:
        raise SystemExit('OSV release SHA-256 mismatch or missing digest')
    binary = root / 'bin/osv-scanner'
    binary.parent.mkdir(exist_ok=True)
    if binary.exists() and hashlib.sha256(binary.read_bytes()).hexdigest() != digest.removeprefix('sha256:'):
        raise SystemExit('Existing binary differs; refusing overwrite')
    binary.write_bytes(data)
    binary.chmod(0o755)
    print('OSV official release SHA-256 verified.', flush=True)
elif tool == 'codex-security':
    version = versions['codex_security']['version']
    assert all(c.isdigit() or c == '.' for c in version)
    node = root / 'node'
    node.mkdir(exist_ok=True)
    for name in ('package.json', 'package-lock.json'):
        locked = 'npm-package-lock.json' if name == 'package-lock.json' else name
        destination = node / name
        expected = (project / 'tools/security' / locked).read_bytes()
        if destination.exists() and destination.read_bytes() != expected:
            raise SystemExit(f'Existing {name} differs; refusing overwrite')
        destination.write_bytes(expected)
    run('npm', 'ci', '--prefix', str(node), '--no-audit', '--no-fund',
        '--userconfig', '/dev/null', '--registry', 'https://registry.npmjs.org')
    lock = json.loads((root / 'node/package-lock.json').read_text())
    actual = lock['packages']['node_modules/@openai/codex-security']['integrity']
    if actual != versions['codex_security']['integrity']:
        raise SystemExit('Codex Security npm integrity mismatch')
    print('Codex Security npm integrity matches resolved package.', flush=True)
else:
    raise SystemExit('Unknown tool')
