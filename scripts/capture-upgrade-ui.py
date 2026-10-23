"""Inspect synthetic emulator UI through accessibility; no financial mutations."""
import subprocess,time,xml.etree.ElementTree as E,re,json
from pathlib import Path
root=Path('upgrade-evidence');root.mkdir(exist_ok=True)
def adb(*args):return subprocess.check_output(['adb',*args])
def state(name):
 adb('shell','uiautomator','dump','/sdcard/dang-window.xml')
 data=adb('exec-out','cat','/sdcard/dang-window.xml');(root/(name+'.xml')).write_bytes(data);return E.fromstring(data)
def rect(n):return list(map(int,re.findall(r'\d+',n.attrib.get('bounds',''))))
def click_node(n):
 x,y,xx,yy=rect(n);adb('shell','input','tap',str((x+xx)//2),str((y+yy)//2))
def click_text(text,name):
 for i in range(4):
  tree=state(name+str(i));nodes=[n for n in tree.iter('node') if n.attrib.get('clickable')=='true' and text in (n.attrib.get('text','')+' '+n.attrib.get('content-desc','')) and len(rect(n))==4]
  if nodes:click_node(min(nodes,key=lambda n:(rect(n)[2]-rect(n)[0])*(rect(n)[3]-rect(n)[1])));return
  w,h=map(int,re.findall(r'\d+',adb('shell','wm','size').decode())[-2:]);adb('shell','input','swipe',str(w//2),str(h*3//4),str(w//2),str(h//3),'350')
 raise RuntimeError('Accessibility control missing: '+text)
def shot(name):
 state(name);(root/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'))
try:
 adb('shell','am','start','-n','ir.dang.household/.MainActivity');time.sleep(2);shot('01-updated-dashboard')
 click_text('آبان','period');shot('02-period-dialog')
 tree=state('search');edit=next(n for n in tree.iter('node') if n.attrib.get('class')=='android.widget.EditText');click_node(edit);shot('03-period-keyboard')
 adb('shell','input','keyevent','4');click_text('بستن فهرست','close');click_text('ثبت عملیات','operations');click_text('تسویه و اصلاح','settlement');click_text('راهنما و مثال انتقال اعتبار','help');shot('04-settlement-help')
 (root/'capture-status.json').write_text(json.dumps({'status':'complete'}));print('Synthetic signed-release screenshots captured.')
except Exception as e:
 (root/'capture-status.json').write_text(json.dumps({'status':'incomplete','error':str(e)},ensure_ascii=False));raise
