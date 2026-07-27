(function() {
  var loader = document.getElementById('bin-boot-loader');
  var fallback = document.getElementById('bin-boot-fallback');
  var fallbackTimer = window.setTimeout(function(){
    if (fallback) fallback.style.display = 'block';
  }, 12000);

  window._BIN_MAIN_BUNDLE_FAILED = function(){
    window.__BIN_GROUPS_BOOT__ = Object.assign({}, window.__BIN_GROUPS_BOOT__, { mainBundleFailed: true });
    window.clearTimeout(fallbackTimer);
    if (fallback) {
      fallback.style.display = 'block';
      fallback.textContent = 'The main application bundle failed to load. Check your connection, clear cache, then reload.';
    }
  };

  window._BIN_MOUNT_SUCCESS = function(){
    window.clearTimeout(fallbackTimer);
    if (loader) loader.classList.add('bin-boot-hidden');
    window.setTimeout(function(){ if (loader && loader.parentNode) loader.parentNode.removeChild(loader); }, 260);
  };
})();
