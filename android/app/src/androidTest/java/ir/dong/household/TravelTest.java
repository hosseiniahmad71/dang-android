package ir.dong.household;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import android.webkit.WebView;
import android.view.View;
import android.view.ViewGroup;
import org.junit.Rule;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Actual Android SQLite separation/rollback/snapshot proof: travel may not alter household ledger. */
@RunWith(AndroidJUnit4.class)
public class TravelTest {
 @Rule public ActivityScenarioRule<MainActivity> scenario = new ActivityScenarioRule<>(MainActivity.class);
 private WebView find(View v){
  if(v instanceof WebView)return (WebView)v;
  if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){
   WebView w=find(((ViewGroup)v).getChildAt(i));if(w!=null)return w;
  }
  return null;
 }
 private boolean evaluate(String expression) throws Exception {
  CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> response=new AtomicReference<>("");
  scenario.getScenario().onActivity(a->{
   WebView w=find(a.getWindow().getDecorView());assertNotNull(w);
   w.evaluateJavascript("(function(){try{return Boolean("+expression+")}catch(e){return false}})()",x->{response.set(x);latch.countDown();});
  });
  assertTrue("Travel WebView callback timed out",latch.await(10,TimeUnit.SECONDS));
  return "true".equals(response.get());
 }
 @Test public void travelDashboardSwitchDoesNotWhiteScreen() throws Exception {
  boolean ready=false;
  for(int i=0;i<160;i++){if(evaluate("document.querySelector('.travel-entry-banner button')")){ready=true;break;}Thread.sleep(150);}
  assertTrue("Home dashboard never loaded",ready);
  assertTrue("Travel entry click failed",evaluate("(document.querySelector('.travel-entry-banner button').click(),true)"));
  boolean opened=false;
  for(int i=0;i<80;i++){if(evaluate("!!document.querySelector('.travel-page .travel-tabs')")){opened=true;break;}Thread.sleep(150);}
  assertTrue("Separate travel UI did not render",opened);
  assertTrue("New companion editor missing",evaluate("(document.querySelector('.travel-new-shortcut')?.click(),true)"));
  boolean editor=false;
  for(int i=0;i<50;i++){if(evaluate("!!document.querySelector('.travel-member-input-row input')")){editor=true;break;}Thread.sleep(100);}
  assertTrue("Professional member input did not render",editor);
  assertTrue("Comma-separated textarea still present",evaluate("!document.querySelector('.travel-page textarea')"));

  assertTrue("Return home button missing",evaluate("!!document.querySelector('.travel-shell .topbar-actions button')"));
  assertTrue("Return click failed",evaluate("(document.querySelector('.travel-shell .topbar-actions button').click(),true)"));
  boolean home=false;
  for(int i=0;i<80;i++){if(evaluate("!!document.querySelector('.travel-entry-banner')")){home=true;break;}Thread.sleep(150);}
  assertTrue("House dashboard not restored",home);
 }
 @Test public void separateTravelRowsPersistWithoutMutatingHousehold() throws Exception {
  DongDatabase db=new DongDatabase(InstrumentationRegistry.getInstrumentation().getTargetContext());
  try {
   JSONObject house=db.get();
   String householdBefore=house==null?null:house.getJSONObject("store").toString();
   int householdRevision=house==null?-1:house.getInt("revision");
   JSONObject old=db.getTravel();
   int revision=old.getInt("revision");
   JSONObject travel=new JSONObject().put("version",1).put("trips",new JSONArray()
      .put(new JSONObject().put("id","journey-native-test").put("name","سفر آزمایشی")
       .put("kind","family").put("date","2026-10-23")
       .put("participants",new JSONArray()
        .put(new JSONObject().put("id","test-a").put("name","احمد"))
        .put(new JSONObject().put("id","test-b").put("name","مریم")))
       .put("expenses",new JSONArray()
        .put(new JSONObject().put("id","expense-native-test").put("date","2026-10-23")
         .put("amount",175001).put("category","اقامتگاه").put("paidBy","test-a")
         .put("forMembers",new JSONArray().put("test-a").put("test-b")).put("note","آزمایشی")))
       .put("settlements",new JSONArray())));
   JSONObject saved=db.saveTravel(travel,revision);
   assertEquals(revision+1,saved.getInt("revision"));
   assertEquals(175001,db.getTravel().getJSONObject("travel").getJSONArray("trips")
    .getJSONObject(0).getJSONArray("expenses").getJSONObject(0).getInt("amount"));
   assertEquals(revision+1,db.listTravelBackups().getJSONObject(0).getInt("revision"));
   assertEquals("سفر آزمایشی",db.readTravelBackup(revision+1)
    .getJSONArray("trips").getJSONObject(0).getString("name"));
   try {db.saveTravel(travel,revision);fail("Stale travel revision was accepted");}
   catch(IllegalStateException expected){assertTrue(expected.getMessage().contains("تغییر"));}
   JSONObject after=db.get();
   assertEquals(householdRevision,after==null?-1:after.getInt("revision"));
   assertEquals(householdBefore,after==null?null:after.getJSONObject("store").toString());
  } finally {db.close();}
 }
}
