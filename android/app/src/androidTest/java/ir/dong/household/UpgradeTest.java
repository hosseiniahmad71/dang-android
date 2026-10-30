package ir.dong.household;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONArray;
import org.json.JSONObject;
import static org.junit.Assert.*;

/** Isolated synthetic data for in-place upgrade validation only. Never ship seeded finance records. */
@RunWith(AndroidJUnit4.class)
public class UpgradeTest {
 @Test public void seedOriginal() throws Exception {
  DongDatabase db=new DongDatabase(InstrumentationRegistry.getInstrumentation().getTargetContext());
  JSONObject current=db.get();
  assertNotNull("Baseline app must initialize financial SQLite first",current);
  JSONObject store=current.getJSONObject("store");
  assertEquals(3,store.getInt("version"));
  store.put("openingBalance",1000000);
  JSONArray events=store.getJSONArray("events");
  assertEquals(0,events.length());
  events.put(new JSONObject().put("id","upgrade-purchase").put("kind","purchase")
   .put("date","2026-10-30").put("amount",10001).put("accountId","fund")
   .put("paidById","").put("category","میوه").put("creditPeriod","1405/08")
   .put("description","synthetic upgrade check"));
  JSONArray installments=new JSONArray();
  installments.put(new JSONObject().put("id","upgrade-i1").put("dueDate","2026-10-30").put("amount",40000));
  store.getJSONArray("plans").put(new JSONObject().put("id","upgrade-plan")
   .put("title","Synthetic family purchase").put("provider","سایر")
   .put("creditOwnerId","ahmad").put("category","میوه").put("createdDate","2026-10-29")
   .put("total",40000).put("installments",installments));
  events.put(new JSONObject().put("id","upgrade-pay").put("kind","payment")
   .put("date","2026-10-30").put("amount",5000).put("installmentId","upgrade-i1")
   .put("accountId","fund").put("paidById","").put("fundedBy","fund")
   .put("creditPeriod","1405/08").put("description","synthetic partial installment"));
  db.commit(store,current.getInt("revision"),false,"upgrade-seed","synthetic regression");
  JSONArray participants=new JSONArray().put(new JSONObject().put("id","traveler1").put("name","همسفر تست"));
  JSONArray expenses=new JSONArray().put(new JSONObject().put("id","trip-exp1")
   .put("date","2026-10-30").put("amount",101).put("category","بنزین")
   .put("paidBy","traveler1").put("forMembers",new JSONArray().put("traveler1"))
   .put("note","synthetic upgrade"));
  JSONObject trip=new JSONObject().put("id","upgrade-trip").put("name","سفر آزمون ارتقا")
   .put("kind","family").put("date","2026-10-30")
   .put("participants",participants).put("expenses",expenses)
   .put("settlements",new JSONArray());
  db.saveTravel(new JSONObject().put("version",1).put("trips",new JSONArray().put(trip)),0);
  assertEquals(2,db.get().getJSONObject("store").getJSONArray("events").length());
  assertEquals(1,db.getTravel().getJSONObject("travel").getJSONArray("trips").length());
 }
 @Test public void verifyAfterUpdate() throws Exception {
  DongDatabase db=new DongDatabase(InstrumentationRegistry.getInstrumentation().getTargetContext());
  JSONObject current=db.get();
  assertNotNull(current);
  assertEquals(1,current.getInt("revision"));
  JSONObject store=current.getJSONObject("store");
  assertEquals(1000000,store.getInt("openingBalance"));
  assertEquals(2,store.getJSONArray("events").length());
  assertEquals("upgrade-purchase",store.getJSONArray("events").getJSONObject(0).getString("id"));
  assertEquals("upgrade-pay",store.getJSONArray("events").getJSONObject(1).getString("id"));
  assertEquals(1,store.getJSONArray("plans").length());
  assertEquals("upgrade-plan",store.getJSONArray("plans").getJSONObject(0).getString("id"));
  JSONObject travel=db.getTravel();
  assertEquals(1,travel.getInt("revision"));
  JSONArray trips=travel.getJSONObject("travel").getJSONArray("trips");
  assertEquals(1,trips.length());
  assertEquals("upgrade-trip",trips.getJSONObject(0).getString("id"));
  assertEquals(101,trips.getJSONObject(0).getJSONArray("expenses").getJSONObject(0).getInt("amount"));
  assertTrue("Travel backup must survive upgrade",db.listTravelBackups().length()>=1);
 }
}
