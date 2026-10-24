"""Hash source changes against the preserved V31 archive; no repository mutation."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

root = Path(__file__).resolve().parent.parent
digest = lambda data: hashlib.sha256(data).hexdigest()
with ZipFile(root / 'evidence/v32/source-v31.zip') as archive:
    old = {n: archive.read(n) for n in archive.namelist() if not n.endswith('/')}
folders = {n.split('/')[0] for n in old if '/' in n}
names = set(old) | {'README.md', 'reference.html'}
for folder in folders:
    names.update(p.relative_to(root).as_posix() for p in (root / folder).rglob('*')
                 if p.is_file() and p.suffix in {'.mjs', '.js', '.py', '.html', '.css', '.json'})
changes = []
for name in sorted(names):
    path = root / name
    before = digest(old[name]) if name in old else None
    after = digest(path.read_bytes()) if path.is_file() else None
    if before != after:
        status = 'modified' if before and after else 'added' if after else 'removed'
        if name == 'README.md':
            status = 'updated-document (not in baseline archive)'
        changes.append(dict(path=name, status=status, beforeSha256=before, afterSha256=after))
result = dict(baseline='evidence/v32/source-v31.zip',
              baselineSha256=digest((root / 'evidence/v32/source-v31.zip').read_bytes()),
              scope='Archived source trees plus README/reference; excludes assets, generated dist, fixtures and evidence',
              changes=changes,
              generated=['dist/', 'fixtures/lumen-v32.planet', 'fixtures/legacy-lumen-v31.planet', 'output/v32/'])
(root / 'evidence/v32/changed-files.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf8')
print(json.dumps({'changedSourceFiles':len(changes),'manifest':'evidence/v32/changed-files.json'}))
