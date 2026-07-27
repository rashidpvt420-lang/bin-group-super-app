(function() {
  var lang = localStorage.getItem('bin_language') || 'en';
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  window.__BIN_GROUPS_BOOT__ = Object.assign({}, window.__BIN_GROUPS_BOOT__, { startedAt: Date.now(), staticReady: true, mainBundleFailed: false });
  window.t = window.t || function(key, variables) {
    var fallback = String(key || '').split('.').pop().replace(/_/g, ' ');
    fallback = fallback.replace(/\b\w/g, function(letter) { return letter.toUpperCase(); });
    if (variables) {
      Object.keys(variables).forEach(function(name) {
        fallback = fallback.replace(new RegExp('\\{' + name + '\\}', 'g'), String(variables[name]));
      });
    }
    return fallback;
  };
})();
