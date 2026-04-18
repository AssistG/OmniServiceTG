/* ══════════════════════════════════════════
   OmniService TG — back-navigation.js
   Gestion du bouton Retour (Android / PWA)
   ── À inclure dans index.html APRÈS app.js ──
   ══════════════════════════════════════════

   FONCTIONNEMENT :
   • Chaque transition de vue/onglet pousse une entrée dans l'historique
     HTML5 (history.pushState) et dans la pile interne _navStack.
   • Le bouton retour natif (popstate) dépile la pile et exécute l'action
     retour appropriée.
   • Depuis l'accueil (page d'accueil + vue list) : le premier appui
     affiche un toast/notification "Appuyez encore pour quitter".
     Un second appui dans les 5 secondes ferme l'application.
   • Tous les overlays/modals ouverts sont fermés en priorité.
*/

(function () {
  'use strict';

  /* ──────────────────────────────────────────
     1. PILE DE NAVIGATION INTERNE
     ────────────────────────────────────────── */

  // Chaque entrée : { type, action }
  // type   : 'tab' | 'view' | 'overlay'
  // action : fonction sans argument à exécuter pour revenir en arrière
  const _navStack = [];

  // Compteur pour identifier les états history.pushState
  let _historyDepth = 0;

  /**
   * Pousser un état dans la pile (à appeler juste après chaque navigation).
   * @param {string}   type   - 'tab', 'view' ou 'overlay'
   * @param {Function} action - ce que fait le bouton retour
   * @param {string}   label  - label de debug (optionnel)
   */
  function navPush(type, action, label) {
    _historyDepth++;
    history.pushState({ omni: _historyDepth, label: label || '' }, '');
    _navStack.push({ type, action, label: label || '' });
  }
  window._navPush = navPush; // exposé pour usage depuis app.js si nécessaire

  /**
   * Vider la pile jusqu'à un niveau donné (ex: retour accueil).
   */
  function navClearStack() {
    _navStack.length = 0;
    _historyDepth = 0;
  }
  window._navClearStack = navClearStack;

  /* ──────────────────────────────────────────
     2. INTERCEPTION DES FONCTIONS DE NAVIGATION
        (monkey-patch des helpers globaux)
     ────────────────────────────────────────── */

  /* ── Attendre que app.js soit chargé ── */
  function patchNavigation() {

    /* ── goTab ── */
    const _origGoTab = window.goTab;
    window.goTab = function (id) {
      const prevId = _getCurrentTabId();
      _origGoTab(id);
      // Si on revient à l'accueil, vider la pile
      if (id === 'home') {
        navClearStack();
        return;
      }
      // Sinon pousser un état "revenir à l'onglet précédent ou à home"
      navPush('tab', function () {
        _origGoTab(prevId || 'home');
        if (!prevId || prevId === 'home') navClearStack();
      }, 'tab:' + id);
    };

    /* ── showView ── */
    const _origShowView = window.showView;
    window.showView = function (v) {
      const prevView = _getCurrentView();
      _origShowView(v);
      // La vue 'list' est la racine de la page services → pas d'empilement
      if (v === 'list') {
        // Dépiler jusqu'aux entrées de type 'view' (garder les 'tab')
        while (_navStack.length && _navStack[_navStack.length - 1].type === 'view') {
          _navStack.pop();
        }
        return;
      }
      // Sinon pousser
      navPush('view', function () {
        _origShowView(prevView || 'list');
      }, 'view:' + v);
    };

    /* ── openService ── */
    const _origOpenService = window.openService;
    window.openService = function (id) {
      _origOpenService(id);
    };
    // openService appelle showView/showImmoSubMenu etc. en interne,
    // donc le patch showView ci-dessus suffit.

    /* ── showImmoSubMenu ── */
    const _origShowImmoSubMenu = window.showImmoSubMenu;
    if (_origShowImmoSubMenu) {
      window.showImmoSubMenu = function () {
        const prevView = _getCurrentView();
        _origShowImmoSubMenu();
        navPush('view', function () {
          if (prevView && prevView !== 'kits') {
            window.showView(prevView);
          } else {
            window.showView('list');
          }
        }, 'view:immo-submenu');
      };
    }

    /* ── openImmoCategory ── */
    const _origOpenImmoCategory = window.openImmoCategory;
    if (_origOpenImmoCategory) {
      window.openImmoCategory = function (...args) {
        _origOpenImmoCategory(...args);
        // pushState déjà géré par showView patch (immo-options)
      };
    }

    /* ── openImmoForm ── */
    const _origOpenImmoForm = window.openImmoForm;
    if (_origOpenImmoForm) {
      window.openImmoForm = function (...args) {
        _origOpenImmoForm(...args);
        // pushState déjà géré par showView patch (immo-form)
      };
    }

    /* ── openImmoService (catalogue immo) ── */
    const _origOpenImmoService = window.openImmoService;
    if (_origOpenImmoService) {
      window.openImmoService = function (...args) {
        _origOpenImmoService(...args);
        // pushState déjà géré par showView patch
      };
    }

    /* ── showTogoExpertiseMenu ── */
    const _origTogoMenu = window.showTogoExpertiseMenu;
    if (_origTogoMenu) {
      window.showTogoExpertiseMenu = function (...args) {
        _origTogoMenu(...args);
        // déjà géré via showView (immo-options)
      };
    }

    /* ── openConsultancesSubService ── */
    const _origConsultSub = window.openConsultancesSubService;
    if (_origConsultSub) {
      window.openConsultancesSubService = function (...args) {
        _origConsultSub(...args);
        // déjà géré via showView (immo-form ou immo-options)
      };
    }
  }

  /* ──────────────────────────────────────────
     3. DÉTECTION DE LA VUE / ONGLET ACTIF
     ────────────────────────────────────────── */

  function _getCurrentTabId() {
    const active = document.querySelector('.page.on');
    if (!active) return 'home';
    return active.id.replace('p-', '');
  }

  function _getCurrentView() {
    const views = ['list','restaurants','kits','kit-detail','immo-options','immo-form','catalogue','form','delivery','payment','success'];
    for (const v of views) {
      const el = document.getElementById('view-' + v);
      if (el && el.style.display !== 'none' && el.style.display !== '') return v;
    }
    return null;
  }

  /* ──────────────────────────────────────────
     4. FERMETURE DES OVERLAYS OUVERTS
     ────────────────────────────────────────── */

  /**
   * Vérifie si un overlay/modal est ouvert et le ferme.
   * Retourne true si un overlay a été fermé.
   */
  function _closeTopOverlay() {
    // Auth modal
    const authModal = document.getElementById('auth-modal');
    if (authModal && authModal.style.display === 'flex') {
      if (window.closeAuthModal) window.closeAuthModal();
      return true;
    }

    // Composable builder overlay
    const compBuilder = document.getElementById('composable-builder-overlay');
    if (compBuilder && compBuilder.style.display !== 'none' && compBuilder.style.display !== '') {
      compBuilder.style.display = 'none';
      return true;
    }

    // Payment modals
    for (const mid of ['modal-tmoney', 'modal-flooz']) {
      const m = document.getElementById(mid);
      if (m && m.style.display === 'flex') {
        if (window.closePayModal) window.closePayModal(mid);
        else m.style.display = 'none';
        return true;
      }
    }

    // Overlays dynamiques (gardiennage, gestion, assistance, etc.)
    const dynamicOverlays = [
      'security-type-overlay',
      'gestion-loc-overlay',
      'assistance-overlay',
    ];
    for (const oid of dynamicOverlays) {
      const el = document.getElementById(oid);
      if (el) { el.remove(); return true; }
    }

    // Tout overlay générique visible fixé en position:fixed avec z-index élevé
    const allFixed = document.querySelectorAll('[style*="position:fixed"], [style*="position: fixed"]');
    for (const el of allFixed) {
      const z = parseInt(window.getComputedStyle(el).zIndex, 10);
      const isVisible = el.style.display !== 'none' && el.offsetParent !== null;
      if (isVisible && z >= 999 && el.id !== 'splash-screen' && el.id !== 'toast' && el.id !== 'pwa-banner') {
        el.remove();
        return true;
      }
    }

    return false;
  }

  /* ──────────────────────────────────────────
     5. LOGIQUE D'ACCUEIL + CONFIRMATION SORTIE
     ────────────────────────────────────────── */

  let _exitConfirmPending = false;
  let _exitConfirmTimer   = null;

  /** Vrai si l'utilisateur est sur la page d'accueil (onglet home) */
  function _isOnHome() {
    const tab = _getCurrentTabId();
    return tab === 'home';
  }

  /** Affiche la notification / toast de confirmation de sortie */
  function _showExitNotification() {
    // Utiliser showToast si disponible
    if (window.showToast) {
      window.showToast('⬅️ Appuyez encore pour quitter l\'application', '#4A4A6A');
    }
    // Tenter aussi une notification système si la permission est accordée
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('OmniService TG', {
          body: 'Appuyez encore sur Retour pour quitter l\'application.',
          icon: '/assets/logo.png',
          tag:  'exit-confirm',
          requireInteraction: false,
          silent: true,
        });
      } catch (_) { /* silencieux */ }
    }
  }

  /** Initier la séquence double-appui pour quitter */
  function _handleExitAttempt() {
    if (_exitConfirmPending) {
      // Deuxième appui dans les 5s → sortir
      _clearExitConfirm();
      _exitApp();
      return;
    }

    // Premier appui → notification et attente
    _exitConfirmPending = true;
    _showExitNotification();

    _exitConfirmTimer = setTimeout(function () {
      _exitConfirmPending = false;
      _exitConfirmTimer   = null;
    }, 5000);

    // Repousser un état dans l'historique pour rester sur la page
    history.pushState({ omni: 'exit-guard' }, '');
  }

  function _clearExitConfirm() {
    _exitConfirmPending = false;
    if (_exitConfirmTimer) {
      clearTimeout(_exitConfirmTimer);
      _exitConfirmTimer = null;
    }
  }

  /** Fermer la PWA / l'onglet */
  function _exitApp() {
    // Sur Android PWA, window.close() fonctionne en mode standalone
    // Sur navigateur desktop, cela peut être bloqué — on redirige vers about:blank en fallback
    try {
      window.close();
    } catch (_) {}
    // Fallback : naviguer vers l'extérieur (page vierge)
    setTimeout(function () {
      // Si window.close() a échoué (navigateur), on ne fait rien
      // pour ne pas perturber l'expérience web normale
    }, 200);
  }

  /* ──────────────────────────────────────────
     6. GESTIONNAIRE popstate (bouton retour)
     ────────────────────────────────────────── */

  window.addEventListener('popstate', function (e) {
    // Annuler la confirmation de sortie si un retour se produit
    // alors qu'un overlay est ouvert ou qu'on n'est pas sur home
    if (!_isOnHome() || _navStack.length > 0) {
      _clearExitConfirm();
    }

    // 1. Fermer un overlay/modal ouvert en priorité
    if (_closeTopOverlay()) {
      // Repousser un état pour maintenir la profondeur
      history.pushState({ omni: _historyDepth }, '');
      return;
    }

    // 2. Dépiler la pile de navigation interne
    if (_navStack.length > 0) {
      const entry = _navStack.pop();
      try {
        entry.action();
      } catch (err) {
        console.warn('[BackNav] Erreur action retour :', err);
      }
      return;
    }

    // 3. Pile vide → l'utilisateur est à la racine
    if (_isOnHome()) {
      _handleExitAttempt();
    } else {
      // Page non-home mais pile vide → retourner à l'accueil
      if (window.goTab) window.goTab('home');
      navClearStack();
    }
  });

  /* ──────────────────────────────────────────
     7. ÉTAT INITIAL DANS L'HISTORIQUE
     ────────────────────────────────────────── */

  // Pousser un état de base pour que le premier popstate soit intercepté
  // et non pas géré par le navigateur (fermeture ou navigation arrière réelle)
  if (!history.state || !history.state.omni) {
    history.replaceState({ omni: 0, label: 'home' }, '');
  }

  /* ──────────────────────────────────────────
     8. LANCEMENT APRÈS DOM PRÊT
     ────────────────────────────────────────── */

  function init() {
    patchNavigation();

    // S'assurer que le premier état est bien posé
    history.replaceState({ omni: 0, label: 'home' }, '');

    console.log('[BackNav] Module de navigation arrière initialisé.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM déjà prêt (script chargé en fin de body)
    // Attendre app.js qui charge en module (async)
    setTimeout(init, 300);
  }

})();
