# A .wgt is an unsigned zip; whoever installs it signs it (Apps2Samsung does).
#
# local-source.json at the root, ignored by git, becomes the source a fresh install starts
# with: it is written into the package only, never into the tree.
#   {"type": "xtream", "name": "My panel", "origin": "http://host", "user": "u", "pass": "p"}
import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ['config.xml', 'index.html', 'icon.png', 'brand.png']
DIRS = ['css', 'js', 'vendor']
LOCAL = os.path.join(ROOT, 'local-source.json')
LOCAL_JS = 'js/local-source.js'

def main():
    entries = list(FILES)
    for folder in DIRS:
        for dirpath, _, names in os.walk(os.path.join(ROOT, folder)):
            for name in sorted(names):
                if name.startswith('.'):
                    continue
                entries.append(os.path.relpath(os.path.join(dirpath, name), ROOT))

    for entry in entries:
        if not os.path.exists(os.path.join(ROOT, entry)):
            raise SystemExit('missing ' + entry)

    out = os.path.join(ROOT, 'dist', 'VexonTV.wgt')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    local = None
    if os.path.exists(LOCAL):
        with open(LOCAL, encoding='utf-8') as handle:
            local = json.load(handle)

    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
        for entry in entries:
            if local and entry == 'index.html':
                with open(os.path.join(ROOT, entry), encoding='utf-8') as handle:
                    page = handle.read()
                tag = '<script src="js/store.js"></script>'
                if tag not in page:
                    raise SystemExit('index.html has no store.js tag to put the source before')
                page = page.replace(tag, '<script src="%s"></script>\n        %s' % (LOCAL_JS, tag))
                archive.writestr(entry, page)
                continue
            archive.write(os.path.join(ROOT, entry), entry.replace(os.sep, '/'))
        if local:
            script = 'var App = App || {} // eslint-disable-line no-var\nApp.localSource = %s\n'
            archive.writestr(LOCAL_JS, script % json.dumps(local, ensure_ascii=False))
    count = len(entries) + (1 if local else 0)
    print('%s  %.2f MB  (%d files)' % (out, os.path.getsize(out) / 1048576, count))
    if local:
        print('default source: %s (from local-source.json)' % local.get('name', 'unnamed'))

if __name__ == '__main__':
    main()
