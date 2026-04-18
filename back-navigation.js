/* ══════════════════════════════════════════
   OmniService TG — back-navigation.js v2
   Gestion du bouton Retour (Android / PWA)
   ══════════════════════════════════════════

   PRINCIPE :
   • Un seul history.pushState permanent sert de garde-fou pour
     capturer l'événement popstate du bouton retour natif.
   • À chaque popstate, on lit l'état DOM réel (quel onglet ?
     quelle vue ? quel overlay ?) et on simule le clic sur le
     bouton retour visuel déjà présent dans chaque vue — sans
     aucune pile parallèle, sans monkey-patch de showView.
   • Sortie de l'app : uniquement depuis l'accueil, avec double
     appui séparé de 5 s et notification au premier appui.
*/

(function () {
  'use strict';

  /* ──────────────────────────────────────────
     HELPERS — état DOM actuel
  ────────────────────────────────────────── */

  /** Retourne l'id de l'onglet actif ('home', 'services', 'orders', 'profile'…) */
  function currentTab() {
    const p = document.querySelector('.page.on');
    return p ? p.id.replace('p-', '') : 'home';
  }

  /**
   * Retourne la vue interne visible dans #p-services, ou null.
   * Les vues sont déclarées par ordre de priorité (les plus profondes en premier).
   */
  const VIEWS = [
    'success', 'payment', 'delivery',
    'immo-form', 'immo-options',
    'form', 'catalogue', 'kit-detail',
    'kits', 'restaurants', 'list'
  ];

  function currentView() {
    for (const v of VIEWS) {
      const el = document.getElementById('view-' + v);
      if (el && el.style.display === 'block') return v;
    }
    return null;
  }

  /* ──────────────────────────────────────────
     FERMETURE DES OVERLAYS / MODALS
  ────────────────────────────────────────── */

  /**
   * Ferme le premier overlay/modal visible trouvé.
   * Retourne true si quelque chose a été fermé.
   */
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

    // Modals de paiement T-Money / Flooz
    for (const mid of ['modal-tmoney', 'modal-flooz']) {
      const m = document.getElementById(mid);
      if (m && m.style.display === 'flex') {
        if (window.closePayModal) window.closePayModal(mid);
        else m.style.display = 'none';
        return true;
      }
    }

    // Overlays dynamiques (créés avec document.createElement + appendChild)
    const knownDynamic = [
      'security-type-overlay',
      'gestion-loc-overlay',
      'assistance-overlay'
    ];
    for (const id of knownDynamic) {
      const el = document.getElementById(id);
      if (el) { el.remove(); return true; }
    }

    // Filet de sécurité : tout div fixé z≥9000 visible qui n'est pas
    // une UI permanente (splash, toast, nav, pwa-banner)
    const PERMANENT = new Set([
      'splash-screen', 'toast', 'pwa-banner',
      'nav-bottom', 'modal-tmoney', 'modal-flooz', 'auth-modal'
    ]);
    const fixed = document.querySelectorAll('body > div[style*="position:fixed"], body > div[style*="position: fixed"]');
    for (const el of fixed) {
      if (PERMANENT.has(el.id)) continue;
      const z = parseInt(window.getComputedStyle(el).zIndex, 10) || 0;
      if (z >= 9000 && el.offsetParent !== null) {
        el.remove();
        return true;
      }
    }

    return false;
  }

  /* ──────────────────────────────────────────
     ACTION RETOUR — lit le DOM et agit
  ────────────────────────────────────────── */

  /**
   * Détermine et exécute l'action retour correcte selon l'état actuel.
   * Retourne true si une action a été effectuée, false si on est à la racine.
   */
  function doBack() {

    // 1. Un overlay est-il ouvert ?
    if (closeTopOverlay()) return true;

    const tab  = currentTab();
    const view = currentView();

    // 2. On est dans l'onglet Services — naviguer dans les vues
    if (tab === 'services' && view) {
      switch (view) {

        // Vues racines de services → retour à la liste
        case 'restaurants':
        case 'kits':
        case 'form':
        case 'catalogue': {
          // Cliquer sur le back-btn de la vue active (déjà configuré par app.js)
          const btn = document.querySelector('#view-' + view + ' .back-btn');
          if (btn) { btn.click(); return true; }
          // Fallback direct
          if (window.showView) window.showView('list');
          return true;
        }

        case 'kit-detail': {
          const btn = document.querySelector('#view-kit-detail .back-btn');
          if (btn) { btn.click(); return true; }
          if (window.showView) window.showView('kits');
          return true;
        }

        case 'immo-options': {
          const btn = document.getElementById('immo-options-back-btn');
          if (btn) { btn.click(); return true; }
          if (window.showView) window.showView('list');
          return true;
        }

        case 'immo-form': {
          // immoFormGoBack() lit _immoFormBackFn défini par app.js — c'est exactement
          // ce que fait le bouton visuel #immo-form-back-btn
          const btn = document.getElementById('immo-form-back-btn');
          if (btn) { btn.click(); return true; }
          if (window.immoFormGoBack) window.immoFormGoBack();
          else if (window.showView) window.showView('immo-options');
          return true;
        }

        case 'delivery': {
          const btn = document.getElementById('delivery-back-btn');
          if (btn) { btn.click(); return true; }
          if (window.showView) window.showView('catalogue');
          return true;
        }

        case 'payment': {
          const btn = document.querySelector('#view-payment .back-btn');
          if (btn) { btn.click(); return true; }
          if (window.showView) window.showView('delivery');
          return true;
        }

        case 'success':
          // La vue succès est terminale — on ne revient pas en arrière
          // (évite de re-soumettre une commande)
          return false;

        case 'list':
        default:
          // Déjà sur la liste → remonter à l'onglet home
          return false;
      }
    }

    // 3. Onglet non-home (orders, profile, about…) → retour à home
    if (tab !== 'home') {
      if (window.goTab) window.goTab('home');
      return true;
    }

    // 4. On est sur home et aucune action possible → signal de sortie
    return false;
  }

  /* ──────────────────────────────────────────
     LOGIQUE SORTIE — double appui sur home
  ────────────────────────────────────────── */

  let _exitPending = false;
  let _exitTimer   = null;

  function showExitToast() {
    if (window.showToast) {
      window.showToast('⬅️ Appuyez encore pour quitter l\'application', '#4A4A6A');
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
  }

  function handleExitAttempt() {
    if (_exitPending) {
      // 2e appui dans les 5 s → quitter
      clearTimeout(_exitTimer);
      _exitPending = false;
      try { window.close(); } catch (_) {}
      return;
    }
    // 1er appui → notification + garde-fou history
    _exitPending = true;
    showExitToast();
    // Repousser un état pour intercepter le prochain popstate
    history.pushState({ omniGuard: true }, '');
    _exitTimer = setTimeout(function () {
      _exitPending = false;
    }, 5000);
  }

  /* ──────────────────────────────────────────
     GESTIONNAIRE popstate
  ────────────────────────────────────────── */

  window.addEventListener('popstate', function (e) {

    // Annuler la confirmation de sortie si l'utilisateur navigue vers l'avant
    // (ne s'applique pas ici car popstate = retour, mais reset si DOM a changé)

    const acted = doBack();

    if (acted) {
      // On a effectué une navigation interne → repousser le garde-fou
      history.pushState({ omniGuard: true }, '');
    } else {
      // Aucune action possible → tentative de sortie
      handleExitAttempt();
    }
  });

  /* ──────────────────────────────────────────
     ÉTAT INITIAL
  ────────────────────────────────────────── */

  // Poser un seul état pushState dès le départ pour que le premier
  // appui sur Retour déclenche popstate plutôt que de quitter le navigateur.
  function init() {
    history.replaceState({ omniBase: true }, '');
    history.pushState({ omniGuard: true }, '');
    console.log('[BackNav v2] Initialisé — retour natif géré.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
