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
  for(int i=0;i<200;i++){if(js("return Boolean("+expression+")").equals("true"))return;Thread.sleep(150);}
  fail("Timed out: "+expression+" diagnostics="+js("return document.body.innerText"));
 }
 private void tap(String selector,String text) throws Exception {
  assertEquals("true",js("var b=Array.from(document.querySelectorAll("+JSONObject.quote(selector)+")).find(x=>x.textContent.trim()==="+JSONObject.quote(text)+");if(!b)throw Error('Missing button');b.click();return true"));Thread.sleep(250);
 }
 private void input(String label,String value) throws Exception {
  js("var c=Array.from(document.querySelectorAll('.control')).find(x=>x.querySelector('label')?.textContent.includes("+JSONObject.quote(label)+"));var n=c.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,"+JSONObject.quote(value)+");n.dispatchEvent(new Event('input',{bubbles:true}));return true");Thread.sleep(250);
 }
 private int eventCount() throws Exception {return Integer.parseInt(js("return JSON.parse(DangNative.invoke(JSON.stringify({op:'get'}))).value.store.events.length"));}
 private void screenshot(String name) throws Exception {
  Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
  File dir=InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null);
  try(FileOutputStream out=new FileOutputStream(new File(dir,name+".png"))){image.compress(Bitmap.CompressFormat.PNG,100,out);}
 }
 @Test public void offlineDashboardFinanceAndReopen() throws Exception {
  until("document.querySelector('.app-shell') && document.getElementById('startup-panel').hidden");
  assertEquals(0,eventCount()); screenshot("01-dashboard");
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
  tap(".mobile-nav button","اقساط");screenshot("02-installments");
  tap(".mobile-nav button","تاریخچه");assertEquals("2",js("return document.querySelectorAll('.record').length"));screenshot("03-history");
  tap(".mobile-nav button","تنظیمات");assertEquals("0",js("return document.querySelectorAll('.settings-accordion[open]').length"));screenshot("04-settings");
  scenario.getScenario().recreate();
  until("document.querySelector('.app-shell') && document.getElementById('startup-panel').hidden");assertEquals(2,eventCount());
  assertEquals("9900000",js("var s=JSON.parse(DangNative.invoke(JSON.stringify({op:'get'}))).value.store;return s.events[0].amount-s.events[1].amount"));
  // Verify the module-independent guard can report a fatal runtime error and retry safely.
  js("window.dangStartup.fail(new Error('instrumented startup failure'));return true");
  until("!document.getElementById('startup-panel').hidden && !document.getElementById('startup-actions').hidden");screenshot("05-error-recovery");
  js("document.getElementById('startup-retry').click();return true");
  until("document.querySelector('.app-shell') && document.getElementById('startup-panel').hidden");assertEquals(2,eventCount());
 }
}
