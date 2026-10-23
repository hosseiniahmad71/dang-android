package ir.dang.household;

import android.content.Context;
import android.database.Cursor;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.File;
import java.nio.file.Files;
import java.security.MessageDigest;
import static org.junit.Assert.*;

/** Signed, non-destructive upgrade regression test; version expectations passed by instrumentation args. */
@RunWith(AndroidJUnit4.class)
public class UpgradeTest {
 private Context ctx(){return InstrumentationRegistry.getInstrumentation().getTargetContext();}
 private void write(String name,JSONObject value)throws Exception{
  android.os.ParcelFileDescriptor[] pipes=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommandRw("dd of=/sdcard/Download/"+name);
  try(android.os.ParcelFileDescriptor.AutoCloseOutputStream o=new android.os.ParcelFileDescriptor.AutoCloseOutputStream(pipes[1])){o.write(value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
  try(android.os.ParcelFileDescriptor.AutoCloseInputStream i=new android.os.ParcelFileDescriptor.AutoCloseInputStream(pipes[0])){i.readAllBytes();}
 }
 private JSONObject snapshot(DangDatabase db)throws Exception{
  JSONObject state=db.get(),counts=new JSONObject(),files=new JSONObject();assertNotNull(state);
  for(String table:new String[]{"ledger_events","installment_contracts","mutations","audit_actions","backup_manifest"}){
   try(Cursor c=db.getReadableDatabase().rawQuery("SELECT count(*) FROM "+table,null)){assertTrue(c.moveToFirst());counts.put(table,c.getInt(0));}
  }
  File[] backups=new File(ctx().getFilesDir(),"backups").listFiles();assertNotNull(backups);assertTrue(backups.length>0);
  for(File f:backups){byte[] hash=MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(f.toPath()));StringBuilder h=new StringBuilder();for(byte b:hash)h.append(String.format("%02x",b&255));files.put(f.getName(),h.toString());}
  return new JSONObject().put("state",state).put("tables",counts).put("backupFiles",files);
 }
 @Test public void seedOriginal()throws Exception{
  assertEquals(Long.parseLong(InstrumentationRegistry.getArguments().getString("baseVersion","14")),ctx().getPackageManager().getPackageInfo(ctx().getPackageName(),0).getLongVersionCode());
  JSONObject fixture;
  try(java.io.InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("upgrade-store.json")){fixture=new JSONObject(new String(in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8));}
  try(DangDatabase db=new DangDatabase(ctx())){
   assertNull("Upgrade fixture must use a fresh emulator install",db.get());
   JSONObject initialized=db.init(fixture);db.commit(fixture,initialized.getInt("revision"),false,"upgrade-fixture","Synthetic data only");
   JSONObject snapshot=snapshot(db);assertEquals(2,snapshot.getJSONObject("tables").getInt("ledger_events"));assertEquals(1,snapshot.getJSONObject("tables").getInt("installment_contracts"));write("dang-upgrade-before.json",snapshot);
  }
 }
 @Test public void verifyAfterUpdate()throws Exception{
  assertEquals(Long.parseLong(InstrumentationRegistry.getArguments().getString("updateVersion","15")),ctx().getPackageManager().getPackageInfo(ctx().getPackageName(),0).getLongVersionCode());
  try(DangDatabase db=new DangDatabase(ctx())){
   JSONObject s=db.get();assertNotNull("Existing SQLite state must survive install -r",s);JSONObject store=s.getJSONObject("store");
   assertEquals(2,store.getJSONArray("events").length());assertEquals(1,store.getJSONArray("plans").length());assertEquals("1405/07",store.getJSONArray("closedPeriods").getString(0));assertEquals(12000000,store.getJSONObject("contributionOverrides").getInt("1405/08|ahmad"));
   write("dang-upgrade-after.json",snapshot(db));
  }
  try(ActivityScenario<MainActivity> activity=ActivityScenario.launch(MainActivity.class)){Thread.sleep(1500);}
  try(DangDatabase db=new DangDatabase(ctx())){write("dang-upgrade-after-reopen.json",snapshot(db));}
 }
}
