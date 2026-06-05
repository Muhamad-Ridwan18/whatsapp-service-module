(function () {
  let wsQr = null;
  let activeSessionId = null;

  const scanSession = document.body.dataset.scanSession || null;
  const initialTab = document.body.dataset.activeTab || 'whatsapp';

  /* ---- Tabs ---- */
  function switchTab(name) {
    document.querySelectorAll('[data-tab]').forEach(function (btn) {
      if (!btn.dataset.tab || btn.getAttribute('role') !== 'tab') return;
      btn.className = btn.dataset.tab === name ? 'tab-btn-active' : 'tab-btn';
    });
    document.querySelectorAll('.tab-panel').forEach(function (panel) {
      panel.classList.add('hidden');
    });
    const panel = document.getElementById('panel-' + name);
    if (panel) panel.classList.remove('hidden');
  }

  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchTab(btn.dataset.tab || 'whatsapp');
    });
  });

  switchTab(initialTab);

  /* ---- QR ---- */
  function renderQr(data) {
    const box = document.getElementById('qrBox');
    const status = document.getElementById('qrStatus');
    if (!box || !status) return;

    const s = data.status || 'unknown';
    const labels = {
      connected: 'Terhubung',
      qr_ready: 'Siap scan QR',
      initializing: 'Memulai koneksi...',
      reconnecting: 'Menghubungkan ulang...',
      disconnected: 'Terputus',
      failed: 'Gagal terhubung',
    };
    status.textContent = labels[s] || s;

    if (data.qr) {
      box.innerHTML =
        '<img src="data:image/png;base64,' +
        data.qr +
        '" class="max-w-[220px] mx-auto rounded-lg shadow-lg" alt="QR WhatsApp">';
      box.classList.remove('border-dashed');
    } else if (s === 'connected') {
      box.innerHTML =
        '<div class="text-center"><p class="text-accent text-lg font-semibold mb-1">✓ Terhubung</p><p class="text-gray-500 text-sm">WhatsApp siap kirim pesan</p></div>';
    } else if (s === 'initializing' || s === 'reconnecting' || s === 'qr_ready') {
      box.innerHTML =
        '<p class="text-gray-400 text-sm animate-pulse">Menunggu QR dari WhatsApp...</p>';
    } else if (s === 'failed') {
      box.innerHTML =
        '<p class="text-red-400 text-sm">Koneksi gagal. Coba "Sambung ulang" pada tabel session.</p>';
    } else {
      box.innerHTML =
        '<p class="text-gray-500 text-sm">Menunggu QR...</p>';
    }
  }

  async function fetchQrFallback(sessionId) {
    try {
      const res = await fetch('/dashboard/session/' + sessionId + '/qr');
      const json = await res.json();
      if (json.data) renderQr(json.data);
    } catch (_) {
      /* ignore */
    }
  }

  function loadQr(sessionId) {
    if (!sessionId) return;
    activeSessionId = sessionId;

    const qrSection = document.getElementById('qrSection');
    if (qrSection) {
      qrSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const box = document.getElementById('qrBox');
    const status = document.getElementById('qrStatus');
    if (box) {
      box.innerHTML = '<p class="text-gray-400 text-sm animate-pulse">Memuat QR...</p>';
    }
    if (status) status.textContent = 'Menghubungkan...';

    if (wsQr) wsQr.close();

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsQr = new WebSocket(proto + '//' + location.host + '/ws/session/' + sessionId + '/qr');

    wsQr.onmessage = function (e) {
      renderQr(JSON.parse(e.data));
    };

    wsQr.onerror = function () {
      void fetchQrFallback(sessionId);
    };

    wsQr.onclose = function () {
      void fetchQrFallback(sessionId);
    };

    setTimeout(function () { fetchQrFallback(sessionId); }, 3000);
    setTimeout(function () { fetchQrFallback(sessionId); }, 8000);
  }

  document.querySelectorAll('.btn-show-qr').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchTab('whatsapp');
      loadQr(btn.dataset.session || '');
    });
  });

  if (scanSession) {
    switchTab('whatsapp');
    setTimeout(function () { loadQr(scanSession); }, 400);
  }

  /* ---- Phone → Session ID ---- */
  const phoneInput = document.getElementById('phoneNumber');
  const sessionIdInput = document.getElementById('sessionId');
  if (phoneInput && sessionIdInput) {
    phoneInput.addEventListener('input', function () {
      if (sessionIdInput.dataset.manual === 'true') return;
      const digits = phoneInput.value.replace(/\D/g, '');
      let n = digits;
      if (n.startsWith('0')) n = '62' + n.slice(1);
      sessionIdInput.value = n ? 'wa-' + n : '';
    });
    sessionIdInput.addEventListener('input', function () {
      sessionIdInput.dataset.manual = 'true';
    });
  }

  /* ---- Confirm dialogs ---- */
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      const msg = form.getAttribute('data-confirm');
      if (msg && !window.confirm(msg)) e.preventDefault();
    });
  });

  /* ---- Copy API key ---- */
  const btnCopyKey = document.getElementById('btnCopyKey');
  const newApiKeyValue = document.getElementById('newApiKeyValue');
  if (btnCopyKey && newApiKeyValue) {
    btnCopyKey.addEventListener('click', function () {
      navigator.clipboard.writeText(newApiKeyValue.textContent || '').then(function () {
        btnCopyKey.textContent = 'Tersalin!';
        setTimeout(function () { btnCopyKey.textContent = 'Salin Key'; }, 2000);
      });
    });
  }
})();
