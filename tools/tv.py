# Build, sign, install and launch on the TV in one go: python3 tools/tv.py deploy
#
# Reads .local/tv.json (ignored by git):
#   {"sdk": "~/tizen-studio", "profile": "TV", "target": "<tv-ip>:26101"}
# sdk: where Tizen Studio is; profile: the certificate profile that includes the TV's DUID;
# target: the TV's address and developer port.
#
#   deploy   build, sign, install, launch
#   build    build and sign -> dist/VexonVOD.wgt
#   install  install dist/VexonVOD.wgt (reconnecting when the TV drops the connection)
#   launch   start the app on the TV
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
STAGE = os.path.join(DIST, 'stage')
SIGNED = 'VexonVOD.wgt'
CONFIG = os.path.join(ROOT, '.local', 'tv.json')
# What tizen install prints when the sdb link dropped: worth one reconnect and another try.
FLAKY = ('problem to transfer', 'no connected target', 'Can not get the target')
TRIES = 3


def settings():
    if not os.path.exists(CONFIG):
        raise SystemExit('missing .local/tv.json, see the top of tools/tv.py')
    with open(CONFIG, encoding='utf-8') as handle:
        data = json.load(handle)
    for key in ('sdk', 'profile', 'target'):
        if not data.get(key):
            raise SystemExit('.local/tv.json has no "%s"' % key)
    data['sdk'] = os.path.expanduser(data['sdk'])
    return data


def tool(cfg, name):
    path = os.path.join(cfg['sdk'], 'tools', 'ide', 'bin', 'tizen') if name == 'tizen' \
        else os.path.join(cfg['sdk'], 'tools', 'sdb')
    if not os.path.exists(path):
        raise SystemExit('no %s at %s' % (name, path))
    return path


def environment(cfg):
    env = dict(os.environ)
    # tizen package needs Java; Tizen Studio carries its own.
    for java in ('jdk/Contents/Home/bin', 'jdk/bin'):
        folder = os.path.join(cfg['sdk'], java)
        if os.path.isdir(folder):
            env['PATH'] = folder + os.pathsep + env.get('PATH', '')
            break
    return env


def run(cmd, env=None):
    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    return result.returncode, (result.stdout or '') + (result.stderr or '')


def app_id():
    with open(os.path.join(ROOT, 'config.xml'), encoding='utf-8') as handle:
        match = re.search(r'<tizen:application id="([^"]+)"', handle.read())
    if not match:
        raise SystemExit('config.xml has no tizen:application id')
    return match.group(1)


def build(cfg):
    code, out = run([sys.executable, os.path.join(ROOT, 'tools', 'build-wgt.py')])
    print(out.strip())
    if code:
        raise SystemExit('build failed')
    # tizen package signs a folder, so the package is unpacked first.
    shutil.rmtree(STAGE, ignore_errors=True)
    with zipfile.ZipFile(os.path.join(DIST, 'VexonTV.wgt')) as archive:
        archive.extractall(STAGE)
    code, out = run([tool(cfg, 'tizen'), 'package', '-t', 'wgt', '-s', cfg['profile'],
                     '--', STAGE], env=environment(cfg))
    made = glob.glob(os.path.join(STAGE, '*.wgt'))
    if code or not made:
        print(out.strip())
        raise SystemExit('signing failed')
    # A space in the file name makes the install fail without saying so.
    shutil.move(made[0], os.path.join(DIST, SIGNED))
    print('signed with profile %s: dist/%s' % (cfg['profile'], SIGNED))


def connect(cfg, fresh=False):
    sdb = tool(cfg, 'sdb')
    if fresh:
        run([sdb, 'disconnect', cfg['target']])
    code, out = run([sdb, 'connect', cfg['target']])
    if 'connected' not in out:
        print(out.strip())
        raise SystemExit('could not reach the TV at %s' % cfg['target'])


def install(cfg):
    if not os.path.exists(os.path.join(DIST, SIGNED)):
        raise SystemExit('no dist/%s yet: run build first' % SIGNED)
    connect(cfg)
    for attempt in range(TRIES):
        # The file name and its folder go apart: a path in -n fails at the transfer.
        code, out = run([tool(cfg, 'tizen'), 'install', '-n', SIGNED, '-s', cfg['target'],
                         '--', DIST])
        if 'successfully installed' in out:
            print('installed %s on %s' % (app_id(), cfg['target']))
            return
        if attempt + 1 < TRIES and any(sign in out for sign in FLAKY):
            print('the TV dropped the connection; reconnecting')
            connect(cfg, fresh=True)
            continue
        print(out.strip())
        raise SystemExit('install failed')


def launch(cfg):
    connect(cfg)
    code, out = run([tool(cfg, 'tizen'), 'run', '-p', app_id(), '-s', cfg['target']])
    if 'successfully launched' not in out:
        print(out.strip())
        raise SystemExit('launch failed')
    print('launched %s' % app_id())


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else 'deploy'
    steps = {'build': [build], 'install': [install], 'launch': [launch],
             'deploy': [build, install, launch]}
    if command not in steps:
        raise SystemExit('usage: python3 tools/tv.py [deploy|build|install|launch]')
    cfg = settings()
    for step in steps[command]:
        step(cfg)


if __name__ == '__main__':
    main()
