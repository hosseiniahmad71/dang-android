"""Verify ZIP integrity and every locally referenced entry asset in an actual APK."""
import argparse, hashlib, json, posixpath, re, subprocess, zipfile
from html.parser import HTMLParser
from urllib.parse import urlsplit

class Assets(HTMLParser):
    def __init__(self):
        super().__init__(); self.refs=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag=='img' and attrs.get('src'): self.refs.append(attrs['src'])
        if tag=='link' and attrs.get('rel')=='preload': self.refs.append(attrs['href'])
        if tag=='script' and attrs.get('src'): self.refs.append(attrs['src'])
        if tag=='link' and attrs.get('rel')=='stylesheet': self.refs.append(attrs['href'])

p=argparse.ArgumentParser();p.add_argument('apk');p.add_argument('--aapt');p.add_argument('--expected-package');a=p.parse_args()
with zipfile.ZipFile(a.apk) as z:
    assert z.testzip() is None, 'ZIP CRC failure'
    html=z.read('assets/web/index.html').decode(); parser=Assets();parser.feed(html)
    assert parser.refs, 'No entry assets'
    checked=[]
    for ref in parser.refs:
        u=urlsplit(ref);assert not u.scheme and not u.netloc, 'Nonlocal entry asset: '+ref
        name=posixpath.normpath(u.path).lstrip('./');assert '..' not in name.split('/'), 'Unsafe path'
        data=z.read('assets/web/'+name);assert data, 'Empty asset: '+name
        checked.append({'asset':name,'bytes':len(data)})
    assert 'boot-guard.js' in [x['asset'] for x in checked], 'Missing independent recovery script'
    assert b'dangStartup' in z.read('assets/web/boot-guard.js')
    assert not any(n.startswith('assets/') and 'migration-test' in n for n in z.namelist()), 'Test harness leaked into app APK'
result={'apk':a.apk,'sha256':hashlib.sha256(open(a.apk,'rb').read()).hexdigest(),'assets':checked}
if a.aapt:
    manifest=subprocess.check_output([a.aapt,'dump','xmltree',a.apk,'AndroidManifest.xml'],text=True)
    result['identity']={
        'name':re.search(r'A: package="([^"]+)"',manifest).group(1),
        'versionCode':str(int(re.search(r'android:versionCode.*?\(type 0x10\)(0x[0-9a-f]+)',manifest).group(1),16)),
        'versionName':re.search(r'android:versionName[^=]*="([^"]+)"',manifest).group(1)
    }
    assert "android.permission.INTERNET" not in manifest, 'Unexpected INTERNET permission'
    if a.expected_package: assert result['identity']['name']==a.expected_package
    assert result['identity']['versionCode']=='14'
print(json.dumps(result,ensure_ascii=False,indent=2))
