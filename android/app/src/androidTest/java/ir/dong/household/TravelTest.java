package ir.dong.household;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Actual Android SQLite separation/rollback/snapshot proof: travel may not alter household ledger. */
@RunWith(AndroidJUnit4.class)
public class TravelTest {
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
