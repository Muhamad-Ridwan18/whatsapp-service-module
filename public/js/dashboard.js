(function () {
  let wsQr = null;
  const scanSession = document.body.dataset.scanSession || null;

  function renderQr(data) {
    const box = document.getElementById('qrBox');
    const status = document.getElementById('qrStatus');
    if (!box || !status) return;

    const s = data.status || 'unknown';
    status.textContent = 'Status: ' + s;

    if (data.qr) {
      box.innerHTML =
        '<img src="data:image/png;base64,' +
        data.qr +
        '" class="max-w-[220px] mx-auto rounded" alt="QR Code">';
    } else if (s === 'connected') {
      box.innerHTML =
        '<p class="text-accent text-sm font-medium">✓ Terhubung ke WhatsApp</p>';
    } else if (s === 'initializing' || s === 'reconnecting') {
      box.innerHTML =
        '<p class="text-gray-400 text-sm animate-pulse">Menunggu QR dari WhatsApp...</p>';
    } else if (s === 'qr_ready') {
      box.innerHTML =
        '<p class="text-gray-400 text-sm animate-pulse">QR sedang dimuat...</p>';
    } else if (s === 'failed') {
      box.innerHTML =
        '<p class="text-red-400 text-sm">Koneksi gagal. Buat ulang session.</p>';
    } else {
      box.innerHTML = '<p class="text-gray-500 text-sm">Menunggu QR...</p>';
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

  function loadQr() {
    const select = document.getElementById('qrSession');
    const sessionId = select && select.value;
    if (!sessionId) return;

    const box = document.getElementById('qrBox');
    const status = document.getElementById('qrStatus');
    if (box) {
      box.innerHTML =
        '<p class="text-gray-400 text-sm animate-pulse">Memulai koneksi...</p>';
    }
    if (status) status.textContent = 'Status: connecting';

    if (wsQr) wsQr.close();

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsQr = new WebSocket(proto + '//' + location.host + '/ws/session/' + sessionId + '/qr');

    wsQr.onopen = function () {
      if (status) status.textContent = 'Status: waiting for QR';
    };

    wsQr.onmessage = function (e) {
      renderQr(JSON.parse(e.data));
    };

    wsQr.onerror = function () {
      if (status) status.textContent = 'WebSocket error, mencoba REST...';
      void fetchQrFallback(sessionId);
    };

    wsQr.onclose = function () {
      void fetchQrFallback(sessionId);
    };

    setTimeout(function () {
      fetchQrFallback(sessionId);
    }, 3000);
    setTimeout(function () {
      fetchQrFallback(sessionId);
    }, 8000);
  }

  const scanBtn = document.getElementById('btnScanQr');
  if (scanBtn) {
    scanBtn.addEventListener('click', loadQr);
  }

  if (scanSession) {
    const select = document.getElementById('qrSession');
    if (select) select.value = scanSession;
    setTimeout(loadQr, 500);
  }

  const logBox = document.getElementById('logBox');
  if (logBox) {
    const logProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const logWs = new WebSocket(logProto + '//' + location.host + '/ws/dashboard/logs');

    logWs.onmessage = function (e) {
      const data = JSON.parse(e.data);
      const line = document.createElement('div');
      line.innerHTML =
        '<span class="text-gray-600">' +
        (data.timestamp ? data.timestamp.slice(11, 19) : '') +
        '</span> <span class="text-accent">' +
        data.sessionId +
        '</span> ' +
        data.message;
      logBox.prepend(line);
      if (logBox.children.length > 100) logBox.lastChild.remove();
    };
  }

  const phoneInput = document.getElementById('phoneNumber');
  const sessionIdInput = document.getElementById('sessionId');
  if (phoneInput && sessionIdInput) {
    phoneInput.addEventListener('input', function () {
      if (sessionIdInput.dataset.manual === 'true') return;
      const digits = phoneInput.value.replace(/\D/g, '');
      let normalized = digits;
      if (normalized.startsWith('0')) normalized = '62' + normalized.slice(1);
      sessionIdInput.value = normalized ? 'wa-' + normalized : '';
    });
  }
  if (sessionIdInput) {
    sessionIdInput.addEventListener('input', function () {
      sessionIdInput.dataset.manual = 'true';
    });
  }

  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      const msg = form.getAttribute('data-confirm');
      if (msg && !window.confirm(msg)) {
        e.preventDefault();
      }
    });
  });

  const btnCopyKey = document.getElementById('btnCopyKey');
  const newApiKeyValue = document.getElementById('newApiKeyValue');
  if (btnCopyKey && newApiKeyValue) {
    btnCopyKey.addEventListener('click', function () {
      navigator.clipboard.writeText(newApiKeyValue.textContent || '').then(function () {
        btnCopyKey.textContent = 'Copied!';
        setTimeout(function () {
          btnCopyKey.textContent = 'Copy Key';
        }, 2000);
      });
    });
  }
})();
