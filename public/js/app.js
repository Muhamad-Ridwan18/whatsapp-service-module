(function () {
  var drawer = document.getElementById('mobileDrawer');
  var btnMenu = document.getElementById('btnMenu');
  var backdrop = document.getElementById('drawerBackdrop');

  if (!drawer || !btnMenu) return;

  function openDrawer() {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  btnMenu.addEventListener('click', function () {
    if (drawer.classList.contains('open')) closeDrawer();
    else openDrawer();
  });

  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  drawer.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeDrawer);
  });
})();
