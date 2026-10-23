package ir.dang.household;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.ConsoleMessage;
import android.webkit.WebResourceError;
import android.webkit.RenderProcessGoneDetail;
import android.util.Log;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.view.WindowInsets;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.graphics.Insets;
import android.graphics.Color;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Offline Android shell: bundles React assets and speaks to app-private native SQLite. */
public final class MainActivity extends Activity {
    private static final String ORIGIN="https://dang.local";
    private static final int OPEN_JSON=311, SAVE_DOCUMENT=312;
    private WebView web;
    private DangDatabase database;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingId,pendingContent;

    @Override public void onCreate(Bundle bundle){
        super.onCreate(bundle);
        // Keep notification icons, clock, and battery visible on a solid status-bar background.
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.rgb(245,247,250));
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );
        try { database=new DangDatabase(this); } catch (Exception ex) {
            new AlertDialog.Builder(this).setTitle("خطای پایگاه داده").setMessage("اطلاعات پاک نشده است.\n"+ex.toString()).setPositiveButton("تلاش مجدد",(d,w)->recreate()).setNegativeButton("بستن",(d,w)->finish()).show(); return;
        }
        web=new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(false);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        web.getSettings().setSupportMultipleWindows(false);
        web.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
        WebView.setWebContentsDebuggingEnabled(false);
        web.addJavascriptInterface(new LocalBridge(),"DangNative");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !request.getUrl().toString().startsWith(ORIGIN+"/");}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();String raw=uri.toString();
                if(!raw.startsWith(ORIGIN+"/"))return new WebResourceResponse("text/plain","utf-8",403,"Blocked",new java.util.HashMap<>(),new java.io.ByteArrayInputStream(new byte[0]));
                String path=uri.getEncodedPath();
                if(path==null||path.equals("/"))path="/index.html";
                if(path.contains("..")||path.contains("\\")||path.contains("%"))return empty404();
                String name=path.substring(1);
                String mime=name.endsWith(".html")?"text/html":name.endsWith(".js")?"text/javascript":name.endsWith(".css")?"text/css":name.endsWith(".svg")?"image/svg+xml":name.endsWith(".png")?"image/png":name.endsWith(".json")?"application/json":"application/octet-stream";
                try{InputStream in=getAssets().open("web/"+name);return new WebResourceResponse(mime,"utf-8",in);}catch(Exception ex){return empty404();}
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){
                if(request.isForMainFrame()) nativeStartupFailure("بارگذاری رابط ناموفق بود: "+error.getDescription());
                Log.e("DangWebView","Load failed: "+request.getUrl()+" code="+error.getErrorCode());
            }
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){
                nativeStartupFailure("پردازش رابط متوقف شد. اطلاعات SQLite پاک نشده است."); return true;
            }
            private WebResourceResponse empty404(){return new WebResourceResponse("text/plain","utf-8",404,"Not found",new java.util.HashMap<>(),new java.io.ByteArrayInputStream(new byte[0]));}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onConsoleMessage(ConsoleMessage message){
                // Log source/line only: console messages can contain user financial data.
                Log.println(message.messageLevel()==ConsoleMessage.MessageLevel.ERROR?Log.ERROR:Log.INFO,
                    "DangWebView",message.messageLevel()+" at "+message.sourceId()+":"+message.lineNumber());
                return true;
            }
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(fileCallback!=null)fileCallback.onReceiveValue(null);
                fileCallback=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.setType("*/*");intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/json","application/octet-stream","text/plain"});
                try{startActivityForResult(intent,OPEN_JSON);return true;}catch(Exception ex){fileCallback=null;callback.onReceiveValue(null);return false;}
            }
            @Override public boolean onJsAlert(WebView view,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("متوجه شدم",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;}
            @Override public boolean onJsConfirm(WebView view,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("تأیید",(d,w)->result.confirm()).setNegativeButton("لغو",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
            @Override public boolean onJsPrompt(WebView view,String url,String message,String defaultValue,JsPromptResult result){
                android.widget.EditText text=new android.widget.EditText(MainActivity.this);text.setText(defaultValue);
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setView(text).setPositiveButton("تأیید",(d,w)->result.confirm(text.getText().toString())).setNegativeButton("لغو",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;
            }
        });
        // Android 15/16 (target API 35) enforce edge-to-edge. Keep system bars
        // unobstructed: the WebView begins below the actual status-bar/cutout inset.
        // Apply insets at the native root, not again in CSS (avoids double spacing).
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        root.addView(web, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ));
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets topAndCutout = insets.getInsets(
                    WindowInsets.Type.statusBars() | WindowInsets.Type.displayCutout()
                );
                Insets navigation = insets.getInsets(WindowInsets.Type.navigationBars());
                v.setPadding(topAndCutout.left, topAndCutout.top,
                    topAndCutout.right, navigation.bottom);
                return insets;
            });
        }
        setContentView(root, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ));
        if (Build.VERSION.SDK_INT >= 35) root.requestApplyInsets();
        web.loadUrl(ORIGIN+"/index.html");
    }
    private void nativeStartupFailure(String message){
        runOnUiThread(()->new AlertDialog.Builder(this).setTitle("راه‌اندازی دنگ ناموفق بود")
            .setMessage(message).setPositiveButton("تلاش مجدد",(d,w)->recreate())
            .setNegativeButton("بستن",(d,w)->finish()).show());
    }
    private final class LocalBridge {
        @JavascriptInterface public String invoke(String json){
            try{
                JSONObject req=new JSONObject(json),value;
                String op=req.getString("op");
                Object result;
                switch(op){
                    case "get":database.periodic();result=database.get();break;
                    case "init":result=database.init(req.getJSONObject("store"));break;
                    case "commit":result=database.commit(req.getJSONObject("store"),req.getInt("expectedRevision"),req.optBoolean("restore"),req.optString("systemAction",""),req.optString("reason",""));break;
                    case "backup":result=database.backup(req.optString("reason","manual"));break;
                    case "list":result=database.list();break;
                    case "read":result=database.read(req.getString("id"));break;
                    default:throw new IllegalArgumentException("Unsupported native operation: "+op);
                }
                return new JSONObject().put("ok",true).put("value",result==null?JSONObject.NULL:result).toString();
            }catch(Exception ex){
                try{return new JSONObject().put("ok",false).put("error",ex.getMessage()==null?ex.toString():ex.getMessage()).toString();}
                catch(Exception ignored){return "{\"ok\":false,\"error\":\"Native SQLite error\"}";}
            }
        }
        /** Android Storage Access Framework -- chosen destination can be Downloads, SD or USB. */
        @JavascriptInterface public void saveFile(String id,String filename,String content){
            runOnUiThread(()->{
                if(pendingId!=null){documentResult(id,false,"یک عملیات ذخیره فایل در حال اجراست.");return;}
                pendingId=id;pendingContent=content;
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(filename.endsWith(".json")?"application/json":"application/octet-stream");
                intent.putExtra(Intent.EXTRA_TITLE,filename);
                try{startActivityForResult(intent,SAVE_DOCUMENT);}
                catch(Exception ex){documentResult(id,false,ex.getMessage());pendingId=null;pendingContent=null;}
            });
        }
    }
    @Override protected void onActivityResult(int req,int result,Intent data){
        super.onActivityResult(req,result,data);
        if(req==OPEN_JSON){if(fileCallback!=null){fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));fileCallback=null;}return;}
        if(req==SAVE_DOCUMENT){
            boolean success=false;String message="ذخیره لغو شد";
            if(result==RESULT_OK&&data!=null&&data.getData()!=null){
                try(OutputStream out=getContentResolver().openOutputStream(data.getData(),"wt")){
                    if(out==null)throw new IllegalStateException("دسترسی به فایل ممکن نیست");
                    out.write(pendingContent.getBytes(StandardCharsets.UTF_8));out.flush();
                    success=true;message=data.getData().toString();
                }catch(Exception ex){message=ex.getMessage();}
            }
            documentResult(pendingId,success,message);pendingId=null;pendingContent=null;
        }
    }
    private void documentResult(String id,boolean success,String message){
        if(id==null||web==null)return;
        String script="window.dangNativeDocumentResult && window.dangNativeDocumentResult("+JSONObject.quote(id)+","+success+","+JSONObject.quote(message==null?"":message)+")";
        web.post(()->web.evaluateJavascript(script,null));
    }
    @Override public void onBackPressed(){
        if(web.canGoBack())web.goBack();else new AlertDialog.Builder(this).setMessage("از برنامه دنگ خارج می‌شوید؟").setPositiveButton("خروج",(d,w)->finish()).setNegativeButton("ادامه",null).show();
    }
    @Override protected void onDestroy(){if(web!=null)web.destroy();if(database!=null)database.close();super.onDestroy();}
}
