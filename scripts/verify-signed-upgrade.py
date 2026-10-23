import subprocess,re,hashlib,json
from pathlib import Path
import os
sdk=Path(os.environ['ANDROID_HOME'])/'build-tools/35.0.0';root=Path('tests/upgrade-apks');expected='2b468a624312d5db6028984714f8c9663f6873c87c9a950c5fe0fc6787416108';result=[]
for name,code,package in [('original-7.3.0.apk',13,'ir.dang.household'),('update-7.3.1.apk',14,'ir.dang.household'),('upgrade-test.apk',None,'ir.dang.household.test')]:
 p=root/name;s=subprocess.check_output([str(sdk/'apksigner'),'verify','--print-certs',str(p)],text=True);assert 'certificate SHA-256 digest: '+expected in s
 info=subprocess.check_output([str(sdk/'aapt'),'dump','badging',str(p)],text=True);assert "package: name='"+package+"'" in info
 if code is not None:assert "versionCode='"+str(code)+"'" in info
 result.append({'file':name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'certificate':expected})
print(json.dumps(result,indent=2))
