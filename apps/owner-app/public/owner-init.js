// [SOVEREIGN-BOOT] GLOBAL STATE & ERROR CAPTURE
window.__BIN_GROUPS_BOOT__ = {
  staticReady: true,
  reactMounted: false,
  authReady: false,
  startedAt: Date.now()
};

window.addEventListener("error", function (event) {
  console.error("BIN-GROUPS BOOT ERROR:", event.message, event.filename, event.lineno, event.colno);
});

window.addEventListener("unhandledrejection", function (event) {
  console.error("BIN-GROUPS BOOT PROMISE REJECTION:", event.reason);
});

// ROUTE AWARE CONTENT & LANGAUGE
(function () {
  try {
    var path = window.location.pathname || '/';
    var routeMap = {
      '/owners': 'owners',
      '/tenants': 'tenants',
      '/technicians': 'technicians',
      '/brokers': 'brokers',
      '/security': 'security'
    };

    var selected = routeMap[path] || 'home';
    document.querySelectorAll('.route-content').forEach(function (node) {
      node.style.display = 'none';
    });
    var active = document.getElementById('static-route-' + selected);
    if (active) active.style.display = 'block';

    var storedLanguage = localStorage.getItem('bin_language');
    var staticLangToggle = document.getElementById('static-lang-toggle');
    if (storedLanguage === 'ar') {
      document.body.classList.add('ar-font');
      document.body.style.direction = 'rtl';
      if (staticLangToggle) staticLangToggle.textContent = 'English';
    } else if (staticLangToggle) {
      staticLangToggle.textContent = 'العربية';
    }
  } catch (routeError) {
    console.error('BIN-GROUPS STATIC ROUTE ERROR:', routeError);
  }
})();

// TIMEOUT HANDLER
setTimeout(() => {
  try {
    if (window.__BIN_GROUPS_BOOT__ && !window.__BIN_GROUPS_BOOT__.reactMounted) {
      console.error("CRITICAL: React bundle did not mount in time.");
      document.body.classList.add('bin-groups-timeout-visible');
      const root = document.getElementById('root');
      if (root) {
        root.innerHTML = `
          <div class="system-error">
            <h1 class="error-title">SYSTEM INITIALIZATION TIMEOUT / انتهت مهلة تشغيل النظام</h1>
            <p class="error-msg">The secure operating system did not fully boot. Please verify network access, disable unsupported proxy blockers, or reload the page.</p>
            <p class="error-msg ar-font" dir="rtl">لم يكتمل تشغيل النظام الآمن. يرجى التحقق من الاتصال بالشبكة أو تعطيل مانع الوكيل غير المدعوم أو إعادة تحميل الصفحة.</p>
            <button class="btn-reload" onclick="window.location.reload()">RELOAD SYSTEM</button>
          </div>
        `;
      }
    }
  } catch (timeoutError) {
    console.error("BIN-GROUPS TIMEOUT HANDLER FAILED:", timeoutError);
  }
}, 12000);
