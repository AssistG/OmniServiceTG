/* ══════════════════════════════════════════
   OmniService TG — back-navigation.js v3
   Gestion du bouton Retour (Android / PWA)
   ══════════════════════════════════════════

   PRINCIPE FONDAMENTAL :
   Chaque vue possède déjà un bouton .back-btn dont le onclick
   est muté dynamiquement par app.js/index.html selon le contexte.
   → On lit et on appelle ce onclick directement : c'est exactement
     ce que ferait l'utilisateur en tapant le bouton visuel.
   → Zéro pile parallèle, zéro monkey-patch de showView/goTab.
   → Un seul history.pushState permanent (garde-fou popstate).

   SORTIE DE L'APPLICATION :
   Uniquement depuis l'accueil (onglet home, aucune vue services ouverte).
   1er appui → toast + notification système.
   2e appui dans les 5s → window.close().
*/

(function () {
  'use strict';

  /* ────────────────────────────────────────
     HELPERS — lire l'état DOM actuel
  ──────────────────────────────────────── */

  /** ID de l'onglet actif : 'home' | 'services' | 'orders' | 'profile' | … */
  function currentTab() {
    const p = document.querySelector('.page.on');
    return p ? p.id.replace('p-', '') : 'home';
  }

  /**
   * ID de la vue interne visible dans #p-services, ou null.
   * Ordre : de la plus profonde à la plus haute.
   */
  const ALL_VIEWS = [
    'success', 'payment', 'delivery', 'immo-form', 'immo-options',
    'form', 'catalogue', 'kit-detail', 'kits', 'restaurants', 'list'
  ];

  function currentView() {
    for (const v of ALL_VIEWS) {
      const el = document.getElementById('view-' + v);
      if (el && el.style.display === 'block') return v;
    }
    return null;
  }

  /* ────────────────────────────────────────
     OVERLAYS / MODALS
  ──────────────────────────────────────── */

  function closeTopOverlay() {

    // Auth modal
    const auth = document.getElementById('auth-modal');
    if (auth && auth.style.display === 'flex') {
      if (window.closeAuthModal) window.closeAuthModal();
      else auth.style.display = 'none';
      return true;
    }

    // Composable builder
    const comp = document.getElementById('composable-builder-overlay');
    if (comp && comp.style.display === 'block') {
      comp.style.display = 'none';
      return true;
    }

    // Modals paiement T-Money / Flooz
    for (const mid of ['modal-tmoney', 'modal-flooz']) {
      const m = document.getElementById(mid);
      if (m && m.style.display === 'flex') {
        if (window.closePayModal) window.closePayModal(mid);
        else m.style.display = 'none';
        return true;
      }
    }

    // Overlays dynamiques connus
    for (const id of ['security-type-overlay', 'gestion-loc-overlay', 'assistance-overlay']) {
      const el = document.getElementById(id);
      if (el) { el.remove(); return true; }
    }

    // Filet de sécurité : divs fixes z>=9000 en body
    const PERMANENT = new Set([
      'splash-screen', 'toast', 'pwa-banner',
      'modal-tmoney', 'modal-flooz', 'auth-modal'
    ]);
    for (const el of document.querySelectorAll('body > div')) {
      if (PERMANENT.has(el.id)) continue;
      const st = el.style;
      const isFixed = st.position === 'fixed' || st.cssText.includes('position:fixed');
      if (!isFixed) continue;
      const z = parseInt(window.getComputedStyle(el).zIndex, 10) || 0;
      if (z >= 9000 && el.offsetParent !== null) { el.remove(); return true; }
    }

    return false;
  }

  /* ────────────────────────────────────────
     ACTION RETOUR PRINCIPALE
  ──────────────────────────────────────── */

  function doBack() {

    // Priorité 1 : fermer un overlay ouvert
    if (closeTopOverlay()) return true;

    const tab  = currentTab();
    const view = currentView();

    // Priorité 2 : navigation dans les vues de l'onglet services
    if (tab === 'services' && view && view !== 'list') {

      // 'success' est terminal
      if (view === 'success') return false;

      // Appeler le onclick du .back-btn de la vue active
      // (muté dynamiquement par app.js/index.html selon le contexte)
      const viewEl = document.getElementById('view-' + view);
      if (viewEl) {
        const backBtn = viewEl.querySelector('.back-btn');
        if (backBtn && typeof backBtn.onclick === 'function') {
          backBtn.onclick.call(backBtn, new Event('click'));
          return true;
        }
      }

      // Fallback si pas de back-btn
      if (window.showView) { window.showView('list'); return true; }
    }

    // Priorité 3 : onglet non-home → retour à home
    if (tab !== 'home') {
      if (window.goTab) window.goTab('home');
      return true;
    }

    // Racine absolue → signal de sortie
    return false;
  }

  /* ────────────────────────────────────────
     CONFIRMATION SORTIE (double appui / 5s)
     Uniquement depuis l'accueil
  ──────────────────────────────────────── */

  let _exitPending = false;
  let _exitTimer   = null;

  function resetExitPending() {
    _exitPending = false;
    if (_exitTimer) { clearTimeout(_exitTimer); _exitTimer = null; }
  }

  function triggerExitSequence() {
    if (_exitPending) {
      resetExitPending();
      try { window.close(); } catch (_) {}
      return;
    }

    _exitPending = true;

    if (window.showToast) {
      window.showToast('\u2b05\ufe0f Appuyez encore pour quitter l\'application', '#4A4A6A');
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('OmniService TG', {
          body: 'Appuyez encore sur Retour pour quitter.',
          icon: 'assets/logo.png',
          tag: 'exit-confirm',
          silent: true
        });
      } catch (_) {}
    }

    pushGuard();
    _exitTimer = setTimeout(resetExitPending, 5000);
  }

  /* ────────────────────────────────────────
     GARDE-FOU HISTORY
  ──────────────────────────────────────── */

  function pushGuard() {
    history.pushState({ omniGuard: true }, '');
  }

  /* ────────────────────────────────────────
     GESTIONNAIRE popstate
  ──────────────────────────────────────── */

  window.addEventListener('popstate', function () {
    const acted = doBack();
    if (acted) {
      resetExitPending();
      pushGuard();
    } else {
      triggerExitSequence();
    }
  });

  /* ────────────────────────────────────────
     INITIALISATION
  ──────────────────────────────────────── */

  function init() {
    history.replaceState({ omniBase: true }, '');
    pushGuard();
    console.log('[BackNav v3] Pret.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
