package ir.dong.household;

import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.graphics.Bitmap;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.io.File;
import java.io.FileOutputStream;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class StartupTest {
 @Rule public ActivityScenarioRule<MainActivity> scenario = new ActivityScenarioRule<>(MainActivity.class);
 private WebView find(View v){
  if(v instanceof WebView)return (WebView)v;
  if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){WebView w=find(((ViewGroup)v).getChildAt(i));if(w!=null)return w;}
  return null;
 }
 private String js(String code) throws Exception {
  CountDownLatch latch=new CountDownLatch(1); AtomicReference<String> result=new AtomicReference<>();
  scenario.getScenario().onActivity(a->{WebView w=find(a.getWindow().getDecorView());assertNotNull(w);
   w.evaluateJavascript("(function(){try{return JSON.stringify((function(){"+code+"})())}catch(e){return JSON.stringify({error:String(e)})}})()",v->{result.set(v);latch.countDown();});});
  assertTrue("WebView callback timed out",latch.await(10,TimeUnit.SECONDS));
  return new org.json.JSONArray("["+result.get()+"]").getString(0);
 }
 private void until(String expression) throws Exception {
  for(int i=0;i<400;i++){if(js("return Boolean("+expression+")").equals("true"))return;Thread.sleep(150);}
  fail("Timed out: "+expression+" diagnostics="+js("return document.body.innerText"));
 }
 private void tap(String selector,String text) throws Exception {
  assertEquals("true",js("var b=Array.from(document.querySelectorAll("+JSONObject.quote(selector)+")).find(x=>x.textContent.trim()==="+JSONObject.quote(text)+");if(!b)throw Error('Missing button');b.click();return true"));Thread.sleep(250);
 }
 private void input(String label,String value) throws Exception {
  js("var c=Array.from(document.querySelectorAll('.control')).find(x=>x.querySelector('label')?.textContent.includes("+JSONObject.quote(label)+"));var n=c.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,"+JSONObject.quote(value)+");n.dispatchEvent(new Event('input',{bubbles:true}));return true");Thread.sleep(250);
 }
 private int eventCount() throws Exception {return Integer.parseInt(js("return JSON.parse(DongNative.invoke(JSON.stringify({op:'get'}))).value.store.events.length"));}
 private void writeEvidence(String name,byte[] bytes) throws Exception {
  if(!name.matches("[a-zA-Z0-9._-]+"))throw new IllegalArgumentException("Invalid evidence name");
  try(android.os.ParcelFileDescriptor mkdir=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("mkdir -p /sdcard/Download/dong-v1")){
   new android.os.ParcelFileDescriptor.AutoCloseInputStream(mkdir).readAllBytes();
  }
  android.os.ParcelFileDescriptor[] pipes=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommandRw("dd of=/sdcard/Download/dong-v1/"+name);
  try(android.os.ParcelFileDescriptor.AutoCloseOutputStream out=new android.os.ParcelFileDescriptor.AutoCloseOutputStream(pipes[1])){out.write(bytes);}
  try(android.os.ParcelFileDescriptor.AutoCloseInputStream in=new android.os.ParcelFileDescriptor.AutoCloseInputStream(pipes[0])){in.readAllBytes();}
  try(android.os.ParcelFileDescriptor check=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("stat -c %s /sdcard/Download/dong-v1/"+name)){
   String size=new String(new android.os.ParcelFileDescriptor.AutoCloseInputStream(check).readAllBytes(),java.nio.charset.StandardCharsets.UTF_8).trim();
   assertEquals("Evidence bytes must survive test APK uninstall",bytes.length,Long.parseLong(size));
  }
 }
 private void screenshot(String name) throws Exception {
  // DOM assertions can pass before Android has presented the matching WebView frame.
  CountDownLatch painted=new CountDownLatch(1);
  scenario.getScenario().onActivity(a->{WebView w=find(a.getWindow().getDecorView());
   w.postVisualStateCallback(1,new WebView.VisualStateCallback(){@Override public void onComplete(long id){
    w.invalidate();w.postOnAnimation(()->w.postOnAnimation(painted::countDown));
   }});
  });
  assertTrue("WebView visual frame was not presented",painted.await(10,TimeUnit.SECONDS));
  // SurfaceFlinger on a software-rendered emulator can trail the DOM/visual callback.
  Thread.sleep(500);
  if(name.equals("05-error-recovery"))assertEquals("true",js("var p=document.getElementById('startup-panel');return !p.hidden&&getComputedStyle(p).display!=='none'&&!!document.elementFromPoint(40,40)?.closest('#startup-panel')"));
  writeEvidence(name+".state.json",js("var p=document.getElementById('startup-panel');return {title:document.querySelector('h1')?.textContent,panelHidden:p.hidden,panelDisplay:getComputedStyle(p).display,topElement:document.elementFromPoint(40,40)?.outerHTML,scrollY:window.scrollY}").getBytes(java.nio.charset.StandardCharsets.UTF_8));
  Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
  assertNotNull("Android screenshot unavailable",image);
  java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();image.compress(Bitmap.CompressFormat.PNG,100,bytes);
  if(name.equals("01-dashboard")){
   // Verify actual native window state; OS overlays can make screenshot pixel (4,4) misleading.
   AtomicReference<Boolean> statusBarReady=new AtomicReference<>(false);
   scenario.getScenario().onActivity(a->{
    int flags=a.getWindow().getDecorView().getSystemUiVisibility();
    int color=a.getWindow().getStatusBarColor();
    // Android 15 edge-to-edge may report a transparent status bar even for a white window.
    statusBarReady.set((color==android.graphics.Color.WHITE || color==android.graphics.Color.TRANSPARENT) &&
      (flags & android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR)!=0 &&
      (flags & android.view.View.SYSTEM_UI_FLAG_FULLSCREEN)==0);
   });
   assertTrue("Native status bar must be white with dark icons",statusBarReady.get());
   assertEquals("true",js("return Array.from(document.querySelectorAll('.metric strong')).every(x=>x.getBoundingClientRect().height<=parseFloat(getComputedStyle(x).lineHeight)+1&&x.scrollWidth<=x.clientWidth+1)"));
  }
  writeEvidence(name+".png",bytes.toByteArray());
 }
 private boolean accept(android.view.accessibility.AccessibilityNodeInfo node){
  if(node==null)return false;
  if("تأیید".contentEquals(node.getText()==null?"":node.getText()))return node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK);
  for(int i=0;i<node.getChildCount();i++)if(accept(node.getChild(i)))return true;
  return false;
 }
 private void touchSearchInput()throws Exception{
  JSONObject p=new JSONObject(js("var r=document.querySelector('.search-dialog input').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}"));
  AtomicReference<float[]> coords=new AtomicReference<>();
  scenario.getScenario().onActivity(a->{WebView w=find(a.getWindow().getDecorView());int[] loc=new int[2];w.getLocationOnScreen(loc);coords.set(new float[]{loc[0]+(float)p.optDouble("x")*w.getScale(),loc[1]+(float)p.optDouble("y")*w.getScale()});});
  long now=android.os.SystemClock.uptimeMillis();float[] xy=coords.get();
  for(int action:new int[]{android.view.MotionEvent.ACTION_DOWN,android.view.MotionEvent.ACTION_UP}){android.view.MotionEvent event=android.view.MotionEvent.obtain(now,now+30,action,xy[0],xy[1],0);InstrumentationRegistry.getInstrumentation().getUiAutomation().injectInputEvent(event,true);event.recycle();}
  boolean visible=false;
  for(int i=0;i<100&&!visible;i++){AtomicReference<Boolean> v=new AtomicReference<>(false);scenario.getScenario().onActivity(a->v.set(a.getWindow().getDecorView().getRootWindowInsets().isVisible(android.view.WindowInsets.Type.ime())));visible=v.get();if(!visible)Thread.sleep(100);}
  assertTrue("Keyboard must really open during selector regression test",visible);
 }
 @Test public void offlineDashboardFinanceAndReopen() throws Exception {
  until("document.querySelector('.app-shell') && document.getElementById('startup-panel').hidden");
  assertEquals("true",js("return window.innerWidth<=600 && document.documentElement.scrollWidth<=window.innerWidth+1 && getComputedStyle(document.querySelector('.sidebar')).display==='none'"));
  until("document.fonts.status==='loaded'");
  assertEquals("true",js("return document.fonts.check('500 14px Vazirmatn') && Array.from(document.fonts).some(f=>f.family==='Vazirmatn'&&f.status==='loaded')"));
  assertEquals("true",js("var i=document.querySelector('.topbar-logo');return i.complete&&i.naturalWidth>0&&getComputedStyle(document.documentElement).getPropertyValue('--navy').trim()==='#062c5b'"));
  assertEquals(0,eventCount());
  assertEquals("true",js("return JSON.parse(DongNative.invoke(JSON.stringify({op:'get'}))).value.store.startPeriod==='1405/07'"));
  // Synthetic-only fixture: zero Ahmad's obligations before the current month.
  // Arrears rejection remains covered by finance-v71; no user installation is touched.
  js("var r=JSON.parse(DongNative.invoke(JSON.stringify({op:'get'}))).value,s=r.store;var parts=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',timeZone:'Asia/Tehran'}).formatToParts(new Date());var y=Number(parts.find(x=>x.type==='year').value),m=Number(parts.find(x=>x.type==='month').value);for(var k=1405*12+6;k<y*12+m-1;k++){var p=Math.floor(k/12)+'/'+String(k%12+1).padStart(2,'0');s.contributionOverrides[p+'|ahmad']=0}var out=JSON.parse(DongNative.invoke(JSON.stringify({op:'commit',store:s,expectedRevision:r.revision})));if(!out.ok)throw Error(out.error);return true");
  scenario.getScenario().recreate();
  until("document.querySelector('.app-shell') && document.getElementById('startup-panel').hidden");
  screenshot("01-dashboard");
  js("window.selectorWidth=innerWidth;document.querySelector('.period-top .select-trigger').click();return true");
  until("document.querySelector('.search-dialog[open]')");
  assertEquals("false",js("return document.activeElement.tagName==='INPUT'"));
  assertEquals("true",js("var r=document.querySelector('.search-dialog').getBoundingClientRect();return innerWidth===window.selectorWidth&&document.documentElement.scrollWidth<=innerWidth+1&&r.left>=0&&r.right<=innerWidth"));
  screenshot("06-period-selector");touchSearchInput();Thread.sleep(500);
  assertEquals("true",js("var r=document.querySelector('.search-dialog').getBoundingClientRect(),v=visualViewport;return innerWidth===window.selectorWidth&&document.documentElement.scrollWidth<=innerWidth+1&&Math.abs(v.scale-1)<.05&&r.top>=v.offsetTop-1&&r.bottom<=v.offsetTop+v.height+2"));
  screenshot("07-period-keyboard");
  try(android.os.ParcelFileDescriptor close=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("input keyevent 4")){new android.os.ParcelFileDescriptor.AutoCloseInputStream(close).readAllBytes();}
  js("document.querySelector('.search-dialog-heading button').click();return true");until("!document.querySelector('.search-dialog[open]')");
  assertEquals("true",js("var b=document.querySelector('.mobile-nav button.active');return getComputedStyle(b,'::before').display==='none'"));
  tap(".mobile-nav button","ثبت عملیات");tap(".operation-tabs button b","تسویه و اصلاح");
  js("document.querySelector('.settlement-help-button').click();return true");
  assertEquals("true",js("var b=document.querySelector('.settlement-help-button'),r=b.getBoundingClientRect();return Math.abs(r.width-r.height)<1&&getComputedStyle(b.querySelector('svg')).opacity==='1'&&!!document.querySelector('.settlement-explanation')"));screenshot("08-settlement-help");
  tap(".mobile-nav button","ثبت عملیات");tap(".operation-tabs button b","واریز دنگ");
  until("document.querySelector('.deposit-member-list')");
  js("document.querySelector('form button[type=submit]').click();return true");
  until("document.querySelector('.db-status').textContent.includes('ذخیره شد')");assertEquals(1,eventCount());
  tap(".operation-tabs button b","خرید");input("مبلغ خرید","100000");
  assertEquals("false",js("return document.querySelector('form').innerText.includes('عضو پرداخت‌کننده واقعی')"));
  js("document.querySelector('form button[type=submit]').click();return true");
  until("document.querySelector('.db-status').textContent.includes('ذخیره شد')");assertEquals(2,eventCount());
  tap(".operation-tabs button b","خرید اقساطی");input("عنوان کالا","خرید آزمایشی");input("مبلغ کل قرارداد","1000000");
  until("document.querySelectorAll('.schedule-row').length>0 || document.querySelector('form').innerText.includes('۲۵۰')");
  js("document.querySelector('form button[type=submit]').click();return true");
  until("JSON.parse(DongNative.invoke(JSON.stringify({op:'get'}))).value.store.plans.length===1");
  tap(".operation-tabs button b","پرداخت قسط");
  js("document.querySelector('form .select-trigger').click();return true");
  until("document.querySelector('[role=option]')");
  js("document.querySelector('[role=option]').click();return true");Thread.sleep(250);
  // Payer selection is mandatory. An unselected source must not write a payment event.
  js("document.querySelector('form button[type=submit]').click();return true");
  assertEquals(2,eventCount());
  assertEquals("true",js("return document.querySelector('form').innerText.includes('پرداخت‌کننده واقعی را انتخاب کنید')"));
  js("var c=Array.from(document.querySelectorAll('form .control')).find(x=>x.querySelector('label')?.textContent.includes('چه کسی واقعاً پرداخت کرد؟'));if(!c)throw Error('Missing payer selector');c.querySelector('.select-trigger').click();return true");
  until("document.querySelector('.search-dialog[open] [role=option]')");
  // The fixture puts household money in a custodial card, not the main cash box.
  js("var o=Array.from(document.querySelectorAll('.search-dialog[open] [role=option]')).find(x=>x.textContent.includes('وجه امانی'));if(!o)throw Error('Missing funded custody source');o.click();return true");
  js("document.querySelector('form button[type=submit]').click();return true");
  until("JSON.parse(DongNative.invoke(JSON.stringify({op:'get'}))).value.store.events.length===3");
  tap(".mobile-nav button","اقساط");screenshot("02-installments");
  tap(".mobile-nav button","تاریخچه");assertEquals("3",js("return document.querySelectorAll('.record').length"));
  scenario.getScenario().onActivity(a->find(a.getWindow().getDecorView()).evaluateJavascript("document.querySelector('.record-kind-purchase button').click()",null));
  boolean accepted=false;
  for(int i=0;i<100&&!accepted;i++){accepted=accept(InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow());if(!accepted)Thread.sleep(100);}
  assertTrue("Native Persian cancellation confirmation missing",accepted);
  until("document.querySelector('.cancelled-stamp')");
  assertEquals("3",js("return document.querySelectorAll('.record').length"));assertEquals(4,eventCount());
  js("document.querySelector('.cancelled-stamp').scrollIntoView({block:'center'});return true");screenshot("03-history");
  tap(".mobile-nav button","تنظیمات");assertEquals("0",js("return document.querySelectorAll('.settings-accordion[open]').length"));screenshot("04-settings");
  scenario.getScenario().recreate();
  until("document.querySelector('.app-shell') && document.getElementById('startup-panel').hidden");assertEquals(4,eventCount());

  String migrationScript;
  try(java.io.InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("migration-test.js")){
   migrationScript=new String(in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
  }
  final String injected=migrationScript;
  scenario.getScenario().onActivity(a->find(a.getWindow().getDecorView()).evaluateJavascript(injected,null));
  js("window.dangMigrationTest().then(x=>window.migrationResult=x).catch(e=>window.migrationFailure=String(e));return true");
  until("window.migrationResult || window.migrationFailure");
  assertEquals("true",js("return typeof window.migrationFailure==='undefined'"));
  assertEquals("4",js("return window.migrationResult.events"));
  assertEquals("1",js("return window.migrationResult.plans"));
  assertEquals("9750000",js("return window.migrationResult.totalCash"));
  assertEquals("1500",js("return window.migrationResult.nativeStress.reduce((sum,x)=>sum+x.events,0)"));
  assertEquals("true",js("return window.migrationResult.nativeStress.every(x=>x.events===500&&x.totalCash===1225000)"));
  writeEvidence("migration-summary.json",js("return window.migrationResult").getBytes(java.nio.charset.StandardCharsets.UTF_8));
  // The mirrored SQLite ledger retains the reversal as a fourth row.
  try(DongDatabase db=new DongDatabase(InstrumentationRegistry.getInstrumentation().getTargetContext());android.database.Cursor cursor=db.getReadableDatabase().rawQuery("SELECT count(*) FROM ledger_events",null)){
   assertTrue(cursor.moveToFirst());assertEquals(4,cursor.getInt(0));
  }
  // Verify the module-independent guard can report a fatal runtime error and retry safely.
  js("window.dongStartup.fail(new Error('instrumented startup failure'));return true");
  until("!document.getElementById('startup-panel').hidden && !document.getElementById('startup-actions').hidden");screenshot("05-error-recovery");
  js("window.retryMarker=true;document.getElementById('startup-retry').click();return true");
  until("!window.retryMarker && document.querySelector('.app-shell') && document.getElementById('startup-panel').hidden");assertEquals(4,eventCount());
 }
}
