/* ══════════════════════════════════════════
   OmniService TG — back-navigation.js v4
   Gestion du bouton Retour (Android / PWA)
   ══════════════════════════════════════════

   PRINCIPES :
   • Un seul history.pushState (garde-fou) capte le popstate Android/PWA.
   • À chaque popstate, on lit l'état DOM réel et on appelle .click()
     sur le .back-btn de la vue active — celui-ci est déjà muté
     dynamiquement par app.js/index.html selon le contexte.
   • pushState est différé via setTimeout pour éviter le double-popstate
     sur Android Chrome.
   • Flag _isHandling empêche tout traitement ré-entrant.
   • Double-appui sortie uniquement depuis l'accueil, 5 secondes.
*/

(function () {
  'use strict';

  /* ──────────────────────────────────────
     CONSTANTES
  ────────────────────────────────────── */

  var PUSH_DELAY = 50; // ms — délai avant de repousser le garde-fou

  /* ──────────────────────────────────────
     HELPERS — état DOM actuel
  ────────────────────────────────────── */

  function currentTab() {
    var p = document.querySelector('.page.on');
    return p ? p.id.replace('p-', '') : 'home';
  }

  // Vues ordonnées de la plus profonde à la plus haute
  var ALL_VIEWS = [
    'success', 'payment', 'delivery',
    'immo-form', 'immo-options',
    'form', 'catalogue', 'kit-detail',
    'kits', 'restaurants', 'list'
  ];

  function currentView() {
    for (var i = 0; i < ALL_VIEWS.length; i++) {
      var el = document.getElementById('view-' + ALL_VIEWS[i]);
      if (el && el.style.display === 'block') return ALL_VIEWS[i];
    }
    return null;
  }

  /* ──────────────────────────────────────
     FERMETURE DES OVERLAYS / MODALS
  ────────────────────────────────────── */

  function closeTopOverlay() {
    // Auth modal
    var auth = document.getElementById('auth-modal');
    if (auth && auth.style.display === 'flex') {
      if (window.closeAuthModal) window.closeAuthModal();
      else auth.style.display = 'none';
      return true;
    }

    // Composable builder
    var comp = document.getElementById('composable-builder-overlay');
    if (comp && comp.style.display === 'block') {
      comp.style.display = 'none';
      return true;
    }

    // Modals paiement
    var payIds = ['modal-tmoney', 'modal-flooz'];
    for (var i = 0; i < payIds.length; i++) {
      var m = document.getElementById(payIds[i]);
      if (m && m.style.display === 'flex') {
        if (window.closePayModal) window.closePayModal(payIds[i]);
        else m.style.display = 'none';
        return true;
      }
    }

    // Overlays dynamiques connus
    var dynIds = ['security-type-overlay', 'gestion-loc-overlay', 'assistance-overlay'];
    for (var j = 0; j < dynIds.length; j++) {
      var el = document.getElementById(dynIds[j]);
      if (el) { el.remove(); return true; }
    }

    // Filet de sécurité : divs fixes z≥9000
    var PERMANENT = {
      'splash-screen': 1, 'toast': 1, 'pwa-banner': 1,
      'modal-tmoney': 1, 'modal-flooz': 1, 'auth-modal': 1
    };
    var divs = document.querySelectorAll('body > div');
    for (var k = 0; k < divs.length; k++) {
      var d = divs[k];
      if (PERMANENT[d.id]) continue;
      var css = d.style.cssText || '';
      var isFixed = css.indexOf('position:fixed') !== -1 || css.indexOf('position: fixed') !== -1;
      if (!isFixed) continue;
      var z = parseInt(window.getComputedStyle(d).zIndex, 10) || 0;
      if (z >= 9000 && d.offsetHeight > 0) { d.remove(); return true; }
    }

    return false;
  }

  /* ──────────────────────────────────────
     ACTION RETOUR PRINCIPALE
     Simule le clic sur le .back-btn actif
  ────────────────────────────────────── */

  function doBack() {
    // 1. Overlay ouvert → le fermer
    if (closeTopOverlay()) return true;

    var tab  = currentTab();
    var view = currentView();

    // 2. Dans les vues services
    if (tab === 'services' && view && view !== 'list') {
      if (view === 'success') return false; // terminal

      var viewEl = document.getElementById('view-' + view);
      if (viewEl) {
        var btn = viewEl.querySelector('.back-btn');
        if (btn) {
          btn.click();
          return true;
        }
      }
      // Fallback
      if (window.showView) { window.showView('list'); return true; }
    }

    // 3. Vue list ou onglet non-home → retour à home
    if (tab !== 'home') {
      if (window.goTab) window.goTab('home');
      return true;
    }

    // 4. On est sur home → signal de sortie
    return false;
  }

  /* ──────────────────────────────────────
     GARDE-FOU HISTORY (un seul état)
  ────────────────────────────────────── */

  function pushGuard() {
    history.pushState({ omniGuard: true }, '');
  }

  function schedulePushGuard() {
    // Différé pour éviter le double-popstate sur Android Chrome
    setTimeout(pushGuard, PUSH_DELAY);
  }

  /* ──────────────────────────────────────
     CONFIRMATION SORTIE
     Double appui / 5s / depuis home uniquement
  ────────────────────────────────────── */

  var _exitPending = false;
  var _exitTimer   = null;

  function cancelExit() {
    _exitPending = false;
    if (_exitTimer) { clearTimeout(_exitTimer); _exitTimer = null; }
  }

  function triggerExit() {
    if (_exitPending) {
      cancelExit();
      try { window.close(); } catch (e) {}
      return;
    }

    _exitPending = true;

    // Toast in-app
    if (window.showToast) {
      window.showToast('\u2b05\ufe0f Appuyez encore pour quitter', '#4A4A6A');
    }

    // Notification système
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('OmniService TG', {
          body: 'Appuyez encore sur Retour pour quitter.',
          icon: 'assets/logo.png',
          tag: 'exit-confirm',
          silent: true
        });
      } catch (e) {}
    }

    // Repousser le garde-fou pour capter le prochain appui
    schedulePushGuard();

    // Annuler après 5s
    _exitTimer = setTimeout(cancelExit, 5000);
  }

  /* ──────────────────────────────────────
     GESTIONNAIRE popstate
     Flag anti-reentrée pour éviter
     le double-traitement Android Chrome
  ────────────────────────────────────── */

  var _isHandling = false;

  window.addEventListener('popstate', function () {
    if (_isHandling) return;
    _isHandling = true;

    var acted = doBack();

    if (acted) {
      cancelExit();
      schedulePushGuard();
    } else {
      triggerExit();
    }

    // Libérer le verrou après le délai (légèrement après pushGuard)
    setTimeout(function () { _isHandling = false; }, PUSH_DELAY + 20);
  });

  /* ──────────────────────────────────────
     INITIALISATION
  ────────────────────────────────────── */

  function init() {
    // Un seul état de base + le garde-fou
    history.replaceState({ omniBase: true }, '');
    pushGuard();
    console.log('[BackNav v4] OK');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
