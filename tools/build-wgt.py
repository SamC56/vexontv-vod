"""Empaqueta la app en dist/VexonTV.wgt (un .wgt es un zip sin firmar; quien
lo instala lo firma: Apps2Samsung lo hace solo). El .wgt no se versiona a
proposito: un paquete commiteado se queda obsoleto respecto al codigo."""
# A .wgt is an unsigned zip; whoever installs it signs it (Apps2Samsung does).
import os
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ['config.xml', 'index.html', 'icon.png', 'brand.png']
DIRS = ['css', 'js', 'vendor']

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
            raise SystemExit('falta ' + entry)

    out = os.path.join(ROOT, 'dist', 'VexonTV.wgt')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
        for entry in entries:
            archive.write(os.path.join(ROOT, entry), entry.replace(os.sep, '/'))
    print('%s  %.2f MB  (%d ficheros)' % (out, os.path.getsize(out) / 1048576, len(entries)))

if __name__ == '__main__':
    main()
