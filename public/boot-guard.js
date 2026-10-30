/* Runs before the module graph: survives missing assets and import-time exceptions. */
(function () {
  'use strict';
  var ready = false, lastReport = '', timer;
  function report(error) {
    return 'Dong V1.0.5 startup diagnostic\n' + new Date().toISOString() + '\n' +
      navigator.userAgent + '\n' + String(error && (error.stack || error.message) || error);
  }
  function fail(error) {
    lastReport = report(error);
    clearTimeout(timer);
    var panel = document.getElementById('startup-panel');
    panel.hidden = false;
    document.getElementById('startup-title').textContent = 'راه‌اندازی دنگ ناموفق بود';
    document.getElementById('startup-message').textContent = 'اطلاعات برنامه پاک نشده است. دوباره تلاش کنید یا گزارش فنی را ذخیره کنید.';
    document.getElementById('startup-actions').hidden = false;
    document.getElementById('startup-details').textContent = lastReport;
  }
  window.dongStartup = {
    fail: fail,
    ready: function () { ready = true; clearTimeout(timer); document.getElementById('startup-panel').hidden = true; }
  };
  window.addEventListener('error', function (event) {
    if (event.target && event.target.tagName === 'SCRIPT') fail('Script load failed: ' + event.target.src);
    else if (event.error || event.message) fail(event.error || event.message);
  }, true);
  window.addEventListener('unhandledrejection', function (event) { fail(event.reason); });
  document.getElementById('startup-retry').onclick = function () { location.reload(); };
  document.getElementById('startup-save').onclick = function () {
    if (window.DongNative) {
      window.DongNative.saveFile('startup-diagnostic', 'dong-startup-diagnostic.txt', lastReport);
    } else {
      var link = document.createElement('a'), url = URL.createObjectURL(new Blob([lastReport], {type:'text/plain'}));
      link.href = url; link.download = 'dong-startup-diagnostic.txt'; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
  };
  timer = setTimeout(function () { if (!ready) fail('Startup timed out after 20 seconds; UI/SQLite did not report ready.'); }, 20000);
}());
