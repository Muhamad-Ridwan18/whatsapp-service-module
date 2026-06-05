(function () {
  var wsQr = null;
  var pollTimer = null;
  var lastQrData = null;
  var lastStatus = null;
  var activeSessionId = null;
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

  function stopQrWatch() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (wsQr) {
      wsQr.onclose = null;
      wsQr.close();
      wsQr = null;
    }
    activeSessionId = null;
  }

  function applyQrImage(box, qr) {
    var src = 'data:image/png;base64,' + qr;
    var img = box.querySelector('img');
    if (img && img.src === src) return;
    box.className = 'qr-frame has-qr';
    if (img) {
      img.src = src;
    } else {
      box.innerHTML =
        '<img src="' + src +
        '" class="max-w-[min(200px,80vw)] rounded-xl" alt="QR Code">';
    }
  }

  function renderQr(data) {
    var box = document.getElementById('qrBox');
    var statusEl = document.getElementById('qrStatus');
    if (!box || !statusEl) return;

    var labels = {
      connected: 'Terhubung',
      qr_ready: 'Siap scan',
      initializing: 'Memulai...',
      reconnecting: 'Menghubungkan ulang...',
      disconnected: 'Terputus',
      failed: 'Gagal',
    };

    var s = data.status || lastStatus || '';
    if (data.status) lastStatus = data.status;

    if (data.qr) {
      lastQrData = data.qr;
      applyQrImage(box, data.qr);
    }

    statusEl.textContent = labels[s] || s;

    if (s === 'connected') {
      lastQrData = null;
      box.className = 'qr-frame has-qr';
      box.innerHTML =
        '<div class="text-center"><p class="text-3xl text-brand mb-2">✓</p>' +
        '<p class="text-brand font-semibold">Terhubung</p>' +
        '<p class="hint mt-1">Siap kirim pesan</p></div>';
      stopQrWatch();
      return;
    }

    if (s === 'reconnecting') {
      statusEl.textContent = 'Menghubungkan ulang...';
      if (!lastQrData) {
        box.className = 'qr-frame';
        box.innerHTML =
          '<p class="text-sm text-txt-muted animate-pulse-soft">Menghubungkan ulang...</p>';
      }
      return;
    }

    if (s === 'failed') {
      lastQrData = null;
      box.className = 'qr-frame';
      box.innerHTML =
        '<p class="text-sm text-red-400 mb-3">Koneksi gagal.</p>' +
        '<button type="button" id="btnRetryQr" class="btn-brand">Coba sambung ulang</button>';
      var retryBtn = document.getElementById('btnRetryQr');
      if (retryBtn && activeSessionId) {
        retryBtn.onclick = function () {
          loadQr(activeSessionId);
        };
      }
      return;
    }

    // Status update tanpa QR baru — jangan hapus QR yang sudah tampil
    if (!data.qr && lastQrData) {
      applyQrImage(box, lastQrData);
      return;
    }

    if (!data.qr && (s === 'initializing' || s === 'reconnecting')) {
      if (!lastQrData) {
        box.className = 'qr-frame';
        box.innerHTML =
          '<p class="text-sm text-txt-muted animate-pulse-soft">Menunggu QR...</p>';
      }
    }
  }

  function handleWsMessage(raw) {
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return;
    }

    if (data.type === 'status') {
      renderQr({ status: data.status, qr: data.qr || null });
      return;
    }

    renderQr({
      status: data.status,
      qr: data.qr || null,
    });
  }

  function fetchQrFallback(id) {
    if (activeSessionId !== id) return;
    fetch('/dashboard/session/' + id + '/qr')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (activeSessionId !== id || !j.data) return;
        renderQr(j.data);
      })
      .catch(function () {});
  }

  function loadQr(sessionId) {
    if (!sessionId) return;

    var keepQr = sessionId === activeSessionId && lastQrData;
    var keepStatus = sessionId === activeSessionId ? lastStatus : null;

    stopQrWatch();
    activeSessionId = sessionId;
    lastQrData = keepQr ? lastQrData : null;
    lastStatus = keepStatus;

    switchTab('whatsapp');

    var section = document.getElementById('qrSection');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });

    var box = document.getElementById('qrBox');
    if (box && !lastQrData) {
      box.className = 'qr-frame';
      box.innerHTML = '<p class="text-sm text-txt-muted animate-pulse-soft">Memuat...</p>';
    } else if (box && lastQrData) {
      applyQrImage(box, lastQrData);
    }

    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsQr = new WebSocket(proto + '//' + location.host + '/ws/session/' + sessionId + '/qr');

    wsQr.onmessage = function (e) {
      handleWsMessage(e.data);
    };

    wsQr.onerror = function () {
      fetchQrFallback(sessionId);
    };

    wsQr.onclose = function () {
      if (activeSessionId !== sessionId) return;
      if (lastStatus === 'connected' || lastStatus === 'failed') return;
      if (!lastQrData) {
        fetchQrFallback(sessionId);
      }
    };

    // Fallback jarang — hanya jika WS lambat pertama kali
    setTimeout(function () {
      if (activeSessionId === sessionId && !lastQrData && lastStatus !== 'connected') {
        fetchQrFallback(sessionId);
      }
    }, 4000);

    // Polling cadangan 60 detik — QR WhatsApp sendiri refresh ~60 detik
    pollTimer = setInterval(function () {
      if (activeSessionId !== sessionId) return;
      if (lastStatus === 'connected' || lastStatus === 'failed') {
        stopQrWatch();
        return;
      }
      fetchQrFallback(sessionId);
    }, 60000);
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
