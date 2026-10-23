package ir.dang.household;

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
 private int eventCount() throws Exception {return Integer.parseInt(js("return JSON.parse(DangNative.invoke(JSON.stringify({op:'get'}))).value.store.events.length"));}
 private void writeEvidence(String name,byte[] bytes) throws Exception {
  if(!name.matches("[a-zA-Z0-9._-]+"))throw new IllegalArgumentException("Invalid evidence name");
  try(android.os.ParcelFileDescriptor mkdir=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("mkdir -p /sdcard/Download/dang73")){
   new android.os.ParcelFileDescriptor.AutoCloseInputStream(mkdir).readAllBytes();
  }
  android.os.ParcelFileDescriptor[] pipes=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommandRw("dd of=/sdcard/Download/dang73/"+name);
  try(android.os.ParcelFileDescriptor.AutoCloseOutputStream out=new android.os.ParcelFileDescriptor.AutoCloseOutputStream(pipes[1])){out.write(bytes);}
  try(android.os.ParcelFileDescriptor.AutoCloseInputStream in=new android.os.ParcelFileDescriptor.AutoCloseInputStream(pipes[0])){in.readAllBytes();}
  try(android.os.ParcelFileDescriptor check=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("stat -c %s /sdcard/Download/dang73/"+name)){
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
  Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
  assertNotNull("Android screenshot unavailable",image);
  java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();image.compress(Bitmap.CompressFormat.PNG,100,bytes);
  writeEvidence(name+".png",bytes.toByteArray());
 }
 private boolean accept(android.view.accessibility.AccessibilityNodeInfo node){
  if(node==null)return false;
  if("تأیید".contentEquals(node.getText()==null?"":node.getText()))return node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK);
  for(int i=0;i<node.getChildCount();i++)if(accept(node.getChild(i)))return true;
  return false;
 }
 @Test public void offlineDashboardFinanceAndReopen() throws Exception {
  until("document.querySelector('.app-shell') && document.getElementById('startup-panel').hidden");
  assertEquals(0,eventCount());
  assertEquals("true",js("return JSON.parse(DangNative.invoke(JSON.stringify({op:'get'}))).value.store.startPeriod==='1405/07'"));
  // Synthetic-only fixture: zero Ahmad's obligations before the current month.
  // Arrears rejection remains covered by finance-v71; no user installation is touched.
  js("var r=JSON.parse(DangNative.invoke(JSON.stringify({op:'get'}))).value,s=r.store;var parts=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',timeZone:'Asia/Tehran'}).formatToParts(new Date());var y=Number(parts.find(x=>x.type==='year').value),m=Number(parts.find(x=>x.type==='month').value);for(var k=1405*12+6;k<y*12+m-1;k++){var p=Math.floor(k/12)+'/'+String(k%12+1).padStart(2,'0');s.contributionOverrides[p+'|ahmad']=0}var out=JSON.parse(DangNative.invoke(JSON.stringify({op:'commit',store:s,expectedRevision:r.revision})));if(!out.ok)throw Error(out.error);return true");
  scenario.getScenario().recreate();
  until("document.querySelector('.app-shell') && document.getElementById('startup-panel').hidden");
  screenshot("01-dashboard");
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
  until("JSON.parse(DangNative.invoke(JSON.stringify({op:'get'}))).value.store.plans.length===1");
  tap(".operation-tabs button b","پرداخت قسط");
  js("document.querySelector('form .select-trigger').click();return true");
  until("document.querySelector('[role=option]')");
  js("document.querySelector('[role=option]').click();return true");Thread.sleep(250);
  js("document.querySelector('form button[type=submit]').click();return true");
  until("JSON.parse(DangNative.invoke(JSON.stringify({op:'get'}))).value.store.events.length===3");
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
  try(DangDatabase db=new DangDatabase(InstrumentationRegistry.getInstrumentation().getTargetContext());android.database.Cursor cursor=db.getReadableDatabase().rawQuery("SELECT count(*) FROM ledger_events",null)){
   assertTrue(cursor.moveToFirst());assertEquals(4,cursor.getInt(0));
  }
  // Verify the module-independent guard can report a fatal runtime error and retry safely.
  js("window.dangStartup.fail(new Error('instrumented startup failure'));return true");
  until("!document.getElementById('startup-panel').hidden && !document.getElementById('startup-actions').hidden");screenshot("05-error-recovery");
  js("window.retryMarker=true;document.getElementById('startup-retry').click();return true");
  until("!window.retryMarker && document.querySelector('.app-shell') && document.getElementById('startup-panel').hidden");assertEquals(4,eventCount());
 }
}
