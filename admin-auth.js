// Dashboard sign-in: sends the admin token as a Bearer header on same-origin /api/ calls.
// The token is kept in sessionStorage only (cleared when the tab closes) and never put in a URL.
(function () {
  'use strict';
  var KEY = 'bgh_admin_token';
  function token() { try { return sessionStorage.getItem(KEY) || ''; } catch (_) { return ''; } }

  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var sameOriginApi = false;
    try { var u = new URL(url, location.href); sameOriginApi = u.origin === location.origin && u.pathname.indexOf('/api/') === 0; } catch (_) {}
    var t = token();
    if (sameOriginApi && t) {
      init = Object.assign({}, init || {});
      var headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
      headers.set('authorization', 'Bearer ' + t);
      init.headers = headers;
    }
    return nativeFetch(input, init).then(function (response) {
      if (sameOriginApi && response.status === 401) showSignIn(t ? 'That token was not accepted. Try again.' : '');
      return response;
    });
  };

  function showSignIn(message) {
    if (document.getElementById('adminSignIn')) return;
    var box = document.createElement('form');
    box.id = 'adminSignIn';
    box.setAttribute('aria-label', 'Dashboard sign in');
    box.style.cssText = 'margin:16px 0;padding:16px;border:1px solid rgba(221,189,132,.35);border-radius:14px;background:rgba(255,255,255,.04);display:grid;gap:10px;max-width:480px';
    box.innerHTML = '<strong>Sign in to view leads</strong>' +
      (message ? '<span style="color:#ffd9d9">' + message + '</span>' : '') +
      '<label for="adminToken" style="font-size:.85rem">Admin token (LEADS_EXPORT_TOKEN)</label>' +
      '<input id="adminToken" type="password" autocomplete="current-password" required style="padding:10px;border-radius:10px;border:1px solid #445;background:#0f1418;color:#eef2f5">' +
      '<button type="submit" style="padding:10px;border-radius:10px;border:0;background:#cba45f;color:#0f1418;font-weight:700;cursor:pointer">Sign in</button>';
    box.addEventListener('submit', function (event) {
      event.preventDefault();
      try { sessionStorage.setItem(KEY, document.getElementById('adminToken').value.trim()); } catch (_) {}
      location.reload();
    });
    var main = document.querySelector('main') || document.body;
    main.insertBefore(box, main.children[1] || null);
  }

  // CSV links need the header too, so download them through fetch.
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href^="/api/"]');
    if (!link || !token()) return;
    event.preventDefault();
    window.fetch(link.getAttribute('href')).then(function (response) {
      if (!response.ok) throw new Error('Download failed (' + response.status + ')');
      var name = ((response.headers.get('content-disposition') || '').match(/filename="([^"]+)"/) || [])[1] || 'export.csv';
      return response.blob().then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name; a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      });
    }).catch(function (error) { alert(error.message); });
  });

  window.adminSignOut = function () { try { sessionStorage.removeItem(KEY); } catch (_) {} location.reload(); };
})();
