(function () {
  var wsQr = null;
  var scanSession = document.body.dataset.scanSession || null;
  var initialTab = document.body.dataset.activeTab || 'whatsapp';

  function switchTab(name) {
    document.querySelectorAll('[role="tab"][data-tab]').forEach(function (btn) {
      var active = btn.dataset.tab === name;
      if (btn.classList.contains('mobile-nav-item')) {
        btn.classList.toggle('active', active);
      } else {
        btn.className = active ? 'tab-active' : 'tab';
      }
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      p.classList.add('hidden');
    });
    var panel = document.getElementById('panel-' + name);
    if (panel) panel.classList.remove('hidden');
  }

  document.querySelectorAll('[role="tab"][data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchTab(btn.dataset.tab || 'whatsapp');
    });
  });

  switchTab(initialTab);

  function renderQr(data) {
    var box = document.getElementById('qrBox');
    var status = document.getElementById('qrStatus');
    if (!box || !status) return;

    var labels = {
      connected: 'Terhubung',
      qr_ready: 'Siap scan',
      initializing: 'Memulai...',
      reconnecting: 'Menghubungkan ulang...',
      disconnected: 'Terputus',
      failed: 'Gagal',
    };
    var s = data.status || '';
    status.textContent = labels[s] || s;

    if (data.qr) {
      box.className = 'qr-frame has-qr';
      box.innerHTML =
        '<img src="data:image/png;base64,' + data.qr +
        '" class="max-w-[min(200px,80vw)] rounded-xl" alt="QR Code">';
    } else if (s === 'connected') {
      box.className = 'qr-frame has-qr';
      box.innerHTML =
        '<div class="text-center"><p class="text-3xl text-brand mb-2">✓</p>' +
        '<p class="text-brand font-semibold">Terhubung</p>' +
        '<p class="hint mt-1">Siap kirim pesan</p></div>';
    } else if (s === 'initializing' || s === 'reconnecting' || s === 'qr_ready') {
      box.className = 'qr-frame';
      box.innerHTML = '<p class="text-sm text-txt-muted animate-pulse-soft">Menunggu QR...</p>';
    } else if (s === 'failed') {
      box.className = 'qr-frame';
      box.innerHTML = '<p class="text-sm text-red-400">Gagal. Klik "Sambung ulang" di daftar session.</p>';
    }
  }

  function fetchQrFallback(id) {
    fetch('/dashboard/session/' + id + '/qr')
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.data) renderQr(j.data); })
      .catch(function () {});
  }

  function loadQr(sessionId) {
    if (!sessionId) return;

    switchTab('whatsapp');

    var section = document.getElementById('qrSection');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });

    var box = document.getElementById('qrBox');
    if (box) {
      box.className = 'qr-frame';
      box.innerHTML = '<p class="text-sm text-txt-muted animate-pulse-soft">Memuat...</p>';
    }

    if (wsQr) wsQr.close();

    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsQr = new WebSocket(proto + '//' + location.host + '/ws/session/' + sessionId + '/qr');
    wsQr.onmessage = function (e) { renderQr(JSON.parse(e.data)); };
    wsQr.onerror = function () { fetchQrFallback(sessionId); };
    wsQr.onclose = function () { fetchQrFallback(sessionId); };

    setTimeout(function () { fetchQrFallback(sessionId); }, 3000);
  }

  document.querySelectorAll('.btn-show-qr').forEach(function (btn) {
    btn.addEventListener('click', function () {
      loadQr(btn.dataset.session || '');
    });
  });

  if (scanSession) {
    setTimeout(function () { loadQr(scanSession); }, 500);
  }

  var phone = document.getElementById('phoneNumber');
  var sid = document.getElementById('sessionId');
  if (phone && sid) {
    phone.addEventListener('input', function () {
      if (sid.dataset.manual === 'true') return;
      var d = phone.value.replace(/\D/g, '');
      if (d.startsWith('0')) d = '62' + d.slice(1);
      sid.value = d ? 'wa-' + d : '';
    });
    sid.addEventListener('input', function () { sid.dataset.manual = 'true'; });
  }

  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  var copyBtn = document.getElementById('btnCopyKey');
  var keyVal = document.getElementById('newApiKeyValue');
  if (copyBtn && keyVal) {
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(keyVal.textContent || '').then(function () {
        copyBtn.textContent = 'Tersalin!';
        setTimeout(function () { copyBtn.textContent = 'Salin Key'; }, 2000);
      });
    });
  }
})();
