package ir.dong.household;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONException;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.UUID;

/** Browser-independent, app-private SQLite store; writes are revision-guarded and transactional. */
public final class DongDatabase extends SQLiteOpenHelper {
    private final File snapshotDir;

    public DongDatabase(Context ctx) {
        super(ctx, "dong.sqlite", null, 1);
        snapshotDir = new File(ctx.getFilesDir(), "backups");
        if (!snapshotDir.exists() && !snapshotDir.mkdirs()) throw new IllegalStateException("Unable to create backup folder");
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL, changed_at TEXT NOT NULL)");
        db.execSQL("CREATE TABLE IF NOT EXISTS audit_actions (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, at TEXT NOT NULL)");
        db.execSQL("CREATE TABLE IF NOT EXISTS backup_manifest (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, reason TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, filename TEXT NOT NULL)");
        db.execSQL("CREATE TABLE IF NOT EXISTS mutations (revision INTEGER PRIMARY KEY, at TEXT NOT NULL, operation TEXT NOT NULL, before_hash TEXT NOT NULL, after_hash TEXT NOT NULL)");
        db.execSQL("CREATE TABLE IF NOT EXISTS ledger_events (id TEXT PRIMARY KEY, kind TEXT NOT NULL, date TEXT NOT NULL, amount_toman INTEGER NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE IF NOT EXISTS installment_contracts (id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_backup_time ON backup_manifest(created_at DESC)");
    }
    @Override public void onUpgrade(SQLiteDatabase db,int oldVersion,int newVersion) {
        throw new IllegalStateException("Unsupported database migration; do not delete financial data");
    }
    private static String now(){return Instant.now().toString();}
    private static String sha(String data) throws Exception {
        byte[] dig=MessageDigest.getInstance("SHA-256").digest(data.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex=new StringBuilder();for(byte b:dig)hex.append(String.format("%02x",b&0xff));return hex.toString();
    }
    private static JSONObject readState(SQLiteDatabase db) throws Exception {
        try(Cursor c=db.rawQuery("SELECT revision,body FROM state WHERE id=1",null)){
            if(!c.moveToFirst())return null;
            return new JSONObject().put("revision",c.getInt(0)).put("store",new JSONObject(c.getString(1)));
        }
    }
    public synchronized JSONObject get() throws Exception {return readState(getReadableDatabase());}
    public synchronized JSONObject init(JSONObject store) throws Exception {
        final SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try{
            JSONObject current=readState(db);
            if(current==null){
                ContentValues cv=new ContentValues();cv.put("id",1);cv.put("revision",0);cv.put("body",store.toString());cv.put("changed_at",now());
                db.insertOrThrow("state",null,cv);
            }
            JSONObject result=readState(db);db.setTransactionSuccessful();return result;
        }finally{db.endTransaction();}
    }
    /** Mirrors the canonical state into append-only event/contract tables where appropriate. */
    private static void mirror(SQLiteDatabase db,JSONObject store,int revision) throws Exception {
        JSONArray events=store.getJSONArray("events");
        for(int i=0;i<events.length();i++){
            JSONObject e=events.getJSONObject(i);
            ContentValues cv=new ContentValues();cv.put("id",e.getString("id"));cv.put("kind",e.getString("kind"));
            cv.put("date",e.getString("date"));cv.put("amount_toman",e.getLong("amount"));cv.put("payload",e.toString());cv.put("revision",revision);
            db.insertWithOnConflict("ledger_events",null,cv,SQLiteDatabase.CONFLICT_REPLACE);
        }
        JSONArray plans=store.getJSONArray("plans");
        for(int i=0;i<plans.length();i++){
            JSONObject p=plans.getJSONObject(i);ContentValues cv=new ContentValues();cv.put("id",p.getString("id"));cv.put("payload",p.toString());cv.put("revision",revision);
            db.insertWithOnConflict("installment_contracts",null,cv,SQLiteDatabase.CONFLICT_REPLACE);
        }
    }
    public synchronized JSONObject commit(JSONObject next,int expectedRevision,boolean restore,String action,String reason) throws Exception {
        // The packaged JS engine validates the complete financial state and immutable history
        // before requesting this transaction. This layer additionally enforces revision CAS.
        final SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        JSONObject result;
        try {
            JSONObject previous=readState(db);
            if(previous==null)throw new IllegalStateException("Database has not been initialized");
            int rev=previous.getInt("revision");
            if(rev!=expectedRevision)throw new IllegalStateException("اطلاعات تغییر کرده است. ابتدا صفحه را تازه کنید.");
            if(next.optInt("version",-1)!=3 || !next.has("events") || !next.has("members") || !next.has("plans"))
                throw new IllegalArgumentException("ساختار اطلاعات نامعتبر است.");
            int newRev=rev+1;
            ContentValues cv=new ContentValues();cv.put("revision",newRev);cv.put("body",next.toString());cv.put("changed_at",now());
            db.update("state",cv,"id=1",null);
            if(restore){db.delete("ledger_events",null,null);db.delete("installment_contracts",null,null);}
            mirror(db,next,newRev);
            ContentValues mut=new ContentValues();mut.put("revision",newRev);mut.put("at",now());mut.put("operation",restore?"restore":action.isEmpty()?"save":action);
            mut.put("before_hash",sha(previous.getJSONObject("store").toString()));mut.put("after_hash",sha(next.toString()));
            db.insertOrThrow("mutations",null,mut);
            if(!action.isEmpty()){
                ContentValues aud=new ContentValues();aud.put("id",UUID.randomUUID().toString());aud.put("revision",newRev);aud.put("action",action);aud.put("reason",reason);aud.put("at",now());
                db.insertOrThrow("audit_actions",null,aud);
            }
            result=new JSONObject().put("revision",newRev).put("store",next);
            db.setTransactionSuccessful();
        }finally{db.endTransaction();}
        // Independently stored JSON snapshots survive SQLite database corruption, but remain
        // in the app's private directory. The user should also export an encrypted document.
        String policy=next.optString("backupPolicy","change");
        if("change".equals(policy)){
            try{backup("change");}catch(Exception ex){result.put("backupWarning","ذخیره انجام شد اما بک‌آپ داخلی ناموفق بود: "+ex.getMessage());}
        }
        return result;
    }
    public synchronized void periodic() throws Exception {
        JSONObject current=get();if(current==null)return;
        String policy=current.getJSONObject("store").optString("backupPolicy","change");
        if(!"hourly".equals(policy)&&!"daily".equals(policy))return;
        long threshold="hourly".equals(policy)?3_600_000L:86_400_000L;
        try(Cursor c=getReadableDatabase().rawQuery("SELECT created_at FROM backup_manifest ORDER BY created_at DESC LIMIT 1",null)){
            if(c.moveToFirst()){
                try{if(System.currentTimeMillis()-Instant.parse(c.getString(0)).toEpochMilli()<threshold)return;}
                catch(Exception ignored){}
            }
        }
        backup(policy);
    }
    private File snapshotFile(String id){return new File(snapshotDir,"dang-"+id+".json");}
    public synchronized JSONObject backup(String reason) throws Exception {
        JSONObject current=get();if(current==null)throw new IllegalStateException("داده برای بک‌آپ موجود نیست");
        final String id=System.currentTimeMillis()+"-"+UUID.randomUUID();
        final String timestamp=now(),name="dang-"+id+".json";
        final JSONObject envelope=new JSONObject().put("format","dang-native-snapshot").put("createdAt",timestamp).put("revision",current.getInt("revision")).put("store",current.getJSONObject("store"));
        final File temp=new File(snapshotDir,name+".tmp"),file=snapshotFile(id);
        try(FileOutputStream out=new FileOutputStream(temp)){
            out.write(envelope.toString().getBytes(StandardCharsets.UTF_8));out.flush();out.getFD().sync();
        }
        if(!temp.renameTo(file))throw new IllegalStateException("تغییر نام فایل پشتیبان ناموفق بود");
        final SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try{
            ContentValues cv=new ContentValues();cv.put("id",id);cv.put("created_at",timestamp);cv.put("reason",reason);cv.put("revision",current.getInt("revision"));cv.put("body",current.getJSONObject("store").toString());cv.put("filename",name);
            db.insertOrThrow("backup_manifest",null,cv);
            db.setTransactionSuccessful();
        }finally{db.endTransaction();}
        prune();
        return new JSONObject().put("id",id).put("createdAt",timestamp).put("reason",reason).put("revision",current.getInt("revision"));
    }
    private synchronized void prune(){
        final SQLiteDatabase db=getWritableDatabase();
        try(Cursor c=db.rawQuery("SELECT id,filename FROM backup_manifest ORDER BY created_at DESC,id DESC LIMIT -1 OFFSET 60",null)){
            while(c.moveToNext()){
                final String id=c.getString(0),name=c.getString(1);
                db.delete("backup_manifest","id=?",new String[]{id});
                new File(snapshotDir,name).delete();
            }
        }
    }
    public synchronized JSONArray list(){
        JSONArray arr=new JSONArray();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT id,created_at,reason,revision FROM backup_manifest ORDER BY created_at DESC,id DESC",null)){
            while(c.moveToNext())arr.put(new JSONObject().put("id",c.getString(0)).put("createdAt",c.getString(1)).put("reason",c.getString(2)).put("revision",c.getInt(3)));
        }catch(JSONException ex){throw new IllegalStateException(ex);}
        return arr;
    }
    public synchronized JSONObject read(String id) throws Exception{
        try(Cursor c=getReadableDatabase().rawQuery("SELECT body FROM backup_manifest WHERE id=?",new String[]{id})){
            if(!c.moveToFirst())throw new IllegalArgumentException("بک‌آپ پیدا نشد.");
            return new JSONObject().put("store",new JSONObject(c.getString(0)));
        }
    }

    /** Completely separate SQLite tables for trips: never reuse household state or financial events. */
    private static void ensureTravel(SQLiteDatabase db){
        db.execSQL("CREATE TABLE IF NOT EXISTS travel_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL, changed_at TEXT NOT NULL)");
        db.execSQL("CREATE TABLE IF NOT EXISTS travel_backups (revision INTEGER PRIMARY KEY, created_at TEXT NOT NULL, body TEXT NOT NULL)");
    }
    public synchronized JSONObject getTravel() throws Exception {
        SQLiteDatabase db=getWritableDatabase();ensureTravel(db);
        try(Cursor c=db.rawQuery("SELECT revision,body FROM travel_state WHERE id=1",null)){
            if(!c.moveToFirst())return new JSONObject().put("revision",0).put("travel",new JSONObject().put("version",1).put("trips",new JSONArray()));
            return new JSONObject().put("revision",c.getInt(0)).put("travel",new JSONObject(c.getString(1)));
        }
    }
    public synchronized JSONObject saveTravel(JSONObject travel,int expectedRevision) throws Exception {
        if(travel.optInt("version",-1)!=1||!travel.has("trips")||!(travel.opt("trips") instanceof JSONArray))
            throw new IllegalArgumentException("ساختار دنگ سفر نامعتبر است.");
        final SQLiteDatabase db=getWritableDatabase();ensureTravel(db);db.beginTransaction();
        try{
            int revision=0;
            try(Cursor c=db.rawQuery("SELECT revision FROM travel_state WHERE id=1",null)){
                if(c.moveToFirst())revision=c.getInt(0);
            }
            if(revision!=expectedRevision)throw new IllegalStateException("داده سفر تغییر کرده است؛ دوباره بارگذاری کن.");
            int nextRevision=revision+1;
            ContentValues cv=new ContentValues();cv.put("id",1);cv.put("revision",nextRevision);cv.put("body",travel.toString());cv.put("changed_at",now());
            db.insertWithOnConflict("travel_state",null,cv,SQLiteDatabase.CONFLICT_REPLACE);
            ContentValues backup=new ContentValues();backup.put("revision",nextRevision);backup.put("created_at",now());backup.put("body",travel.toString());
            db.insertOrThrow("travel_backups",null,backup);
            db.execSQL("DELETE FROM travel_backups WHERE revision NOT IN (SELECT revision FROM travel_backups ORDER BY revision DESC LIMIT 60)");
            db.setTransactionSuccessful();
            return new JSONObject().put("revision",nextRevision).put("travel",travel);
        }finally{db.endTransaction();}
    }
    public synchronized JSONArray listTravelBackups() throws Exception {
        SQLiteDatabase db=getWritableDatabase();ensureTravel(db);JSONArray result=new JSONArray();
        try(Cursor c=db.rawQuery("SELECT revision,created_at FROM travel_backups ORDER BY revision DESC LIMIT 60",null)){
            while(c.moveToNext())result.put(new JSONObject().put("revision",c.getInt(0)).put("createdAt",c.getString(1)));
        }
        return result;
    }
    public synchronized JSONObject readTravelBackup(int revision) throws Exception {
        SQLiteDatabase db=getWritableDatabase();ensureTravel(db);
        try(Cursor c=db.rawQuery("SELECT body FROM travel_backups WHERE revision=?",new String[]{String.valueOf(revision)})){
            if(!c.moveToFirst())throw new IllegalArgumentException("نسخه پشتیبان سفر پیدا نشد.");
            return new JSONObject(c.getString(0));
        }
    }
}
