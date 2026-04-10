/* ══════════════════════════════════════════
   OmniService TG — app.js v4.0
   + Authentification complète (Inscription/Connexion)
   + Commandes liées au compte utilisateur (UID)
   + Avatars homme/femme
   + Suppression du téléphone dans les formulaires de commande
   ══════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, where,
  getDocs, orderBy, serverTimestamp, doc, setDoc, getDoc, onSnapshot, deleteDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── Config Firebase ──
const firebaseConfig = {
  apiKey: "AIzaSyD8SidnsUkDMbIc9jA1qxBbuaZpuThNbMI",
  authDomain: "omniservicetg-17bac.firebaseapp.com",
  projectId: "omniservicetg-17bac",
  storageBucket: "omniservicetg-17bac.firebasestorage.app",
  messagingSenderId: "521668188454",
  appId: "1:521668188454:web:faa4df2aa0aee5595209e7"
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);
const auth  = getAuth(fbApp);

// Exposer pour le polling de notifications (depuis index.html inline script)
window._firestoreDb    = db;
window._firestoreUtils = { collection, query, where, getDocs, orderBy, onSnapshot };
window._onSnapshot = onSnapshot;

// ════════════════════════════════════════
// FIREBASE AUTH — SESSION ANONYME PERSISTANTE
// ════════════════════════════════════════
// Firebase Auth garde automatiquement l'UID anonyme dans IndexedDB entre les sessions.
// Cela satisfait request.auth != null dans toutes les règles Firestore.
// L'UID anonyme est STABLE : le même utilisateur garde le même UID anonyme après refresh.

let _firebaseUid = null; // UID Firebase Auth (anonyme, stable entre sessions)

// Promesse résolue dès que Firebase Auth est prêt (au plus 5s)
const _authReady = new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Utilisateur anonyme déjà en session (après refresh) → on réutilise
      _firebaseUid = user.uid;
      unsub();
      resolve(user);
    } else {
      // Pas encore de session → créer une session anonyme
      try {
        const cred = await signInAnonymously(auth);
        _firebaseUid = cred.user.uid;
        resolve(cred.user);
      } catch(e) {
        console.error('[FirebaseAuth] signInAnonymously échoué:', e.message);
        resolve(null);
      }
    }
  });
  // Sécurité : résoudre après 6s max pour ne pas bloquer indéfiniment
  setTimeout(() => resolve(null), 6000);
});

// S'assurer que Firebase Auth est prêt avant toute requête Firestore
async function ensureAuth() {
  return await _authReady;
}

// ════════════════════════════════════════
// ÉTAT GLOBAL
// ════════════════════════════════════════
let currentUser       = null;   // profil Firestore de l'utilisateur connecté
let currentService    = null;
let currentRestaurant = null;         // restaurant sélectionné dans la vue Restaurants
let cart              = {};
window.cart = cart; // Exposer pour localisation-module.js
let locMode           = 'gps';
let gpsCoords         = null;
let selectedPayment   = 'livraison';
let sliderIdx         = 0;
let sliderTimer       = null;

const CATALOGUE_SERVICES = [
  'food', 'clothes', 'omni_drink', 'marketplace',
  'immo_construction', 'immo_appart_louer', 'immo_appart_vendre',
  'immo_terrain_louer', 'immo_terrain_vendre',
  'immo_commercial_louer', 'immo_commercial_vendre',
  'immo_evenementiel', 'immo_courte_duree',
  // location_assistance géré par le patch openService dans index.html
];
const RESTAURANT_SERVICE = 'restaurant'; // service spécial avec vue par restaurant
const KITS_SERVICE = 'kits'; // service spécial avec vue liste kits + détail
const PACKS_SERVICES = ['mathivick', 'omega_conseil']; // services avec packs
const TOGO_EXPERTISE_SERVICE = 'togo_expertise'; // service enveloppe pour Mathivick & Omega Conseils
const IMMOBILIER_SERVICE = 'immobilier'; // service immobilier avec flux spécifique

// ════════════════════════════════════════
// SPLASH SCREEN
// ════════════════════════════════════════
function hideSplash() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  splash.classList.add('hidden');
  setTimeout(() => { splash.style.display = 'none'; }, 500);
}

// Masquer le splash dès que Firebase Auth EST PRÊT (ou après 7s max)
// On attend au minimum 2s pour l'animation, puis on attend _authReady.
Promise.all([
  _authReady,
  new Promise(r => setTimeout(r, 2000))
]).then(() => hideSplash())
  .catch(() => hideSplash()); // sécurité : masquer même en cas d'erreur

// ════════════════════════════════════════
// PWA
// ════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Chemin relatif obligatoire pour GitHub Pages (sous-dossier /OmniServiceTG/)
    // '/sw.js' cherche à la racine du domaine → 404
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(r => console.log('[PWA] SW enregistré, scope :', r.scope))
      .catch(e => console.warn('[PWA] SW erreur :', e));
  });
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  setTimeout(() => {
    const banner = document.getElementById('pwa-banner');
    if (banner && !localStorage.getItem('pwa-dismissed')) banner.style.display = 'block';
  }, 4000);
});

document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('pwa-banner').style.display = 'none';
  if (result.outcome === 'accepted') showToast('✅ OmniService TG installé !', '#2E7D32');
});

function dismissPWA() {
  document.getElementById('pwa-banner').style.display = 'none';
  localStorage.setItem('pwa-dismissed', '1');
}
window.dismissPWA = dismissPWA;

window.addEventListener('appinstalled', () => {
  document.getElementById('pwa-banner').style.display = 'none';
  deferredPrompt = null;
});

// ════════════════════════════════════════
// AUTH — RESTAURATION DE SESSION (localStorage)
// ════════════════════════════════════════
// Flag pour éviter que la restauration de session interfère pendant inscription/connexion manuelle
let _authHandledManually = false;

async function restoreSession() {
  if (_authHandledManually) return;

  // Attendre que Firebase Auth soit prêt
  await ensureAuth();

  const savedUid = localStorage.getItem('omni_uid');
  if (!savedUid) {
    currentUser = null;
    updateNavForAuth(false);
    updateProfilePage();
    return;
  }

  try {
    // Lire le profil via une query sur uid (compatible multi-appareils)
    // La règle "allow list: if request.auth != null" autorise cela
    let snap = null;
    for (let i = 0; i < 3; i++) {
      const q = query(collection(db, 'users'), where('uid', '==', savedUid));
      const result = await getDocs(q);
      if (!result.empty) { snap = result.docs[0]; break; }
      await new Promise(r => setTimeout(r, 500));
    }
    if (snap) {
      currentUser = { uid: savedUid, ...snap.data() };
    } else {
      localStorage.removeItem('omni_uid');
      currentUser = null;
    }
  } catch(e) {
    console.error('[restoreSession] Erreur Firestore:', e.message);
    currentUser = null;
  }

  updateNavForAuth(!!currentUser);
  updateProfilePage();
  if (currentUser && document.getElementById('p-orders')?.classList.contains('on')) {
    loadMyOrders();
  }
}

// Lancer la restauration de session au démarrage
restoreSession();

// ── Mettre à jour la navigation selon l'état auth ──
function updateNavForAuth(isLoggedIn) {
  const btnProfile = document.getElementById('nav-btn-profile');
  if (!btnProfile) return;
  if (isLoggedIn && currentUser) {
    const avatar = currentUser.genre === 'femme' ? '👩' : '👨';
    btnProfile.textContent = avatar;
    btnProfile.title = currentUser.prenom || 'Mon profil';
  } else {
    btnProfile.textContent = '👤';
    btnProfile.title = 'Connexion / Inscription';
  }
  // Exposer currentUser pour le système de notifications
  window._currentUser = currentUser;
  // Démarrer/arrêter l'écoute temps réel des commandes
  if (isLoggedIn && currentUser) {
    startOrderStatusListener();
  } else {
    stopOrderStatusListener();
  }
}

// ════════════════════════════════════════
// AUTH MODAL — Afficher/Fermer
// ════════════════════════════════════════
function openAuthModal(mode = 'login') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  switchAuthTab(mode);
}
window.openAuthModal = openAuthModal;

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
}
window.closeAuthModal = closeAuthModal;

function switchAuthTab(tab) {
  document.getElementById('auth-login-panel').style.display  = tab === 'login'    ? 'block' : 'none';
  document.getElementById('auth-signup-panel').style.display = tab === 'signup'   ? 'block' : 'none';
  document.getElementById('auth-tab-login').classList.toggle('on',  tab === 'login');
  document.getElementById('auth-tab-signup').classList.toggle('on', tab === 'signup');
  document.getElementById('auth-err').textContent = '';
}
window.switchAuthTab = switchAuthTab;

// ── CONNEXION PAR TÉLÉPHONE ──
async function doLogin() {
  const phone = document.getElementById('login-phone').value.trim();
  const err   = document.getElementById('auth-err');
  const btn   = document.getElementById('login-btn');

  if (!phone) { err.textContent = '⚠️ Veuillez saisir votre numéro de téléphone.'; return; }

  const phoneNorm = phone.replace(/[\s\-().]/g, '');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Connexion...';
  err.textContent = '';

  try {
    // Attendre Firebase Auth avec retry robuste pour les nouveaux appareils
    let firebaseUser = await ensureAuth();
    if (!firebaseUser) {
      await new Promise(r => setTimeout(r, 3000));
      firebaseUser = await new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (u) => {
          if (u) { unsub(); resolve(u); }
        });
        setTimeout(() => { unsub(); resolve(null); }, 5000);
      });
    }
    if (!firebaseUser) {
      err.textContent = '❌ Connexion Firebase impossible. Vérifiez votre réseau.';
      return;
    }
    _firebaseUid = firebaseUser.uid;

    // Chercher le compte dans Firestore par numéro de téléphone
    // La règle "allow list: if request.auth != null" permet cette requête
    const q = query(collection(db, 'users'), where('phone', '==', phoneNorm));
    const snap = await getDocs(q);

    if (snap.empty) {
      err.textContent = '❌ Aucun compte trouvé avec ce numéro. Inscrivez-vous.';
      return;
    }

    const userDoc  = snap.docs[0];
    const userData = userDoc.data();
    const existingUid = userDoc.id;

    _authHandledManually = true;

    // Mettre à jour currentUser immédiatement
    currentUser = { uid: existingUid, ...userData };

    // Sauvegarder la session en local
    localStorage.setItem('omni_uid', existingUid);

    // Réactiver onAuthStateChanged
    _authHandledManually = false;

    // Mettre à jour l'interface
    updateNavForAuth(true);
    updateProfilePage();
    closeAuthModal();
    showToast('✅ Connecté avec succès !', '#2E7D32');

  } catch(e) {
    _authHandledManually = false;
    err.textContent = '❌ Erreur : ' + e.message;
    console.error('[doLogin]', e);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Se connecter →';
  }
}
window.doLogin = doLogin;

// ── INSCRIPTION PAR TÉLÉPHONE ──
async function doSignup() {
  const nom    = document.getElementById('signup-nom').value.trim();
  const prenom = document.getElementById('signup-prenom').value.trim();
  const genre  = document.getElementById('signup-genre').value;
  const phone  = document.getElementById('signup-phone').value.trim();
  const ville  = document.getElementById('signup-ville').value.trim();
  const err    = document.getElementById('auth-err');
  const btn    = document.getElementById('signup-btn');

  if (!nom || !prenom || !genre || !phone || !ville) {
    err.textContent = '⚠️ Veuillez remplir tous les champs.'; return;
  }

  // Normaliser le numéro
  const phoneNorm = phone.replace(/[\s\-().]/g, '');
  if (phoneNorm.length < 8) {
    err.textContent = '⚠️ Numéro de téléphone invalide.'; return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Inscription...';
  err.textContent = '';

  try {
    // Attendre Firebase Auth avec retry robuste pour les nouveaux appareils
    let firebaseUser = await ensureAuth();
    if (!firebaseUser) {
      await new Promise(r => setTimeout(r, 3000));
      firebaseUser = await new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (u) => {
          if (u) { unsub(); resolve(u); }
        });
        setTimeout(() => { unsub(); resolve(null); }, 5000);
      });
    }
    if (!firebaseUser) {
      err.textContent = '❌ Impossible de joindre Firebase. Vérifiez votre connexion internet.';
      return;
    }

    // Vérifier si le numéro est déjà utilisé
    const q = query(collection(db, 'users'), where('phone', '==', phoneNorm));
    const existing = await getDocs(q);
    if (!existing.empty) {
      err.textContent = '❌ Ce numéro est déjà enregistré. Connectez-vous.';
      return;
    }

    _authHandledManually = true;

    // L'UID du document = l'UID Firebase Auth anonyme.
    // Cela satisfait : allow create: if request.auth.uid == uid
    // Et permet à request.auth.uid == resource.data.uid dans /commandes
    const newUid = firebaseUser.uid;

    // Profil complet à sauvegarder
    const profil = {
      nom, prenom, genre,
      phone: phoneNorm,
      ville,
      uid: newUid,
      createdAt: serverTimestamp()
    };

    // Sauvegarder dans Firestore
    await setDoc(doc(db, 'users', newUid), profil);

    // Mettre à jour currentUser immédiatement (sans attendre Firestore)
    currentUser = { uid: newUid, nom, prenom, genre, phone: phoneNorm, ville };

    // Sauvegarder la session en local
    localStorage.setItem('omni_uid', newUid);

    // Réactiver onAuthStateChanged
    _authHandledManually = false;

    // Mettre à jour l'interface
    updateNavForAuth(true);
    updateProfilePage();
    closeAuthModal();
    showToast(`✅ Bienvenue ${prenom} !`, '#2E7D32');

  } catch(e) {
    _authHandledManually = false;
    err.textContent = '❌ Erreur : ' + e.message;
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = "S'inscrire →";
  }
}
window.doSignup = doSignup;

// ── DÉCONNEXION ──
async function doLogout() {
  localStorage.removeItem('omni_uid');
  currentUser = null;
  updateNavForAuth(false);
  updateProfilePage();
  showToast('👋 Déconnecté.', '#4A4A6A');
  goTab('home');
}
window.doLogout = doLogout;

// ════════════════════════════════════════
// PAGE PROFIL
// ════════════════════════════════════════
function updateProfilePage() {
  const heroAvatar = document.getElementById('prof-avatar');
  const heroName   = document.getElementById('prof-name-disp');
  const heroSub    = document.getElementById('prof-phone-disp');
  const profCard   = document.getElementById('prof-logged-card');
  const authCard   = document.getElementById('prof-auth-card');

  if (currentUser) {
    const avatar = currentUser.genre === 'femme' ? '👩' : '👨';
    if (heroAvatar) heroAvatar.textContent = avatar;
    if (heroName)   heroName.textContent   = `${currentUser.prenom || ''} ${currentUser.nom || ''}`.trim() || 'Mon Profil';
    if (heroSub)    heroSub.textContent    = currentUser.phone || currentUser.email || '';
    if (profCard)   profCard.style.display = 'block';
    if (authCard)   authCard.style.display = 'none';
    // Remplir les champs info
    const fi = {
      'pf-nom':    currentUser.nom    || '',
      'pf-prenom': currentUser.prenom || '',
      'pf-phone':  currentUser.phone  || '',
      'pf-ville':  currentUser.ville  || '',
      'pf-email':  currentUser.email  || '',
    };
    Object.entries(fi).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    });
    // Afficher la ville dans le sous-titre
    if (heroSub && currentUser.ville) {
      heroSub.textContent = `📍 ${currentUser.ville} · ${currentUser.phone || ''}`;
    }
  } else {
    if (heroAvatar) heroAvatar.textContent = '👤';
    if (heroName)   heroName.textContent   = 'Mon Profil';
    if (heroSub)    heroSub.textContent    = 'Connectez-vous pour accéder à votre compte';
    if (profCard)   profCard.style.display = 'none';
    if (authCard)   authCard.style.display = 'block';
  }
}

async function saveProfile() {
  if (!currentUser) { openAuthModal('login'); return; }
  const nom    = document.getElementById('pf-nom').value.trim();
  const prenom = document.getElementById('pf-prenom').value.trim();
  const phone  = document.getElementById('pf-phone').value.trim();
  const ville  = document.getElementById('pf-ville').value.trim();

  try {
    await setDoc(doc(db, 'users', currentUser.uid), { nom, prenom, phone, ville }, { merge: true });
    currentUser = { ...currentUser, nom, prenom, phone, ville };
    updateProfilePage();
    updateNavForAuth(true);
    showToast('✅ Profil mis à jour !', '#2E7D32');
  } catch(e) {
    showToast('❌ Erreur de sauvegarde.', '#C62828');
  }
}
window.saveProfile = saveProfile;

// ════════════════════════════════════════
// DÉFINITION DES SERVICES
// (sans champ phone — récupéré depuis le profil)
// ════════════════════════════════════════
const SVCS = {
  // Services lancés le 16 mars 2026
  food: {
    name:"Alimentation générale et produits locaux", icon:"🛒", bg:"#FFF3E0", active:false, soon:"16 Mars 2026",
    fields:[
      {n:"produits",l:"Produits souhaités",t:"textarea",ph:"Ex : 2 kg de Tilapia, 1 bouteille de vin de palme..."},
      {n:"adresse",l:"Adresse de livraison",t:"text",ph:"Votre adresse à Lomé"},
      {n:"date",l:"Date souhaitée",t:"date"},
      {n:"notes",l:"Remarques (optionnel)",t:"textarea",ph:"Précisions...",opt:true}
    ]
  },
  restaurant: {
    name:"Restaurants", icon:"🍽️", bg:"#E3F2FD", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  delivery: {
    name:"Livraison et courses", icon:"🚗", bg:"#FFF3E0", active:false, soon:"16 Mars 2026",
    fields:[
      {n:"type",l:"Type",t:"select",opts:["Livraison express","Courses personnalisées","Livraison entreprise","Livraison de plats"]},
      {n:"detail",l:"Lieu de collecte / Liste d'articles",t:"textarea",ph:"Adresse ou liste..."},
      {n:"adresse",l:"Adresse de livraison",t:"text",ph:"Votre adresse à Lomé"},
      {n:"urgence",l:"Urgence",t:"select",opts:["Express (< 1h)","Dans la journée","Planifier"]}
    ]
  },
  maintenance: {
    name:"Dépannage", icon:"🔧", bg:"#E3F2FD", active:false, soon:"16 Mars 2026",
    fields:[
      {n:"type",l:"Type d'intervention",t:"select",opts:["Électricité","Plomberie","Climatisation","Électroménager","Informatique","Pose TV/Antenne","Autres travaux"]},
      {n:"problem",l:"Description du problème",t:"textarea",ph:"Décrivez le problème..."},
      {n:"adresse",l:"Adresse",t:"text",ph:"Votre adresse à Lomé"}
    ]
  },
  immobilier: {
    name:"Service Immobilier", icon:"🏢", bg:"#E8F5E9", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  // ── Sous-services immobilier (catalogue d'articles) ──
  immo_construction: {
    name:"Nouvelles constructions", icon:"🏗️", bg:"#E8F5E9", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  immo_appart_louer: {
    name:"Maisons & appartements à louer", icon:"🏠", bg:"#E8F5E9", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  immo_appart_vendre: {
    name:"Maisons & appartements à vendre", icon:"🏡", bg:"#E8F5E9", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  immo_terrain_louer: {
    name:"Terrains & parcelles à louer", icon:"🌿", bg:"#E8F5E9", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  immo_terrain_vendre: {
    name:"Terrains & parcelles à vendre", icon:"🗺️", bg:"#E8F5E9", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  immo_commercial_louer: {
    name:"Propriété commerciale à louer", icon:"🏪", bg:"#E8F5E9", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  immo_commercial_vendre: {
    name:"Propriété commerciale à vendre", icon:"🏬", bg:"#E8F5E9", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  immo_evenementiel: {
    name:"Centres événementiels & lieux", icon:"🎪", bg:"#E8F5E9", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  immo_courte_duree: {
    name:"Propriété en location courte durée", icon:"🛏️", bg:"#E8F5E9", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  // ── Location & Assistance (service principal depuis l'accueil) ──
  location_assistance: {
    name:"Location & Assistance", icon:"🤝", bg:"#EDE7F6", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  // ── Sous-services Immobilier (sélection de type) ──
  immo_assistance: {
    name:"Assistance Immobilière", icon:"🤝", bg:"#EDE7F6", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  immo_gestion: {
    name:"Gestion Locative", icon:"🏛️", bg:"#FFF3E0", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  togo_expertise: {
    name:"Consultances/Expertises", icon:"🧑‍💼", bg:"#EDE7F6", active:false, soon:"16 Mars 2026",
    fields:[]
  },

  // Services lancés le 07 avril 2026
  clothes: {
    name:"Prêt-à-porter", icon:"👗", bg:"#FFF3E0", active:false, soon:"07 Avril 2026",
    fields:[]
  },
  cleaning: {
    name:"Nettoyage professionnel", icon:"✨", bg:"#E3F2FD", active:false, soon:"07 Avril 2026",
    fields:[
      {n:"type",l:"Type",t:"select",opts:["Nettoyage résidentiel","Nettoyage bureaux","Entretien régulier","Entretien industriel"]},
      {n:"superficie",l:"Superficie (m²)",t:"number",ph:"Ex : 60"},
      {n:"adresse",l:"Adresse",t:"text",ph:"Votre adresse à Lomé"},
      {n:"date",l:"Date souhaitée",t:"date"}
    ]
  },
  kits: {
    name:"Kits & Packs", icon:"📦", bg:"#E8F5E9", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  
  // Services lancés le 07 avril 2026
  mathivick: {
    name:"Mathivick - Formation Commerciale", icon:"🚀", bg:"#FFF3E0", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  omega_conseil: {
    name:"Omega Conseils - Consultances", icon:"💼", bg:"#E3F2FD", active:false, soon:"16 Mars 2026",
    fields:[]
  },
  
  security: {
    name:"Gardiennage & Sécurité", icon:"🛡️", bg:"#E3F2FD", active:false, soon:"7 Avril 2026",
    fields:[
      {n:"type",l:"Type",t:"select",opts:["Gardiennage Résidentiel","Gardiennage Boutique","Sécurité Événementielle","Surveillance Temporaire"]},
      {n:"detail",l:"Description du besoin",t:"textarea",ph:"Vos besoins en sécurité..."},
      {n:"adresse",l:"Lieu / Adresse",t:"text",ph:"Votre adresse à Lomé"}
    ]
  },
  traiteur: {
    name:"Service Traiteur", icon:"🍽️", bg:"#FFF8E1", active:false, soon:"07 Avril 2026",
    fields:[
      {n:"type_event",l:"Type d'événement",t:"select",opts:["Anniversaire","Fête de famille","Mariage / Cérémonie","Baptême / Communion","Événement d'entreprise","Fête nationale / Culturelle","Autre événement"]},
      {n:"description",l:"Description de l'événement",t:"textarea",ph:"Date, lieu, thème, nombre de personnes, type de repas..."},
      {n:"nb_personnes",l:"Nombre de personnes",t:"number",ph:"Ex : 50"},
      {n:"date",l:"Date de l'événement",t:"date"},
      {n:"budget",l:"Budget estimé (optionnel)",t:"text",ph:"Ex : 150 000 FCFA",opt:true},
      {n:"notes",l:"Remarques (optionnel)",t:"textarea",ph:"Allergies, restrictions alimentaires...",opt:true}
    ]
  },
  omni_drink: {
    name:"Omni Drink TG", icon:"🍾", bg:"#E0F7FA", active:false, soon:"07 Avril 2026",
    fields:[]
  },
  marketplace: {
    name:"Marketplace — Articles divers", icon:"🛍️", bg:"#FCE4EC", active:false, soon:"16 Mars 2026",
    fields:[]
  }
};

// ════════════════════════════════════════
// AUTOMATISATION DES DATES DE LANCEMENT
// Active automatiquement les services dont la date soon est passée
// + Masque les badges "soon" dans le HTML statique
// + Programme un timer pour minuit (sans rechargement)
// ════════════════════════════════════════

const MONTHS_FR_LAUNCH = {
  'Janvier':0,'Février':1,'Mars':2,'Avril':3,'Mai':4,'Juin':5,
  'Juillet':6,'Août':7,'Septembre':8,'Octobre':9,'Novembre':10,'Décembre':11
};

/** Parse "DD Mois YYYY" ou "DD Mois" → Date (minuit) ou null */
function parseSoonDate(soonStr) {
  if (!soonStr) return null;
  const parts = soonStr.replace(/[^a-zA-Z0-9éûôàè ]/gi, '').trim().split(/\s+/);
  if (parts.length < 3) return null;
  const day   = parseInt(parts[0], 10);
  const month = MONTHS_FR_LAUNCH[parts[1]];
  const year  = parseInt(parts[2], 10);
  if (isNaN(day) || month === undefined || isNaN(year)) return null;
  return new Date(year, month, day);
}

/** Active les services dont la date de lancement est atteinte */
function autoActivateServices() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  Object.values(SVCS).forEach(svc => {
    if (svc.active || !svc.soon) return;
    const launchDate = parseSoonDate(svc.soon);
    if (launchDate && today >= launchDate) {
      svc.active = true;
    }
  });
}

/** Masque les badges .svc-soon et .tag-soon pour les services déjà actifs */
function hideLaunchedBadges() {
  document.querySelectorAll('[onclick^="openService("]').forEach(btn => {
    const match = btn.getAttribute('onclick').match(/openService\('([^']+)'\)/);
    if (!match) return;
    const svc = SVCS[match[1]];
    if (svc && svc.active) {
      const s1 = btn.querySelector('.svc-soon');
      if (s1) s1.style.display = 'none';
      const s2 = btn.querySelector('.tag-soon');
      if (s2) s2.style.display = 'none';
    }
  });
}

/** Programme un réveil à 00:01 le jour du prochain lancement pour masquer les badges sans rechargement */
function scheduleBadgeRefresh() {
  // Trouver la prochaine date de lancement future
  const now = new Date();
  const futureDates = Object.values(SVCS)
    .filter(svc => !svc.active && svc.soon)
    .map(svc => parseSoonDate(svc.soon))
    .filter(d => d && d > now)
    .sort((a, b) => a - b);

  if (!futureDates.length) return; // tous les services sont déjà actifs

  const nextLaunch = futureDates[0];
  // Réveil à 00:01 le jour du prochain lancement
  const wakeUp = new Date(nextLaunch.getFullYear(), nextLaunch.getMonth(), nextLaunch.getDate(), 0, 1, 0);
  const msUntilWakeUp = wakeUp - now;

  if (msUntilWakeUp <= 0) return; // déjà passé

  setTimeout(() => {
    autoActivateServices();   // recalculer les actifs
    hideLaunchedBadges();     // masquer les badges correspondants
    scheduleBadgeRefresh();   // reprogrammer pour le prochain lancement (avril, etc.)
  }, msUntilWakeUp);
}

// ── Exécution initiale au chargement ──
autoActivateServices();
// hideLaunchedBadges() sera appelé après le chargement du DOM (voir DOMContentLoaded ci-dessous)
document.addEventListener('DOMContentLoaded', () => {
  hideLaunchedBadges();
  scheduleBadgeRefresh();
});

// ════════════════════════════════════════
// ARTICLES PAR DÉFAUT
// ════════════════════════════════════════
const DEFAULT_ARTICLES = {
  food: [], restaurant: [], clothes: [], omni_drink: [], marketplace: [],
  immo_construction: [], immo_appart_louer: [], immo_appart_vendre: [],
  immo_terrain_louer: [], immo_terrain_vendre: [],
  immo_commercial_louer: [], immo_commercial_vendre: [],
  immo_evenementiel: [], immo_courte_duree: [],
  location_assistance: []
};

// ════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════
function showToast(msg, color="#1A1A2E") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.style.background = color;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3200);
}

function fmt(n) {
  return Number(n).toLocaleString('fr-FR') + ' FCFA';
}

// ════════════════════════════════════════
// NAVIGATION TABS
// ════════════════════════════════════════
function goTab(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("on"));
  const page = document.getElementById("p-" + id);
  if (page) page.classList.add("on");
  document.querySelectorAll(".btab").forEach(b => b.classList.remove("on"));
  const bt = document.getElementById("t-" + id);
  if (bt) bt.classList.add("on");
  document.querySelectorAll(".nav-link").forEach(b => b.classList.remove("on"));
  const nl = document.getElementById("nl-" + id);
  if (nl) nl.classList.add("on");
  window.scrollTo({top:0,behavior:"smooth"});
  if (id === 'services') {
    if (!currentUser) {
      openAuthModal('login');
      showToast('⚠️ Connectez-vous pour accéder aux services', '#F5820A');
      // Rester sur home
      document.querySelectorAll(".page").forEach(p => p.classList.remove("on"));
      const homePage = document.getElementById("p-home");
      if (homePage) homePage.classList.add("on");
      document.querySelectorAll(".btab").forEach(b => b.classList.remove("on"));
      const homeTab = document.getElementById("t-home");
      if (homeTab) homeTab.classList.add("on");
      document.querySelectorAll(".nav-link").forEach(b => b.classList.remove("on"));
      const homeLink = document.getElementById("nl-home");
      if (homeLink) homeLink.classList.add("on");
      return;
    }
    showView('list');
  }
  if (id === 'orders') {
    if (!currentUser) {
      // Afficher un message pour se connecter
      const out = document.getElementById('orders-out');
      if (out) out.innerHTML = `
        <div class="orders-empty">
          <div class="orders-empty-ico">🔐</div>
          <div class="orders-empty-title">Connexion requise</div>
          <div class="orders-empty-sub">Connectez-vous pour voir vos commandes.</div>
          <button class="btn-primary" style="max-width:220px;margin:20px auto 0" onclick="openAuthModal('login')">Se connecter</button>
        </div>`;
    } else {
      loadMyOrders();
    }
  }
  if (id === 'profile') updateProfilePage();
}
window.goTab = goTab;

// ════════════════════════════════════════
// VUES INTERNES À LA PAGE SERVICES
// ════════════════════════════════════════
const VIEWS = ['list','restaurants','kits','kit-detail','immo-options','immo-form','catalogue','form','delivery','payment','success'];
function showView(v) {
  VIEWS.forEach(x => {
    const el = document.getElementById('view-'+x);
    if (el) el.style.display = x===v ? 'block' : 'none';
  });
  window.scrollTo({top:0,behavior:"smooth"});
}
window.showView = showView;

// ── Afficher la vue succès avec compte à rebours et bouton commandes ──
function showSuccessView() {
  showView('success');
  // Afficher le bouton "Voir mes commandes"
  const succBtn = document.getElementById('succ-view-orders-btn');
  if (succBtn) succBtn.style.display = 'block';
  // Démarrer le compte à rebours
  const cdEl = document.getElementById('succ-countdown');
  const rdEl = document.getElementById('succ-redirect-msg');
  if (rdEl) rdEl.style.display = 'block';
  let count = 5;
  if (cdEl) cdEl.textContent = count;
  const timer = setInterval(() => {
    count--;
    if (cdEl) cdEl.textContent = count;
    if (count <= 0) {
      clearInterval(timer);
      goTab('orders');
    }
  }, 1000);
}
window.showSuccessView = showSuccessView;

// ════════════════════════════════════════
// OUVRIR UN SERVICE
// ════════════════════════════════════════
function openService(id) {
  // Vérifier la connexion avant de commander
  if (!currentUser) {
    openAuthModal('login');
    showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A');
    return;
  }

  // Activer l'onglet services sans forcer showView('list')
  document.querySelectorAll(".page").forEach(p => p.classList.remove("on"));
  const page = document.getElementById("p-services");
  if (page) page.classList.add("on");
  document.querySelectorAll(".btab").forEach(b => b.classList.remove("on"));
  const bt = document.getElementById("t-services");
  if (bt) bt.classList.add("on");
  document.querySelectorAll(".nav-link").forEach(b => b.classList.remove("on"));
  const nl = document.getElementById("nl-services");
  if (nl) nl.classList.add("on");
  
  currentService = id;
  cart = {};

  // ── Cas spécial : service Gardiennage → formulaire direct avec select déroulant ──
  if (id === 'security') {
    if (typeof window.openSecurityDirectForm === 'function') {
      window.openSecurityDirectForm();
    } else {
      showSecurityTypeModal(); // fallback
    }
    return;
  }

  // ── Cas spécial : service Assistance Immobilière → formulaire direct avec select ──
  if (id === 'assistance_immo') {
    if (typeof window.openAssistanceDirectForm === 'function') {
      window.openAssistanceDirectForm();
    }
    return;
  }

  // ── Cas spécial : service Gestion Locative → formulaire direct avec select ──
  if (id === 'gestion_locative') {
    if (typeof window.openGestionLocativeDirectForm === 'function') {
      window.openGestionLocativeDirectForm();
    }
    return;
  }

  const svc = SVCS[id];
  if (!svc) return;

  // ── Cas spécial : service Kits/PACKS → vue liste des kits ──
  if (id === KITS_SERVICE) {
    document.getElementById('kits-svc-ico').style.background = svc.bg;
    document.getElementById('kits-svc-ico').textContent = svc.icon;
    document.getElementById('kits-svc-title').textContent = svc.name;
    loadKitsList();
    showView('kits');
    return;
  }

  // ── Cas spécial : service Restaurants → vue liste des restaurants ──
  if (id === RESTAURANT_SERVICE) {
    document.getElementById('rest-svc-ico').style.background = svc.bg;
    document.getElementById('rest-svc-ico').textContent = svc.icon;
    document.getElementById('rest-svc-title').textContent = svc.name;
    loadRestaurantsList();
    showView('restaurants');
    return;
  }

  // ── Cas spécial : service Kits & Packs ──
  if (id === KITS_SERVICE) {
    document.getElementById('kits-svc-ico').style.background = svc.bg;
    document.getElementById('kits-svc-ico').textContent = svc.icon;
    document.getElementById('kits-svc-title').textContent = svc.name;
    const titleEl = document.getElementById('kits-section-title');
    if (titleEl) titleEl.textContent = '📦 Nos kits disponibles';
    loadKitsList();
    showView('kits');
    return;
  }

  // ── Cas spécial : service Immobilier → sous-menu des catégories ──
  if (id === IMMOBILIER_SERVICE) {
    showImmoSubMenu();
    return;
  }

  // ── Cas spécial : TOGO Expertise → sous-menu Mathivick / Omega Conseils ──
  if (id === TOGO_EXPERTISE_SERVICE) {
    showTogoExpertiseMenu();
    return;
  }

  // ── Cas spécial : services avec système de packs (Mathivick, Omega Conseils) ──
  if (PACKS_SERVICES.includes(id)) {
    document.getElementById('kits-svc-ico').style.background = svc.bg;
    document.getElementById('kits-svc-ico').textContent = svc.icon;
    document.getElementById('kits-svc-title').textContent = svc.name;
    // Titre de section personnalisé par service
    const sectionTitles = {
      'mathivick': '🚀 Nos offres Mathivick',
      'omega_conseil': '💼 Nos packs Omega Conseils'
    };
    const titleEl = document.getElementById('kits-section-title');
    if (titleEl) titleEl.textContent = sectionTitles[id] || '📦 Nos offres';
    loadKitsList(id); // Charger les packs du service spécifique
    showView('kits');
    return;
  }

  if (CATALOGUE_SERVICES.includes(id)) {
    document.getElementById('cat-ico').style.background = svc.bg;
    document.getElementById('cat-ico').textContent = svc.icon;
    document.getElementById('cat-title').textContent = svc.name;
    // Bouton retour : vers sous-menu immo si service immo, sinon liste des services
    const backBtn = document.getElementById('catalogue-back-btn');
    if (backBtn) {
      const isImmoSub = id.startsWith('immo_'); // location_assistance retourne à la liste principale
      backBtn.onclick = isImmoSub ? () => showImmoSubMenu() : () => showView('list');
    }
    loadCatalogue(id);
    showView('catalogue');
  } else {
    document.getElementById('form-ico').style.background = svc.bg;
    document.getElementById('form-ico').textContent = svc.icon;
    document.getElementById('form-title').textContent = svc.name;
    const soonEl     = document.getElementById('form-soon');
    if (!svc.active && svc.soon) {
      soonEl.style.display = 'block';
      soonEl.innerHTML = `<div style="font-weight:700;font-size:13px;margin-bottom:3px">⏳ Bientôt disponible</div><div style="font-size:12px;opacity:.92">Opérationnel le ${svc.soon}. Vous pouvez déjà pré-enregistrer votre demande.</div>`;
    } else {
      soonEl.style.display = 'none';
    }
    let html = '';
    svc.fields.forEach(f => {
      const opt = f.opt ? ' <span style="font-weight:400;font-size:10px;color:#C5C5D8;text-transform:none">(optionnel)</span>' : '';
      html += `<label class="f-label">${f.l}${opt}</label>`;
      if (f.t === 'textarea') {
        html += `<textarea class="f-textarea" rows="3" placeholder="${f.ph||''}" id="ff-${f.n}"></textarea>`;
      } else if (f.t === 'select') {
        html += `<select class="f-select" id="ff-${f.n}"><option value="">— Choisir —</option>${f.opts.map(o=>`<option>${o}</option>`).join('')}</select>`;
      } else {
        html += `<input type="${f.t}" class="f-input" placeholder="${f.ph||''}" id="ff-${f.n}"/>`;
      }
    });
    document.getElementById('form-fields').innerHTML = html;
    showView('form');
  }
  
  window.scrollTo({top:0,behavior:"smooth"});
}
window.openService = openService;

// ════════════════════════════════════════
// GARDIENNAGE — MODAL DE SÉLECTION DU TYPE
// ════════════════════════════════════════
const SECURITY_TYPES = [
  { id:'gardiennage_residentiel',  label:'Gardiennage Résidentiel', emoji:'🏠', desc:'Maison, villa, appartement' },
  { id:'gardiennage_boutique',     label:'Gardiennage Boutique',    emoji:'🏪', desc:'Commerce, magasin, épicerie' },
  { id:'gardiennage_bureau',       label:'Gardiennage Bureau',      emoji:'🏢', desc:'Entreprise, bureau, agence' },
  { id:'securite_evenementielle',  label:'Sécurité Événementielle', emoji:'🎪', desc:'Mariage, fête, cérémonie' },
  { id:'surveillance_temporaire',  label:'Surveillance Temporaire', emoji:'🔒', desc:'Surveillance ponctuelle' },
];

function showSecurityTypeModal() {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  let existing = document.getElementById('security-type-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'security-type-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:24px 20px;max-width:400px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,0.2);max-height:90vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <div style="width:48px;height:48px;background:#E3F2FD;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;">🛡️</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:17px;color:#1A1A2E;">Gardiennage & Sécurité</div>
          <div style="font-size:12px;color:#9E9EC0;">Choisissez un type de service</div>
        </div>
        <button onclick="document.getElementById('security-type-overlay').remove()" style="background:none;border:none;font-size:22px;color:#9E9EC0;cursor:pointer;padding:4px;">×</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${SECURITY_TYPES.map(t => `
          <button onclick="selectSecurityType('${t.id}','${t.label}','${t.emoji}')" style="width:100%;display:flex;align-items:center;gap:14px;padding:14px 16px;background:#F4F6FA;border:1.5px solid #E8EAF0;border-radius:14px;cursor:pointer;text-align:left;transition:all .15s;" onmouseover="this.style.background='#E3F2FD';this.style.borderColor='#1E6FBE'" onmouseout="this.style.background='#F4F6FA';this.style.borderColor='#E8EAF0'">
            <div style="width:46px;height:46px;background:#fff;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 2px 8px rgba(0,0,0,0.08);flex-shrink:0;">${t.emoji}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:14px;color:#1A1A2E;">${t.label}</div>
              <div style="font-size:11px;color:#9999BB;margin-top:2px;">${t.desc}</div>
            </div>
            <span style="font-size:18px;color:#D0D0E0;">›</span>
          </button>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
window.showSecurityTypeModal = showSecurityTypeModal;

function selectSecurityType(typeId, typeLabel, typeEmoji) {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  const overlay = document.getElementById('security-type-overlay');
  if (overlay) overlay.remove();
  // Pré-remplir le type dans le formulaire standard
  const svc = SVCS['security'];
  document.getElementById('form-ico').style.background = svc.bg;
  document.getElementById('form-ico').textContent = typeEmoji;
  document.getElementById('form-title').textContent = typeLabel;
  const soonEl     = document.getElementById('form-soon');
  if (!svc.active && svc.soon) {
    soonEl.style.display = 'block';
    soonEl.innerHTML = `<div style="font-weight:700;font-size:13px;margin-bottom:3px">⏳ Bientôt disponible</div><div style="font-size:12px;opacity:.92">Opérationnel le ${svc.soon}. Vous pouvez déjà pré-enregistrer votre demande.</div>`;
  } else {
    soonEl.style.display = 'none';
  }
  // Afficher le formulaire sans le champ "type" (déjà sélectionné)
  const remainingFields = svc.fields.filter(f => f.n !== 'type');
  let html = `<div style="background:#E3F2FD;border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;">
    <span style="font-size:22px">${typeEmoji}</span>
    <div>
      <div style="font-size:13px;font-weight:700;color:#1A1A2E">${typeLabel}</div>
      <div style="font-size:11px;color:#1E6FBE">Service sélectionné</div>
    </div>
    <button onclick="showSecurityTypeModal()" style="margin-left:auto;background:none;border:1.5px solid #1E6FBE;color:#1E6FBE;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Poppins',sans-serif;">Changer</button>
  </div>`;
  remainingFields.forEach(f => {
    const opt = f.opt ? ' <span style="font-weight:400;font-size:10px;color:#C5C5D8;text-transform:none">(optionnel)</span>' : '';
    html += `<label class="f-label">${f.l}${opt}</label>`;
    if (f.t === 'textarea') {
      html += `<textarea class="f-textarea" rows="3" placeholder="${f.ph||''}" id="ff-${f.n}"></textarea>`;
    } else if (f.t === 'select') {
      html += `<select class="f-select" id="ff-${f.n}"><option value="">— Choisir —</option>${f.opts.map(o=>`<option>${o}</option>`).join('')}</select>`;
    } else {
      html += `<input type="${f.t}" class="f-input" placeholder="${f.ph||''}" id="ff-${f.n}"/>`;
    }
  });
  // Ajouter un champ caché pour le type
  html += `<input type="hidden" id="ff-type" value="${typeLabel}"/>`;
  document.getElementById('form-fields').innerHTML = html;
  showView('form');
}
window.selectSecurityType = selectSecurityType;

// ════════════════════════════════════════
// GESTION LOCATIVE — MODAL TYPES DE BIENS
// ════════════════════════════════════════
const GESTION_BIEN_TYPES = [
  { id:'appartement', label:'Appartement',       emoji:'🏢', desc:'Studio, F1, F2, F3...' },
  { id:'villa',       label:'Villa',             emoji:'🏡', desc:'Maison individuelle, villa' },
  { id:'bureau',      label:'Bureau / Local',    emoji:'💼', desc:'Bureau, open-space, local professionnel' },
  { id:'commerce',    label:'Commerce / Magasin',emoji:'🏪', desc:'Boutique, magasin, commerce' },
  { id:'terrain',     label:'Terrain',           emoji:'🗺️', desc:'Parcelle, terrain nu ou viabilisé' },
  { id:'entrepot',    label:'Entrepôt',          emoji:'🏭', desc:'Stockage, entrepôt, hangar' },
];

function showGestionLocativeModal() {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  let existing = document.getElementById('gestion-loc-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'gestion-loc-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:24px 20px;max-width:400px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,0.2);max-height:90vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <div style="width:48px;height:48px;background:#E8F5E9;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;">📊</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:17px;color:#1A1A2E;">Gestion Locative</div>
          <div style="font-size:12px;color:#9E9EC0;">Quel type de bien souhaitez-vous confier ?</div>
        </div>
        <button onclick="document.getElementById('gestion-loc-overlay').remove()" style="background:none;border:none;font-size:22px;color:#9E9EC0;cursor:pointer;padding:4px;">×</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${GESTION_BIEN_TYPES.map(t => `
          <button onclick="selectGestionBien('${t.id}','${t.label}','${t.emoji}')" style="width:100%;display:flex;align-items:center;gap:14px;padding:14px 16px;background:#F4F6FA;border:1.5px solid #E8EAF0;border-radius:14px;cursor:pointer;text-align:left;transition:all .15s;" onmouseover="this.style.background='#E8F5E9';this.style.borderColor='#2E7D32'" onmouseout="this.style.background='#F4F6FA';this.style.borderColor='#E8EAF0'">
            <div style="width:46px;height:46px;background:#fff;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 2px 8px rgba(0,0,0,0.08);flex-shrink:0;">${t.emoji}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:14px;color:#1A1A2E;">${t.label}</div>
              <div style="font-size:11px;color:#9999BB;margin-top:2px;">${t.desc}</div>
            </div>
            <span style="font-size:18px;color:#D0D0E0;">›</span>
          </button>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
window.showGestionLocativeModal = showGestionLocativeModal;

function selectGestionBien(bienId, bienLabel, bienEmoji) {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  const overlay = document.getElementById('gestion-loc-overlay');
  if (overlay) overlay.remove();
  // Ouvrir le formulaire immobilier pour Gestion Locative avec le type de bien
  const kit = { id:'immo3', nom:'Gestion Locative', emoji:'📊', description:'Encaissement loyers, suivi locataires, entretien, rapports réguliers', categorie:'Service Immobilier', articles:[], prix_total:0 };
  currentImmoCategory = kit;
  currentImmoOption = { kitId:'immo3', kitNom:'Gestion Locative', kitEmoji:'📊', kitCat:'Service Immobilier', article:{ name: bienLabel, emoji: bienEmoji }, articleIdx:0, bienType: bienLabel };
  document.getElementById('immo-form-ico').textContent = bienEmoji;
  document.getElementById('immo-form-title').textContent = `Gestion locative — ${bienLabel}`;
  document.getElementById('immo-form-hero-emoji').textContent = bienEmoji;
  document.getElementById('immo-form-category').textContent = 'Gestion Locative';
  document.getElementById('immo-form-prestation-name').textContent = `Gestion de ${bienLabel.toLowerCase()}`;
  document.getElementById('immo-form-prestation-desc').textContent = 'Encaissement loyers, suivi locataires, entretien, rapports réguliers';
  _immoFormBackFn = () => showGestionLocativeModal();
  const backBtn = document.getElementById('immo-form-back-btn');
  const svc = SVCS['immobilier'];
  const soonEl = document.getElementById('immo-form-soon');
  if (soonEl) soonEl.style.display = (!svc.active && svc.soon) ? 'block' : 'none';
  ['immo-ff-besoin','immo-ff-localisation','immo-ff-budget','immo-ff-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const dateEl = document.getElementById('immo-ff-date');
  if (dateEl) dateEl.value = '';
  showView('immo-form');
}
window.selectGestionBien = selectGestionBien;

// ════════════════════════════════════════
// ASSISTANCE IMMOBILIÈRE — MODAL PRESTATIONS
// ════════════════════════════════════════
const ASSISTANCE_PRESTATIONS = [
  { idx:0, label:'Recherche de terrain sécurisé',                      emoji:'🗺️', desc:'Localisation, vérification, acquisition sécurisée' },
  { idx:1, label:'Recherche de Villa / Appartement / Bureau / Magasin', emoji:'🔍', desc:'Sélection et vérification de biens adaptés à vos besoins' },
  { idx:2, label:'Suivi et Supervision de construction / chantier',     emoji:'🏗️', desc:'Contrôle qualité et avancement des travaux' },
  { idx:3, label:'Vérification de titres fonciers',                     emoji:'📜', desc:'Contrôle légal et attestation de propriété' },
  { idx:4, label:'Accompagnement juridique',                            emoji:'⚖️', desc:'Assistance légale pour vos transactions immobilières' },
  { idx:5, label:'Encaissement des loyers / Suivi des locataires',      emoji:'💵', desc:'Gestion locative, suivi paiements et locataires' },
];

function showAssistanceModal() {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  let existing = document.getElementById('assistance-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'assistance-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:24px 20px;max-width:420px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,0.2);max-height:90vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <div style="width:48px;height:48px;background:#E8F5E9;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;">🌍</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:17px;color:#1A1A2E;">Assistance Diaspora</div>
          <div style="font-size:12px;color:#9E9EC0;">Sélectionnez une prestation</div>
        </div>
        <button onclick="document.getElementById('assistance-overlay').remove()" style="background:none;border:none;font-size:22px;color:#9E9EC0;cursor:pointer;padding:4px;">×</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${ASSISTANCE_PRESTATIONS.map(p => `
          <button onclick="selectAssistancePrestation(${p.idx},'${p.label}','${p.emoji}')" style="width:100%;display:flex;align-items:center;gap:14px;padding:14px 16px;background:#F4F6FA;border:1.5px solid #E8EAF0;border-radius:14px;cursor:pointer;text-align:left;transition:all .15s;" onmouseover="this.style.background='#E8F5E9';this.style.borderColor='#2E7D32'" onmouseout="this.style.background='#F4F6FA';this.style.borderColor='#E8EAF0'">
            <div style="width:46px;height:46px;background:#fff;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 2px 8px rgba(0,0,0,0.08);flex-shrink:0;">${p.emoji}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:13px;color:#1A1A2E;">${p.label}</div>
              <div style="font-size:11px;color:#9999BB;margin-top:2px;">${p.desc}</div>
            </div>
            <span style="font-size:18px;color:#D0D0E0;">›</span>
          </button>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
window.showAssistanceModal = showAssistanceModal;

function selectAssistancePrestation(articleIdx, prestationLabel, prestationEmoji) {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  const overlay = document.getElementById('assistance-overlay');
  if (overlay) overlay.remove();
  const kit = { id:'immo4', nom:'Assistance Immobilière Diaspora', emoji:'🌍', description:'Investissez au Togo depuis l\'étranger sans stress', categorie:'Service Immobilier', articles:[], prix_total:0 };
  const article = { name: prestationLabel, emoji: prestationEmoji };
  currentImmoCategory = kit;
  currentImmoOption = { kitId:'immo4', kitNom:'Assistance Immobilière Diaspora', kitEmoji:'🌍', kitCat:'Service Immobilier', article, articleIdx };
  document.getElementById('immo-form-ico').textContent = prestationEmoji;
  document.getElementById('immo-form-title').textContent = prestationLabel;
  document.getElementById('immo-form-hero-emoji').textContent = prestationEmoji;
  document.getElementById('immo-form-category').textContent = 'Assistance Diaspora';
  document.getElementById('immo-form-prestation-name').textContent = prestationLabel;
  document.getElementById('immo-form-prestation-desc').textContent = kit.description || '';
  _immoFormBackFn = () => showAssistanceModal();
  const backBtn = document.getElementById('immo-form-back-btn');
  const svc = SVCS['immobilier'];
  const soonEl = document.getElementById('immo-form-soon');
  if (soonEl) soonEl.style.display = (!svc.active && svc.soon) ? 'block' : 'none';
  ['immo-ff-besoin','immo-ff-localisation','immo-ff-budget','immo-ff-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const dateEl = document.getElementById('immo-ff-date');
  if (dateEl) dateEl.value = '';
  showView('immo-form');
}
window.selectAssistancePrestation = selectAssistancePrestation;
// ════════════════════════════════════════════════════════════════
// CONSULTANCES/EXPERTISES — Flux identique au Service Immobilier
// ════════════════════════════════════════════════════════════════

// Structure de données calquée exactement sur IMMO_ENVELOPE
const CONSULTANCES_ENVELOPE = {
  id: 'togo_expertise',
  name: 'Consultances/Expertises',
  emoji: '🧑‍💼',
  color: '#EDE7F6',
  subServices: [
    {
      id: 'consult_mathivick',
      name: 'Mathivick',
      emoji: '🚀',
      color: '#FFF3E0',
      type: 'selection',
      desc: 'Formation commerciale, marketing & commercialisation de produits',
      sections: [
        {
          id: 'math_formation',
          label: 'Formation et développement des compétences',
          emoji: '🎓',
          color: '#FFF3E0',
          desc: 'Formations pratiques et interactives pour générer des résultats rapides et durables',
          options: [
            { id: 'init_commercial',   label: 'Initiation au métier du commercial',       emoji: '🎯', desc: 'Bases du métier commercial pour débutants' },
            { id: 'tech_avancees',     label: 'Techniques avancées de vente',              emoji: '💡', desc: 'Méthodes éprouvées pour augmenter vos performances' },
            { id: 'prospection',       label: 'Prospection commerciale efficace',          emoji: '🔍', desc: 'Trouver et qualifier vos prospects' },
            { id: 'relation_client',   label: 'Relation client & fidélisation',            emoji: '🤝', desc: 'Construire une relation durable avec vos clients' },
            { id: 'comm_digitale',     label: 'Communication digitale pour les ventes',   emoji: '📱', desc: 'Utiliser le digital pour booster vos ventes' },
            { id: 'gestion_planif',    label: 'Gestion et planification commerciale',      emoji: '📅', desc: 'Organiser et piloter votre activité commerciale' },
          ]
        },
        {
          id: 'math_marketing',
          label: 'Service marketing & commercial',
          emoji: '📣',
          color: '#FFF3E0',
          desc: 'Parce que bien vendre passe par bien se faire connaître',
          options: [
            { id: 'strat_comm',     label: 'Stratégie commerciale (communication & vente)', emoji: '🗺️', desc: 'Élaborer votre stratégie de communication et de vente' },
            { id: 'creation_cont',  label: 'Création de contenus (visuels, vidéos, posts)', emoji: '🎨', desc: 'Produire des contenus engageants pour votre audience' },
            { id: 'reseaux',        label: 'Gestion des réseaux sociaux',                   emoji: '📲', desc: 'Animer et développer votre présence en ligne' },
            { id: 'campagnes',      label: 'Campagnes promotionnelles ciblées',             emoji: '🎯', desc: 'Concevoir et déployer des campagnes efficaces' },
            { id: 'branding',       label: 'Identité visuelle et branding',                 emoji: '✨', desc: 'Construire une image de marque forte et cohérente' },
          ]
        },
        {
          id: 'math_produits',
          label: 'Commercialisation de produits frais & bios',
          emoji: '🥬',
          color: '#FFF3E0',
          desc: 'Accompagnement à la vente de produits frais et biologiques de qualité',
          options: [
            { id: 'agri_maraich',   label: 'Produits agricoles maraîchers',                              emoji: '🌱', desc: 'Légumes, fruits et produits du maraîchage local' },
            { id: 'saisonniers',    label: 'Produits saisonniers de qualité',                            emoji: '🍊', desc: 'Sélection de produits de saison' },
            { id: 'aviculture',     label: 'Aviculture (volailles) et pisciculture (poissons)',          emoji: '🐔', desc: 'Produits d\'élevage locaux de qualité' },
            { id: 'sans_additifs',  label: 'Produits sans additifs chimiques',                           emoji: '🌿', desc: 'Produits naturels, sans conservateurs ni additifs' },
            { id: 'sante_bio',      label: 'Orientation santé, bien-être et alimentation consciente',   emoji: '💚', desc: 'Promouvoir une alimentation saine et responsable' },
          ]
        },
      ]
    },
    {
      id: 'consult_omega',
      name: 'Omega Conseils',
      emoji: '💼',
      color: '#E3F2FD',
      type: 'selection',
      desc: 'Consultances, financement de projets & renforcement de capacités',
      sections: [
        {
          id: 'omega_redaction',
          label: 'Rédaction & Montage de projets',
          emoji: '📄',
          color: '#E3F2FD',
          desc: 'Études de faisabilité, business plans bancables, dossiers bailleurs et plans stratégiques',
          options: [
            { id: 'faisabilite',   label: 'Études de faisabilité techniques et financières',            emoji: '🔬', desc: 'Analyse approfondie de la viabilité de votre projet' },
            { id: 'bplan',         label: 'Rédaction de business plans bancables',                      emoji: '📑', desc: 'Documents professionnels prêts pour les banques' },
            { id: 'bailleurs',     label: 'Montage de dossiers pour bailleurs (BM, BAD, BOAD...)',      emoji: '🏦', desc: 'Dossiers pour institutions financières internationales' },
            { id: 'ppp',           label: 'Notes conceptuelles & projets PPP',                          emoji: '🤝', desc: 'Partenariats public-privé et notes de cadrage' },
            { id: 'modelisation',  label: 'Modélisation financière (VAN, TRI, cash-flow)',              emoji: '📊', desc: 'Analyse financière complète de votre projet' },
            { id: 'plan_strat',    label: 'Plans stratégiques (3 à 5 ans)',                             emoji: '🗺️', desc: 'Vision et feuille de route à moyen terme' },
          ]
        },
        {
          id: 'omega_entrepreneuriat',
          label: 'Entrepreneuriat & Création d\'entreprise',
          emoji: '🚀',
          color: '#E3F2FD',
          desc: 'Accompagnement complet de la création à la structuration de votre entreprise',
          options: [
            { id: 'creation_juri',  label: 'Accompagnement à la création juridique',           emoji: '⚖️', desc: 'Choisir et créer la structure juridique adaptée' },
            { id: 'etude_marche',   label: 'Étude de marché et validation du modèle',           emoji: '📈', desc: 'Valider votre concept et connaître votre marché' },
            { id: 'bmc',            label: 'Structuration du business model (Canvas)',           emoji: '🎨', desc: 'Modéliser et optimiser votre modèle économique' },
            { id: 'formalisation',  label: 'Formalisation administrative et fiscale',           emoji: '📋', desc: 'Immatriculation, fiscalité et formalités légales' },
            { id: 'lancement',      label: 'Stratégie de lancement et positionnement',          emoji: '🎯', desc: 'Préparer et réussir le lancement de votre activité' },
          ]
        },
        {
          id: 'omega_formation',
          label: 'Formation professionnelle et renforcement de capacités',
          emoji: '🎓',
          color: '#E3F2FD',
          desc: 'Formations spécialisées en montage de projets, finance et entrepreneuriat',
          options: [
            { id: 'form_montage',   label: 'Formation en montage de projets',            emoji: '🏗️', desc: 'Apprendre à structurer et présenter vos projets' },
            { id: 'form_finance',   label: 'Formation en finance structurée',            emoji: '💹', desc: 'Comprendre et maîtriser les outils financiers' },
            { id: 'form_risques',   label: 'Formation en gestion des risques',           emoji: '🛡️', desc: 'Identifier, évaluer et mitiger les risques' },
            { id: 'form_entre',     label: 'Formation en entrepreneuriat pratique',      emoji: '💡', desc: 'Passer de l\'idée au projet concret' },
            { id: 'atelier_bp',     label: 'Ateliers de rédaction de business plan',    emoji: '✏️', desc: 'Sessions pratiques de rédaction en groupe' },
          ]
        },
      ]
    },
    // ── Lex' Africa Togo ──
    {
      id: 'consult_lex',
      name: "Lex' Africa Togo",
      emoji: '⚖️',
      color: '#E8F5E9',
      type: 'selection',
      desc: 'Consultant en droit des affaires',
      sections: [
        {
          id: 'lex_conseil',
          label: 'Conseil Juridique - Ingénierie juridique et sociétaire - Secrétariat juridique',
          emoji: '⚖️',
          color: '#E8F5E9',
          desc: 'Conseil, ingénierie juridique & sociétaire, secrétariat juridique pour entreprises et particuliers',
          options: [
            { id: 'consultations',      label: 'Consultations',                                               emoji: '💬', desc: 'Consultations juridiques personnalisées' },
            { id: 'veille_juri',        label: 'Veilles juridique, administrative, sociale et judiciaire',    emoji: '🔎', desc: 'Suivi de l\'actualité juridique et réglementaire' },
            { id: 'revues_juri',        label: 'Revues juridiques, administratives et judiciaires',           emoji: '📰', desc: 'Analyse et synthèse des textes juridiques' },
            { id: 'gestion_rh',         label: 'Gestion des Ressources humaines depuis le recrutement',       emoji: '👥', desc: 'Accompagnement RH du recrutement à la gestion courante' },
            { id: 'audits_juri',        label: 'Audits juridiques et organisationnels',                       emoji: '🔍', desc: 'Diagnostic juridique et organisationnel de votre structure' },
            { id: 'assist_juri',        label: 'Assistance juridique et administrative',                      emoji: '🤝', desc: 'Support juridique et administratif au quotidien' },
            { id: 'assist_prejudi',     label: 'Assistance pré-judiciaire',                                   emoji: '🛡️', desc: 'Accompagnement avant toute procédure judiciaire' },
            { id: 'secretariat_juri',   label: 'Secrétariat juridique',                                       emoji: '📋', desc: 'Tenue des registres, PV d\'assemblée, formalités légales' },
            { id: 'representation',     label: 'Représentation légale',                                       emoji: '🏛️', desc: 'Représentation auprès des autorités et institutions' },
            { id: 'montages_juri',      label: 'Montages juridico-financiers',                                emoji: '🔗', desc: 'Structuration juridique et financière de vos opérations' },
            { id: 'dossiers_agrement',  label: 'Constitution de dossiers d\'agrément dans tous secteurs',     emoji: '📁', desc: 'Préparation des dossiers d\'agrément sectoriels' },
            { id: 'dossiers_credit',    label: 'Montage de dossiers de crédit',                               emoji: '💳', desc: 'Constitution de dossiers bancaires et de financement' },
            { id: 'intermediation',     label: 'Intermédiation auprès de fonds d\'investissement privés',     emoji: '💰', desc: 'Mise en relation avec des investisseurs et fonds privés' },
          ]
        },
      ]
    },
  ]
};

// ── Niveau 1 : vue immo-options avec les 2 pôles (identique renderImmoEnvelope) ──
function showTogoExpertiseMenu() {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  const svc = SVCS[TOGO_EXPERTISE_SERVICE];
  // Mettre à jour le header de la vue immo-options
  const titleEl = document.getElementById('immo-options-title');
  const icoEl   = document.getElementById('immo-options-ico');
  const backBtn = document.getElementById('immo-options-back-btn');
  if (titleEl) titleEl.textContent = 'Consultances/Expertises';
  if (icoEl)   { icoEl.textContent = '🧑‍💼'; icoEl.style.background = '#EDE7F6'; }
  if (backBtn) backBtn.onclick = () => showView('list');

  // Sous-titre section
  const secLabel = document.querySelector('#view-immo-options [style*="text-transform:uppercase"]');
  if (secLabel) secLabel.textContent = '🧑‍💼 Nos pôles d\'expertise';

  const container = document.getElementById('immo-options-list');
  if (!container) return;
  container.innerHTML = CONSULTANCES_ENVELOPE.subServices.map(sub => `
    <button class="svc-row" style="margin:0 16px 12px;display:flex;align-items:center;gap:14px;background:#fff;border-radius:18px;padding:14px 16px;box-shadow:0 2px 12px rgba(0,0,0,.08);cursor:pointer;border:none;width:calc(100% - 32px);transition:transform .15s;"
      onclick="openConsultancesSubService('${sub.id}')">
      <div style="width:44px;height:44px;border-radius:12px;background:${sub.color};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${sub.emoji}</div>
      <div style="flex:1;text-align:left">
        <div style="font-size:14px;font-weight:700;color:#1A1A2E;margin-bottom:3px">${sub.name}</div>
        <div style="font-size:11px;color:#9999BB">${sub.desc}</div>
      </div>
      <span style="font-size:20px;color:#E8EAF0">›</span>
    </button>
  `).join('');

  goTab('services');
  showView('immo-options');
}
window.showTogoExpertiseMenu = showTogoExpertiseMenu;

// ── Niveau 2 : grandes lignes d'un pôle (Mathivick ou Omega) — même vue immo-options ──
function openConsultancesSubService(subId) {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  const sub = CONSULTANCES_ENVELOPE.subServices.find(s => s.id === subId);
  if (!sub) return;

  const titleEl = document.getElementById('immo-options-title');
  const icoEl   = document.getElementById('immo-options-ico');
  const backBtn = document.getElementById('immo-options-back-btn');
  if (titleEl) titleEl.textContent = sub.name;
  if (icoEl)   { icoEl.textContent = sub.emoji; icoEl.style.background = sub.color; }
  if (backBtn) backBtn.onclick = () => showTogoExpertiseMenu();

  const secLabel = document.querySelector('#view-immo-options [style*="text-transform:uppercase"]');
  if (secLabel) secLabel.textContent = `${sub.emoji} Nos domaines`;

  const container = document.getElementById('immo-options-list');
  if (!container) return;
  container.innerHTML = sub.sections.map(sec => `
    <button class="svc-row" style="margin:0 16px 12px;display:flex;align-items:center;gap:14px;background:#fff;border-radius:18px;padding:14px 16px;box-shadow:0 2px 12px rgba(0,0,0,.08);cursor:pointer;border:none;width:calc(100% - 32px);transition:transform .15s;"
      onclick="openConsultancesForm('${subId}','${sec.id}')">
      <div style="width:44px;height:44px;border-radius:12px;background:${sec.color};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${sec.emoji}</div>
      <div style="flex:1;text-align:left">
        <div style="font-size:14px;font-weight:700;color:#1A1A2E;margin-bottom:3px">${sec.label}</div>
        <div style="font-size:11px;color:#9999BB">${sec.desc}</div>
      </div>
      <span style="font-size:20px;color:#E8EAF0">›</span>
    </button>
  `).join('');
  showView('immo-options');
}
window.openConsultancesSubService = openConsultancesSubService;

// ── Niveau 3 : formulaire (vue immo-form, identique à l'immobilier) ──
function openConsultancesForm(subId, sectionId) {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  const sub     = CONSULTANCES_ENVELOPE.subServices.find(s => s.id === subId);
  if (!sub) return;
  const section = sub.sections.find(s => s.id === sectionId);
  if (!section) return;

  window._consultancesOption = { subId, sectionId, sub, section };

  const icoEl    = document.getElementById('immo-form-ico');
  const titleEl  = document.getElementById('immo-form-title');
  const heroEmoji= document.getElementById('immo-form-hero-emoji');
  const catEl    = document.getElementById('immo-form-category');
  const nameEl   = document.getElementById('immo-form-prestation-name');
  const descEl   = document.getElementById('immo-form-prestation-desc');
  const backBtn  = document.getElementById('immo-form-back-btn');
  const soonEl   = document.getElementById('immo-form-soon');
  const submitBtn= document.getElementById('immo-form-submit-btn');

  if (icoEl)     { icoEl.textContent = section.emoji; icoEl.style.background = section.color; }
  if (titleEl)   titleEl.textContent = section.label;
  if (heroEmoji) heroEmoji.textContent = section.emoji;
  if (catEl)     catEl.textContent = sub.name;
  if (nameEl)    nameEl.textContent = 'Sélectionnez une prestation';
  if (descEl)    descEl.textContent = section.desc;
  const svcConsult = SVCS['mathivick'] || SVCS['togo_expertise'];
  if (soonEl) soonEl.style.display = (svcConsult && !svcConsult.active && svcConsult.soon) ? 'block' : 'none';
  if (soonEl && svcConsult && !svcConsult.active && svcConsult.soon) {
    soonEl.innerHTML = `<div style="font-weight:700;font-size:13px;margin-bottom:3px">⏳ Bientôt disponible</div><div style="font-size:12px;opacity:.92">Opérationnel le ${svcConsult.soon}. Vous pouvez déjà pré-enregistrer votre demande.</div>`;
  }
  _immoFormBackFn = () => openConsultancesSubService(subId);
  if (backBtn)   backBtn.onclick = () => openConsultancesSubService(subId);

  if (submitBtn) {
    submitBtn.onclick  = submitConsultancesForm;
    submitBtn.innerHTML = '📨 Envoyer ma demande';
    submitBtn.disabled  = false;
  }

  const fieldsEl = document.getElementById('immo-form-fields');
  if (fieldsEl) {
    const selectOpts = section.options.map((o, i) =>
      `<option value="${i}">${o.emoji} ${o.label}</option>`
    ).join('');
    fieldsEl.innerHTML = `
      <label class="f-label">TYPE DE PRESTATION *</label>
      <select class="f-select" id="consult-ff-type" onchange="onConsultTypeChange('${subId}','${sectionId}',this.value)">
        <option value="">— Sélectionnez —</option>
        ${selectOpts}
      </select>
      <label class="f-label" style="margin-top:14px">Description de votre besoin *</label>
      <textarea class="f-textarea" rows="4" id="immo-ff-besoin" placeholder="Décrivez votre besoin en détail..."></textarea>
      <label class="f-label" data-immo-loc>Localisation / Ville *</label>
      <input type="text" class="f-input" id="immo-ff-localisation" placeholder="Ex : Adidogomé, Bè, Tokoin, Lomé..."/>
      <label class="f-label">Date souhaitée <span style="font-weight:400;font-size:10px;color:#C5C5D8;text-transform:none">(optionnel)</span></label>
      <input type="date" class="f-input" id="immo-ff-date"/>
      <label class="f-label">Remarques <span style="font-weight:400;font-size:10px;color:#C5C5D8;text-transform:none">(optionnel)</span></label>
      <textarea class="f-textarea" rows="2" id="immo-ff-notes" placeholder="Précisions additionnelles..."></textarea>
    `;
  }
  // Masquer budget uniquement
  const budgetEl    = document.getElementById('immo-ff-budget');
  const budgetLabel = document.querySelector('label[data-immo-budget]');
  if (budgetEl)    budgetEl.style.display    = 'none';
  if (budgetLabel) budgetLabel.style.display = 'none';

  showView('immo-form');
}
window.openConsultancesForm = openConsultancesForm;

// ── Mise à jour du hero quand on change de prestation ──
function onConsultTypeChange(subId, sectionId, val) {
  const sub     = CONSULTANCES_ENVELOPE.subServices.find(s => s.id === subId);
  const section = sub?.sections.find(s => s.id === sectionId);
  if (!section) return;
  const idx = parseInt(val, 10);
  const opt = isNaN(idx) || idx < 0 ? null : section.options[idx];
  const nameEl    = document.getElementById('immo-form-prestation-name');
  const descEl    = document.getElementById('immo-form-prestation-desc');
  const heroEmoji = document.getElementById('immo-form-hero-emoji');
  const icoEl     = document.getElementById('immo-form-ico');
  if (opt) {
    if (nameEl)    nameEl.textContent    = opt.label;
    if (descEl)    descEl.textContent    = opt.desc;
    if (heroEmoji) heroEmoji.textContent = opt.emoji;
    if (icoEl)     icoEl.textContent     = opt.emoji;
  } else {
    if (nameEl)    nameEl.textContent    = 'Sélectionnez une prestation';
    if (heroEmoji) heroEmoji.textContent = section.emoji;
    if (icoEl)     icoEl.textContent     = section.emoji;
  }
}
window.onConsultTypeChange = onConsultTypeChange;

// ── Soumission du formulaire Consultances ──
async function submitConsultancesForm() {
  if (!currentUser) { openAuthModal('login'); return; }

  const opt = window._consultancesOption;
  if (!opt) return;

  const sel      = document.getElementById('consult-ff-type');
  const typeVal  = sel ? sel.value : '';
  const typeLabel = sel && typeVal !== '' ? sel.options[sel.selectedIndex]?.text.replace(/^.\s/,'') : '';
  if (!typeVal) {
    if (sel) sel.style.borderColor = '#F5820A';
    showToast('⚠️ Veuillez sélectionner un type de prestation', '#F5820A');
    return;
  }

  const besoin       = document.getElementById('immo-ff-besoin')?.value.trim();
  const localisation = document.getElementById('immo-ff-localisation')?.value.trim() || '';
  const date         = document.getElementById('immo-ff-date')?.value.trim();
  const notes        = document.getElementById('immo-ff-notes')?.value.trim();

  if (!besoin) {
    const el = document.getElementById('immo-ff-besoin');
    if (el) el.style.borderColor = '#F5820A';
    showToast('⚠️ Veuillez décrire votre besoin', '#F5820A');
    return;
  }

  const btn = document.getElementById('immo-form-submit-btn');
  if (btn) { btn.innerHTML = '<span class="spinner"></span> Envoi...'; btn.disabled = true; }

  try {
    const docRef = await addDoc(collection(db,'commandes'), {
      service:         opt.sub.id === 'consult_mathivick' ? 'mathivick' : opt.sub.id === 'consult_omega' ? 'omega_conseil' : 'lex_africa',
      serviceName:     `${opt.sub.name} — ${opt.section.label} — ${typeLabel}`,
      statut:          'En attente',
      categorieId:     opt.sectionId,
      categorieNom:    opt.section.label,
      prestation:      typeLabel,
      prestationEmoji: opt.section.emoji || '🧑‍💼',
      besoin,
      localisation,
      dateSouhaitee:   date  || '',
      notes:           notes || '',
      uid:             currentUser.uid,
      clientNom:       currentUser.nom    || '',
      clientPrenom:    currentUser.prenom || '',
      clientGenre:     currentUser.genre  || '',
      phone:           currentUser.phone  || '',
      clientVille:     currentUser.ville  || '',
      createdAt:       serverTimestamp()
    });

    document.getElementById('succ-msg').innerHTML =
      `Demande <strong style="color:var(--blue)">${typeLabel}</strong> envoyée !<br/>
       Référence : <strong>#${docRef.id.slice(0,8).toUpperCase()}</strong><br/>
       Notre équipe vous contactera très bientôt.<br/>
       <small style="color:var(--light)">Contact : ${currentUser.phone || ''}</small>`;
    const succBtn = document.getElementById('succ-view-orders-btn');
    if (succBtn) succBtn.style.display = 'block';
    window._consultancesOption = null;
    showSuccessView();
  } catch(err) {
    console.error(err);
    showToast('❌ Erreur d\'envoi. Vérifiez votre connexion.', '#C62828');
    if (btn) { btn.innerHTML = '📨 Envoyer ma demande'; btn.disabled = false; }
  }
}
window.submitConsultancesForm = submitConsultancesForm;

// ════════════════════════════════════════
// FORMULAIRES DIRECTS (sans modal intermédiaire)
// ════════════════════════════════════════

// ── Gardiennage : formulaire direct avec select déroulant ──
function openSecurityDirectForm() {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  const svc = SVCS['security'];
  currentService = 'security';
  document.getElementById('form-ico').style.background = svc.bg;
  document.getElementById('form-ico').textContent = svc.icon;
  document.getElementById('form-title').textContent = svc.name;
  const soonEl     = document.getElementById('form-soon');
  if (!svc.active && svc.soon) {
    soonEl.style.display = 'block';
    soonEl.innerHTML = `<div style="font-weight:700;font-size:13px;margin-bottom:3px">⏳ Bientôt disponible</div><div style="font-size:12px;opacity:.92">Opérationnel le ${svc.soon}. Vous pouvez déjà pré-enregistrer votre demande.</div>`;
  } else {
    soonEl.style.display = 'none';
  }
  let html = '';
  svc.fields.forEach(f => {
    const opt = f.opt ? ' <span style="font-weight:400;font-size:10px;color:#C5C5D8;text-transform:none">(optionnel)</span>' : '';
    html += `<label class="f-label">${f.l}${opt}</label>`;
    if (f.t === 'textarea') {
      html += `<textarea class="f-textarea" rows="3" placeholder="${f.ph||''}" id="ff-${f.n}"></textarea>`;
    } else if (f.t === 'select') {
      html += `<select class="f-select" id="ff-${f.n}"><option value="">— Sélectionnez —</option>${f.opts.map(o=>`<option>${o}</option>`).join('')}</select>`;
    } else {
      html += `<input type="${f.t}" class="f-input" placeholder="${f.ph||''}" id="ff-${f.n}"/>`;
    }
  });
  document.getElementById('form-fields').innerHTML = html;
  showView('form');
}
window.openSecurityDirectForm = openSecurityDirectForm;

// ── Assistance Immobilière : formulaire direct avec select déroulant ──
function openAssistanceDirectForm() {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  const svc = SVCS['immobilier'];
  // Préparer un currentImmoOption générique (sera mis à jour lors de la soumission)
  const kit = { id:'immo4', nom:'Assistance Immobilière Diaspora', emoji:'🌍', description:'Investissez au Togo depuis l\'étranger sans stress', categorie:'Service Immobilier', articles:[], prix_total:0 };
  currentImmoCategory = kit;

  // Construire les options du select à partir de ASSISTANCE_PRESTATIONS
  const selectOpts = ASSISTANCE_PRESTATIONS.map((p,i) =>
    `<option value="${i}" data-emoji="${p.emoji}">${p.emoji} ${p.label}</option>`
  ).join('');

  // Mettre à jour le header
  document.getElementById('immo-form-ico').textContent = '🌍';
  document.getElementById('immo-form-ico').style.background = '#E8F5E9';
  document.getElementById('immo-form-title').textContent = 'Assistance Diaspora';
  document.getElementById('immo-form-hero-emoji').textContent = '🌍';
  document.getElementById('immo-form-category').textContent = 'Assistance Immobilière';
  document.getElementById('immo-form-prestation-name').textContent = 'Sélectionnez une prestation';
  document.getElementById('immo-form-prestation-desc').textContent = 'Recherche de terrain, accompagnement juridique, suivi de chantier...';

  // Bouton retour
  _immoFormBackFn = () => showView('list');

  // Afficher bandeau bientôt si nécessaire
  const soonEl = document.getElementById('immo-form-soon');
  if (soonEl) soonEl.style.display = (!svc.active && svc.soon) ? 'block' : 'none';

  // Injecter un select déroulant en premier champ
  const fieldsEl = document.getElementById('immo-form-fields');
  fieldsEl.innerHTML = `
    <label class="f-label">TYPE DE PRESTATION *</label>
    <select class="f-select" id="immo-ff-type-select" onchange="window._onAssistanceTypeChange(this.value)">
      <option value="">— Sélectionnez —</option>
      ${selectOpts}
    </select>
    <label class="f-label" style="margin-top:14px">Description de votre besoin</label>
    <textarea class="f-textarea" rows="4" id="immo-ff-besoin" placeholder="Décrivez votre besoin en détail..."></textarea>
    <label class="f-label">Localisation / Quartier souhaité</label>
    <input type="text" class="f-input" id="immo-ff-localisation" placeholder="Ex : Adidogomé, Bè, Tokoin, Agoè..."/>
    <label class="f-label">Budget estimé <span style="font-weight:400;font-size:10px;color:#C5C5D8;text-transform:none">(optionnel)</span></label>
    <input type="text" class="f-input" id="immo-ff-budget" placeholder="Ex : 500 000 FCFA/mois"/>
    <label class="f-label">Date souhaitée <span style="font-weight:400;font-size:10px;color:#C5C5D8;text-transform:none">(optionnel)</span></label>
    <input type="date" class="f-input" id="immo-ff-date"/>
    <label class="f-label">Remarques <span style="font-weight:400;font-size:10px;color:#C5C5D8;text-transform:none">(optionnel)</span></label>
    <textarea class="f-textarea" rows="2" id="immo-ff-notes" placeholder="Précisions additionnelles..."></textarea>
  `;

  // Initialiser currentImmoOption avec la première sélection possible
  currentImmoOption = null;
  window._onAssistanceTypeChange = function(val) {
    const idx = parseInt(val, 10);
    if (isNaN(idx)) { currentImmoOption = null; return; }
    const p = ASSISTANCE_PRESTATIONS[idx];
    if (!p) return;
    const article = kit.articles?.[idx] || { name: p.label, emoji: p.emoji };
    currentImmoOption = { kitId:'immo4', kitNom:'Assistance Immobilière Diaspora', kitEmoji:'🌍', kitCat:'Service Immobilier', article, articleIdx: idx };
    // Mettre à jour le hero
    document.getElementById('immo-form-hero-emoji').textContent = p.emoji;
    document.getElementById('immo-form-prestation-name').textContent = p.label;
    document.getElementById('immo-form-prestation-desc').textContent = p.desc;
    document.getElementById('immo-form-ico').textContent = p.emoji;
  };

  showView('immo-form');
}
window.openAssistanceDirectForm = openAssistanceDirectForm;

// ── Gestion Locative : formulaire direct avec select déroulant ──
function openGestionLocativeDirectForm() {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  const svc = SVCS['immobilier'];
  const kit = { id:'immo3', nom:'Gestion Locative', emoji:'📊', description:'Gestion locative complète de votre bien', categorie:'Service Immobilier', articles:[], prix_total:0 };
  if (!kit) { showToast('❌ Service introuvable.', '#C62828'); return; }
  currentImmoCategory = kit;

  const selectOpts = GESTION_BIEN_TYPES.map(t =>
    `<option value="${t.id}" data-emoji="${t.emoji}" data-label="${t.label}">${t.emoji} ${t.label}</option>`
  ).join('');

  // Mettre à jour le header
  document.getElementById('immo-form-ico').textContent = '📊';
  document.getElementById('immo-form-ico').style.background = '#E8F5E9';
  document.getElementById('immo-form-title').textContent = 'Gestion Locative';
  document.getElementById('immo-form-hero-emoji').textContent = '📊';
  document.getElementById('immo-form-category').textContent = 'Gestion Locative';
  document.getElementById('immo-form-prestation-name').textContent = 'Sélectionnez le type de bien';
  document.getElementById('immo-form-prestation-desc').textContent = 'Encaissement loyers, suivi locataires, entretien, rapports réguliers';

  _immoFormBackFn = () => showView('list');

  const soonEl = document.getElementById('immo-form-soon');
  if (soonEl) soonEl.style.display = (!svc.active && svc.soon) ? 'block' : 'none';

  const fieldsEl = document.getElementById('immo-form-fields');
  fieldsEl.innerHTML = `
    <label class="f-label">TYPE DE BIEN *</label>
    <select class="f-select" id="immo-ff-type-select" onchange="window._onGestionBienChange(this.value)">
      <option value="">— Sélectionnez —</option>
      ${selectOpts}
    </select>
    <label class="f-label" style="margin-top:14px">Description de votre besoin</label>
    <textarea class="f-textarea" rows="4" id="immo-ff-besoin" placeholder="Décrivez votre besoin en détail : surface, nombre de pièces, loyer actuel..."></textarea>
    <label class="f-label">Localisation / Quartier</label>
    <input type="text" class="f-input" id="immo-ff-localisation" placeholder="Ex : Adidogomé, Bè, Tokoin, Agoè..."/>
    <label class="f-label">Budget estimé <span style="font-weight:400;font-size:10px;color:#C5C5D8;text-transform:none">(optionnel)</span></label>
    <input type="text" class="f-input" id="immo-ff-budget" placeholder="Ex : 150 000 FCFA/mois"/>
    <label class="f-label">Date souhaitée <span style="font-weight:400;font-size:10px;color:#C5C5D8;text-transform:none">(optionnel)</span></label>
    <input type="date" class="f-input" id="immo-ff-date"/>
    <label class="f-label">Remarques <span style="font-weight:400;font-size:10px;color:#C5C5D8;text-transform:none">(optionnel)</span></label>
    <textarea class="f-textarea" rows="2" id="immo-ff-notes" placeholder="Précisions additionnelles..."></textarea>
  `;

  currentImmoOption = null;
  window._onGestionBienChange = function(bienId) {
    const t = GESTION_BIEN_TYPES.find(x => x.id === bienId);
    if (!t) { currentImmoOption = null; return; }
    currentImmoOption = { kitId:'immo3', kitNom:'Gestion Locative', kitEmoji:'📊', kitCat:'Service Immobilier', article:{ name: t.label, emoji: t.emoji }, articleIdx:0, bienType: t.label };
    document.getElementById('immo-form-hero-emoji').textContent = t.emoji;
    document.getElementById('immo-form-prestation-name').textContent = `Gestion de ${t.label.toLowerCase()}`;
    document.getElementById('immo-form-prestation-desc').textContent = t.desc;
    document.getElementById('immo-form-ico').textContent = t.emoji;
  };

  showView('immo-form');
}
window.openGestionLocativeDirectForm = openGestionLocativeDirectForm;

// ════════════════════════════════════════
// RESTAURANTS — VUE LISTE
// ════════════════════════════════════════

// Restaurants par défaut intégrés dans l'app
const DEFAULT_RESTAURANTS = [];

// ── 7 Catégories restaurants (style GoChap) ──
const RESTAURANT_CATEGORIES = [
  { id:'plats_locaux',      label:'🇹🇬 Plats Locaux Togolais',              emoji:'🇹🇬', imgBg:'linear-gradient(135deg,#E8F5E9,#A5D6A7)' },
  { id:'cuisine_africaine', label:'🌍 Cuisine Africaine',                   emoji:'🌍', imgBg:'linear-gradient(135deg,#FFF8E1,#FFE082)' },
  { id:'grillades',         label:'🔥 Grillades',                           emoji:'🔥', imgBg:'linear-gradient(135deg,#FBE9E7,#FFAB91)' },
  { id:'cuisine_europeenne',label:'🍝 Cuisine Européenne & Internationale', emoji:'🍝', imgBg:'linear-gradient(135deg,#E3F2FD,#BBDEFB)' },
  { id:'fast_food',         label:'🍟 Fast Food & Snacks',                  emoji:'🍟', imgBg:'linear-gradient(135deg,#FFF3E0,#FFCC80)' },
  { id:'repas_entreprise',  label:'🍱 Repas d\'Entreprise',                 emoji:'🍱', imgBg:'linear-gradient(135deg,#EDE7F6,#CE93D8)' },
  { id:'boissons_desserts', label:'🥤 Boissons & Desserts',                 emoji:'🥤', imgBg:'linear-gradient(135deg,#FCE4EC,#F48FB1)' },
  { id:'cuisine_maison',    label:'🧺 Cuisine Maison & Produits Frais',     emoji:'🧺', imgBg:'linear-gradient(135deg,#E8F5E9,#C8E6C9)' }
];

// ── Charger TOUS les restaurants puis rendre les carousels par catégorie ──
async function loadRestaurantsList() {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  const container = document.getElementById('rst-gochap-list');
  if (!container) return;

  // Spinner global pendant le chargement
  container.innerHTML = `<div style="text-align:center;padding:48px;color:#9999BB">
    <div class="spinner" style="border-color:rgba(30,111,190,.2);border-top-color:#1E6FBE"></div>
    <div style="margin-top:10px;font-size:12px">Chargement des restaurants...</div>
  </div>`;

  let allRests = [];
  try {
    let snap;
    try {
      const q = query(collection(db,'restaurants'), orderBy('ordre','asc'));
      snap = await getDocs(q);
    } catch(_) {
      const q2 = query(collection(db,'restaurants'));
      snap = await getDocs(q2);
    }
    snap.forEach(d => allRests.push({ id:d.id, _src:'db', ...d.data() }));
  } catch(e) {
    console.warn('[Restaurants] Firestore indisponible :', e.message);
  }

  // Fusionner avec les restaurants par défaut non présents en DB
  const dbIds = new Set(allRests.map(r => r.id));
  DEFAULT_RESTAURANTS
    .filter(r => !dbIds.has(r.id))
    .forEach(r => allRests.push({ ...r, _src:'std', actif:true }));

  allRests = allRests.filter(r => r.actif !== false);
  allRests.sort((a,b) => (a.ordre ?? 99) - (b.ordre ?? 99) || (a.nom||'').localeCompare(b.nom||''));

  // Regrouper par catégorie
  const byCateg = {};
  RESTAURANT_CATEGORIES.forEach(c => { byCateg[c.id] = []; });
  allRests.forEach(r => {
    const cid = r.categorie || '';
    if (byCateg[cid]) byCateg[cid].push(r);
    else {
      // Restaurant sans catégorie reconnue → on l'affiche sous la 1ère catégorie
      byCateg[RESTAURANT_CATEGORIES[0].id].push(r);
    }
  });

  // Construire le HTML des sections (une par catégorie)
  let html = '';
  RESTAURANT_CATEGORIES.forEach(cat => {
    const rests = byCateg[cat.id];
    html += `<div class="rst-section-block">
      <div class="rst-section-label">${cat.label}</div>`;
    if (!rests.length) {
      html += `<div class="rst-empty-cat">Bientôt disponible dans cette catégorie…</div>`;
    } else {
      html += `<div class="rst-carousel">`;
      rests.forEach(r => { html += renderRestCarouselCard(r, cat.imgBg); });
      html += `</div>`;
    }
    html += `</div>`;
  });

  container.innerHTML = html;
}
window.loadRestaurantsList = loadRestaurantsList;

// ════════════════════════════════════════
// HORAIRES RESTAURANT — LOGIQUE CLIENT
// ════════════════════════════════════════
const JOURS_ID = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

/**
 * Calcule le statut d'ouverture d'un restaurant à l'instant T.
 * Retourne { ouvert: bool, label: string, sublabel: string, color: string }
 */
function getRestaurantStatut(horaires) {
  if (!horaires || typeof horaires !== 'object') {
    return { ouvert: null, label: '', sublabel: '', color: '' };
  }

  const now      = new Date();
  const jourIdx  = now.getDay(); // 0=dim, 1=lun, ...
  const jourId   = JOURS_ID[jourIdx];
  const hAuj     = horaires[jourId];

  // Convertir "HH:MM" en minutes depuis minuit
  function toMin(str) {
    if (!str) return null;
    const [h, m] = str.split(':').map(Number);
    return h * 60 + m;
  }

  const nowMin   = now.getHours() * 60 + now.getMinutes();

  // Trouver le prochain jour d'ouverture (pour afficher "Ouvre [jour] à Xh")
  function prochaineOuverture() {
    for (let i = 1; i <= 7; i++) {
      const idx  = (jourIdx + i) % 7;
      const jId  = JOURS_ID[idx];
      const jh   = horaires[jId];
      if (jh && jh.ouvert && jh.debut) {
        const nomJour = i === 1 ? 'demain' : JOURS_ID[idx].charAt(0).toUpperCase() + JOURS_ID[idx].slice(1);
        return `Ouvre ${nomJour} à ${jh.debut.replace(':','h')}`;
      }
    }
    return 'Fermé pour le moment';
  }

  // Cas : pas d'horaire pour ce jour ou fermé ce jour
  if (!hAuj || !hAuj.ouvert) {
    return {
      ouvert: false,
      label:  'Fermé',
      sublabel: prochaineOuverture(),
      color:  '#C62828'
    };
  }

  const debutMin = toMin(hAuj.debut);
  const finMin   = toMin(hAuj.fin);

  if (debutMin === null || finMin === null) {
    return { ouvert: null, label: '', sublabel: '', color: '' };
  }

  // Pas encore ouvert aujourd'hui
  if (nowMin < debutMin) {
    return {
      ouvert:   false,
      label:    'Fermé',
      sublabel: `Ouvre à ${hAuj.debut.replace(':','h')}`,
      color:    '#C62828'
    };
  }

  // Déjà fermé aujourd'hui
  if (nowMin >= finMin) {
    return {
      ouvert:   false,
      label:    'Fermé',
      sublabel: prochaineOuverture(),
      color:    '#C62828'
    };
  }

  // Ouvert — ferme dans moins de 30 min ?
  const resteMin = finMin - nowMin;
  const sublabel = resteMin <= 30
    ? `Ferme dans ${resteMin} min`
    : `Ferme à ${hAuj.fin.replace(':','h')}`;

  return {
    ouvert:   true,
    label:    'Ouvert',
    sublabel,
    color:    '#2E7D32'
  };
}

// ── Carte restaurant dans le carousel ──
function renderRestCarouselCard(r, fallbackBg) {
  const bg    = fallbackBg || 'linear-gradient(135deg,#E3F2FD,#BBDEFB)';
  const emoji = r.emoji || '🍽️';
  const nom   = (r.nom || 'Restaurant').replace(/'/g,"\\'");
  const spec  = r.specialites ? r.specialites.split(',')[0].trim() : 'Restaurant';
  const img   = r.imageUrl
    ? `<img src="${r.imageUrl}" alt="${r.nom||''}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0"
         onerror="this.style.display='none'">`
    : '';

  // Badge horaires
  const statut = getRestaurantStatut(r.horaires);
  let badgeHtml = '';
  if (statut.label) {
    const bgBadge = statut.ouvert ? 'rgba(46,125,50,.92)' : 'rgba(198,40,40,.92)';
    badgeHtml = `
      <div style="position:absolute;bottom:8px;left:8px;z-index:2;display:flex;flex-direction:column;align-items:flex-start;gap:2px">
        <span style="background:${bgBadge};color:#fff;font-size:10px;font-weight:800;padding:3px 10px;border-radius:999px;letter-spacing:.4px">
          ${statut.ouvert ? '🟢' : '🔴'} ${statut.label}
        </span>
        ${statut.sublabel ? `<span style="background:rgba(0,0,0,.55);color:#fff;font-size:9px;font-weight:600;padding:2px 8px;border-radius:999px">${statut.sublabel}</span>` : ''}
      </div>`;
  }

  // Si fermé → carte légèrement grisée + clic bloqué avec message
  const fermeStyle = (statut.ouvert === false) ? 'opacity:.75' : '';
  const fermeClick = (statut.ouvert === false)
    ? `onclick="event.preventDefault();window.showToast('🔴 Ce restaurant est actuellement fermé — ${statut.sublabel}','#C62828')"`
    : `onclick="openRestaurant('${r.id}','${nom}','${emoji}','${r.lat||''}','${r.lng||''}')"`;

  return `
  <div class="rst-carousel-card" ${fermeClick} style="${fermeStyle}">
    <div class="rst-carousel-img" style="background:${bg}">
      ${img}
      <span style="position:relative;z-index:1">${emoji}</span>
      ${badgeHtml}
    </div>
    <div class="rst-carousel-body">
      <div class="rst-carousel-name">${r.nom||'Restaurant'}</div>
      <div class="rst-carousel-spec">${spec}</div>
      <div class="rst-carousel-loc">📍 ${r.localite||'Lomé'}</div>
    </div>
  </div>`;
}

// ── Ouvrir un restaurant → afficher son menu ──
async function openRestaurant(restaurantId, restaurantNom, restaurantEmoji, restaurantLat, restaurantLng) {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  currentRestaurant = { id: restaurantId, nom: restaurantNom, emoji: restaurantEmoji,
    lat: restaurantLat || null, lng: restaurantLng || null };
  window.currentRestaurant = currentRestaurant; // exposé pour localisation-module.js

  const svc = SVCS['restaurant'];
  document.getElementById('cat-ico').style.background = svc.bg;
  document.getElementById('cat-ico').textContent = restaurantEmoji;
  document.getElementById('cat-title').textContent = restaurantNom;

  // Retour → page restaurants (avec les carousels déjà chargés)
  const backBtn = document.getElementById('catalogue-back-btn');
  if (backBtn) backBtn.onclick = () => showView('restaurants');

  loadCatalogueRestaurant(restaurantId);
  showView('catalogue');
}
window.openRestaurant = openRestaurant;

// ── Charger les menus d'un restaurant ──
async function loadCatalogueRestaurant(restaurantId) {
  const container = document.getElementById('catalogue-items');
  container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#9999BB"><div class="spinner" style="border-color:rgba(30,111,190,.2);border-top-color:#1E6FBE"></div><div style="margin-top:10px;font-size:12px">Chargement du menu...</div></div>`;
  updateCartBar();

  // Articles par défaut pour chaque restaurant standard
  const DEFAULT_MENUS = {};

  let dbArticles = [];
  try {
    let snap;
    try {
      const q = query(collection(db,'articles'), where('service','==','restaurant'), where('restaurantId','==',restaurantId), orderBy('ordre','asc'));
      snap = await getDocs(q);
    } catch(_) {
      const q2 = query(collection(db,'articles'), where('service','==','restaurant'), where('restaurantId','==',restaurantId));
      snap = await getDocs(q2);
    }
    snap.forEach(d => dbArticles.push({ id:d.id, _src:'db', ...d.data() }));
  } catch(e) {
    console.warn('[Menu] Firestore indisponible :', e.message);
  }

  // Fusionner avec menus par défaut si le restaurant est un standard
  const dbIds = new Set(dbArticles.map(a => a.id));
  const stdMenus = (DEFAULT_MENUS[restaurantId] || [])
    .filter(a => !dbIds.has(a.id))
    .map(a => ({ ...a, _src:'std', stock:'en_stock', actif:true, restaurantId }));

  let articles = [...dbArticles, ...stdMenus];
  articles = articles.filter(a => a.actif !== false);
  articles.sort((a,b) => (a.ordre ?? 99) - (b.ordre ?? 99) || (a.name||'').localeCompare(b.name||''));

  if (!articles.length) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#9999BB">Aucun plat disponible pour le moment.</div>`;
    return;
  }
  // Stocker les articles dans le cache global (pour préserver lat/lng dans le panier)
  articles.forEach(a => { window._articlesCache[a.id] = a; });
  container.innerHTML = articles.map(a => renderArticleCard(a)).join('');
}

// ════════════════════════════════════════
// KITS & PACKS — VUE LISTE
// ════════════════════════════════════════
let currentKit = null;

const DEFAULT_KITS = [];

async function loadKitsList(serviceFilter = null, immoMode = false) {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  const container = document.getElementById('kits-list');
  if (!container) return;
  container.innerHTML = `<div style="text-align:center;padding:40px;color:#9999BB"><div class="spinner" style="border-color:rgba(30,111,190,.2);border-top-color:#1E6FBE"></div><div style="margin-top:10px;font-size:12px">Chargement des kits...</div></div>`;

  let dbKits = [];
  try {
    let snap;
    try {
      const q = query(collection(db,'kits'), orderBy('ordre','asc'));
      snap = await getDocs(q);
    } catch(_) {
      const q2 = query(collection(db,'kits'));
      snap = await getDocs(q2);
    }
    snap.forEach(d => dbKits.push({ id:d.id, _src:'db', ...d.data() }));
  } catch(e) {
    console.warn('[Kits] Firestore indisponible :', e.message);
  }

  const dbIds = new Set(dbKits.map(k => k.id));
  let stdKits = DEFAULT_KITS
    .filter(k => !dbIds.has(k.id))
    .map(k => ({ ...k, _src:'std', actif:true }));

  // Filtrer par service si spécifié
  if (serviceFilter) {
    stdKits = stdKits.filter(k => k.service === serviceFilter);
    dbKits = dbKits.filter(k => k.service === serviceFilter);
  } else {
    // Pour le service 'kits' général, exclure les kits des autres services
    stdKits = stdKits.filter(k => !k.service || k.service === 'kits');
    dbKits = dbKits.filter(k => !k.service || k.service === 'kits');
  }

  const allKits = [...dbKits, ...stdKits].filter(k => k.actif !== false);
  allKits.sort((a,b) => (a.ordre ?? 99) - (b.ordre ?? 99) || (a.nom||'').localeCompare(b.nom||''));

  if (!allKits.length) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:#9999BB">Aucun kit disponible pour le moment.</div>`;
    return;
  }

  container.innerHTML = allKits.map(k => renderKitCard(k, immoMode)).join('');
}
window.loadKitsList = loadKitsList;

function renderKitCard(k, immoMode = false) {
  const imgHtml = k.imageUrl
    ? `<img src="${k.imageUrl}" alt="${k.nom}" style="width:100%;height:100%;object-fit:cover;border-radius:14px" onerror="this.outerHTML='<span style=font-size:48px>${k.emoji||'🎁'}</span>'">`
    : `<span style="font-size:48px">${k.emoji||'🎁'}</span>`;
  const articlesCount = (k.articles || []).length;
  
  // Gestion du prix
  let prixStr;
  if (k.prix_total > 0) {
    prixStr = fmt(k.prix_total);
  } else if (k.contact) {
    prixStr = `📞 ${k.contact}`;
  } else {
    prixStr = 'Sur devis';
  }
  
  const catColor = {
    'Alimentation':'#FFF3E0','Restauration':'#E3F2FD','Prêt-à-porter':'#FFF0F5','Nettoyage':'#F3E5F5',
    'Mathivick - Formation':'#FFF3E0','Mathivick - Combiné':'#FFF9E6',
    'Omega Conseils':'#E3F2FD','Service Immobilier':'#E8F5E9'
  }[k.categorie] || '#E8F5E9';

  const onclickFn = immoMode
    ? `openImmoCategory('${k.id}','${(k.nom||'').replace(/'/g,"\\'")}','${k.emoji||'🏢'}','${(k.description||'').replace(/'/g,"\\'")}','${k.categorie||'Service Immobilier'}')`
    : `openKit('${k.id}','${(k.nom||'').replace(/'/g,"\\'")}','${k.emoji||'🎁'}')`;
  
  return `
  <div class="kit-card" onclick="${onclickFn}">
    <div class="kit-body">
      <div>
        <div class="kit-badge">${k.categorie||'Kit'}</div>
        <div class="kit-name">${k.nom||'Kit'}</div>
      </div>
      <div class="kit-footer">
        <div class="kit-price" style="font-size:${k.contact?'11px':'14px'}">${prixStr}</div>
        <div class="kit-count">${articlesCount} article${articlesCount>1?'s':''}</div>
      </div>
    </div>
    <div class="kit-img-wrap" style="background:${catColor}">
      ${imgHtml}
    </div>
  </div>`;
}

async function openKit(kitId, kitNom, kitEmoji) {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  const container = document.getElementById('kit-detail-items');
  const titleEl = document.getElementById('kit-detail-name');
  const descEl  = document.getElementById('kit-detail-desc');
  const priceEl = document.getElementById('kit-detail-price');
  const headerIco = document.getElementById('kit-detail-ico');

  if (titleEl) titleEl.textContent = kitNom;
  if (headerIco) { headerIco.textContent = kitEmoji; }
  const heroNameEl = document.getElementById('kit-hero-name');
  if (heroNameEl) heroNameEl.textContent = kitNom;
  const heroEl = document.getElementById('kit-hero');
  if (heroEl) heroEl.setAttribute('data-emoji', kitEmoji);

  showView('kit-detail');

  // Chercher le kit dans DB ou defaults
  let kit = null;
  try {
    const snap = await getDoc(doc(db,'kits',kitId));
    if (snap.exists()) kit = { id:snap.id, ...snap.data() };
  } catch(e) {}
  if (!kit) kit = DEFAULT_KITS.find(k => k.id === kitId);
  if (!kit) { if(container) container.innerHTML='<p>Kit introuvable.</p>'; return; }

  currentKit = kit;
  window.currentKit = kit; // Exposer pour localisation-module.js
  if (descEl) descEl.textContent = kit.description||'';
  if (priceEl) priceEl.textContent = kit.prix_total ? fmt(kit.prix_total) : '';

  const articles = kit.articles || [];
  if (!articles.length) {
    if(container) container.innerHTML = `<div style="text-align:center;padding:30px;color:#9999BB">Aucun article dans ce kit.</div>`;
    return;
  }

  if(container) container.innerHTML = articles.map(a => `
    <div class="kit-article-row">
      <div class="kit-article-emoji">${a.emoji||'📦'}</div>
      <div class="kit-article-info">
        <div class="kit-article-name">${a.name}</div>
        <div class="kit-article-qty">× ${a.qty} ${a.unit||''}</div>
      </div>
      ${a.prix ? `<div class="kit-article-price">${fmt(a.prix*a.qty)}</div>` : ''}
    </div>`).join('');
}
window.openKit = openKit;

async function commanderKit() {
  if (!currentKit) return;
  if (!currentUser) { openAuthModal('login'); return; }

  // Remplir le panier avec les articles du kit
  cart = {};
  const articles = currentKit.articles || [];
  articles.forEach((a, i) => {
    const id = `kit_${currentKit.id}_${i}`;
    cart[id] = { id, name: a.name, price: a.prix || 0, qty: a.qty || 1, emoji: a.emoji||'📦' };
  });
  // Si le kit a un prix total fixe, l'utiliser
  if (currentKit.prix_total) {
    cart = {};
    cart[`kit_${currentKit.id}`] = {
      id: `kit_${currentKit.id}`,
      name: currentKit.nom,
      price: currentKit.prix_total,
      qty: 1,
      emoji: currentKit.emoji || '🎁'
    };
  }

  currentService = 'kits';
  window.cart = cart;             // Sync pour localisation-module.js
  window.currentKit = currentKit; // Sync sécurité
  updateCartBar();

  // Ouvrir la modal GPS de localisation-module.js si disponible
  if (typeof window.openKitLocModal === 'function') {
    window.openKitLocModal();
  } else {
    // Fallback : vue livraison standard
    const backBtn = document.getElementById('delivery-back-btn');
    if (backBtn) backBtn.onclick = () => showView('kit-detail');
    showView('delivery');
  }
}
window.commanderKit = commanderKit;


async function loadCatalogue(svcId) {
  const container = document.getElementById('catalogue-items');
  container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--light)"><div class="spinner" style="border-color:rgba(30,111,190,.2);border-top-color:var(--blue)"></div><div style="margin-top:10px;font-size:12px">Chargement...</div></div>`;
  updateCartBar();

  // 1. Charger les articles personnalisés depuis Firestore
  let dbArticles = [];
  try {
    let snap;
    try {
      const q = query(collection(db,'articles'), where('service','==',svcId), orderBy('ordre','asc'));
      snap = await getDocs(q);
    } catch(_) {
      const q2 = query(collection(db,'articles'), where('service','==',svcId));
      snap = await getDocs(q2);
    }
    snap.forEach(d => dbArticles.push({ id:d.id, _src:'db', ...d.data() }));
  } catch(e) {
    console.warn('[Catalogue] Firestore indisponible :', e.message);
  }

  // 2. Standards non encore gérés dans Firestore
  const dbIds = new Set(dbArticles.map(a => a.id));
  const stdArticles = (DEFAULT_ARTICLES[svcId] || [])
    .filter(a => !dbIds.has(a.id))
    .map(a => ({ ...a, _src:'std', stock:'en_stock', actif:true }));

  // 3. Fusion
  let articles = [...dbArticles, ...stdArticles];

  // 4. Cacher les articles masqués
  articles = articles.filter(a => a.actif !== false);

  // 5. Tri
  articles.sort((a,b) => (a.ordre ?? 99) - (b.ordre ?? 99) || (a.name||'').localeCompare(b.name||''));

  // 6. Bandeau de comptage
  const bannerEl    = document.getElementById('catalogue-count-banner');
  const countTextEl = document.getElementById('catalogue-count-text');
  if (bannerEl) {
    const count = articles.length;
    if (count > 0) {
      bannerEl.style.display = 'flex';
      if (countTextEl) countTextEl.textContent = `${count} article${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}`;
    } else {
      bannerEl.style.display = 'none';
    }
  }

  if (!articles.length) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--light)">Aucun article disponible pour le moment.</div>`;
    return;
  }
  articles.forEach(a => { window._articlesCache[a.id] = a; });
  container.innerHTML = articles.map(a => renderArticleCard(a)).join('');
}

function renderArticleCard(a) {
  const inCart  = cart[a.id];
  const qty     = inCart ? inCart.qty : 0;
  const epuise  = (a.stock === 'epuise');
  const imgHtml = a.imageUrl
    ? `<img src="${a.imageUrl}" alt="${a.name}" loading="lazy"/>`
    : `<span style="font-size:42px">${a.emoji||'📦'}</span>`;

  // Article composable → clic ouvre le builder (tous les services catalogue + restaurant)
  // Désactivé pour les sous-services immobilier et location_assistance
  const COMPOSABLE_EXCLUDED_SERVICES = [
    'immo_construction','immo_appart_louer','immo_appart_vendre',
    'immo_terrain_louer','immo_terrain_vendre',
    'immo_commercial_louer','immo_commercial_vendre',
    'immo_evenementiel','immo_courte_duree',
    'location_assistance'
  ];
  const isComposable = (a.composable === true) && !COMPOSABLE_EXCLUDED_SERVICES.includes(currentService);

  if (isComposable) {
    return `<div class="article-card${qty>0?' selected':''}" id="acard-${a.id}"${epuise?' style="pointer-events:none;opacity:.6"':''} onclick="openComposableBuilder('${a.id}')">
      <div class="art-img-wrap">
        ${imgHtml}
        ${epuise ? `<div style="position:absolute;top:8px;left:8px;background:#C62828;color:#fff;font-size:9px;font-weight:800;padding:3px 9px;border-radius:999px;letter-spacing:.5px">ÉPUISÉ</div>` : ''}
        <div style="position:absolute;top:8px;right:8px;background:linear-gradient(135deg,#F5820A,#E65100);color:#fff;font-size:9px;font-weight:800;padding:3px 9px;border-radius:999px;letter-spacing:.5px">À COMPOSER</div>
      </div>
      <div class="art-check">✓</div>
      <div class="art-body">
        <div class="art-name">${a.name}</div>
        <div class="art-desc">${a.desc||''}</div>
        <div class="art-footer">
          <div>
            <span class="art-price" style="font-size:11px;color:#F5820A;font-weight:700">Personnalisable</span>
          </div>
          ${epuise
            ? `<span style="font-size:10px;font-weight:700;color:#C62828;background:#FFEBEE;border-radius:8px;padding:6px 11px">Épuisé</span>`
            : `<button class="art-add" style="background:linear-gradient(135deg,#F5820A,#E65100)" onclick="event.stopPropagation();openComposableBuilder('${a.id}')" title="Composer">🍽️</button>`
          }
        </div>
        ${qty > 0 ? `<div style="margin-top:6px;font-size:11px;color:#2E7D32;font-weight:700">✅ ${qty} dans le panier</div>` : ''}
      </div>
    </div>`;
  }

  return `<div class="article-card${qty>0?' selected':''}" id="acard-${a.id}"${epuise?' style="pointer-events:none;opacity:.6"':''}>
    <div class="art-img-wrap">
      ${imgHtml}
      ${epuise ? `<div style="position:absolute;top:8px;left:8px;background:#C62828;color:#fff;font-size:9px;font-weight:800;padding:3px 9px;border-radius:999px;letter-spacing:.5px">ÉPUISÉ</div>` : ''}
    </div>
    <div class="art-check">✓</div>
    <div class="art-body">
      <div class="art-name">${a.name}</div>
      <div class="art-desc">${a.desc||''}</div>
      <div class="art-footer">
        <div>
          <span class="art-price"${epuise?' style="text-decoration:line-through;color:var(--light)"':''}>${fmt(a.price)}</span>
          ${a.unit ? `<span class="art-price-unit">/ ${a.unit}</span>` : ''}
        </div>
        ${epuise
          ? `<span style="font-size:10px;font-weight:700;color:#C62828;background:#FFEBEE;border-radius:8px;padding:6px 11px">Épuisé</span>`
          : `<button class="art-add" onclick="addToCart('${a.id}',event)" title="Ajouter">+</button>
             <div class="art-qty">
               <button class="qty-btn" onclick="changeQty('${a.id}',-1,event)">−</button>
               <span class="qty-num" id="qty-${a.id}">${qty}</span>
               <button class="qty-btn" onclick="changeQty('${a.id}',1,event)">+</button>
             </div>`
        }
      </div>
    </div>
  </div>`;
}

// ════════════════════════════════════════
// ARTICLE COMPOSABLE — BUILDER CLIENT
// ════════════════════════════════════════
function openComposableBuilder(articleId) {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour commander', '#F5820A'); return; }
  const art = _articlesCache[articleId] || (DEFAULT_ARTICLES[currentService]||[]).find(a=>a.id===articleId);
  if (!art) { showToast('⚠️ Article introuvable', '#F5820A'); return; }

  const composants = Array.isArray(art.composants) ? art.composants : [];

  // Supprimer un éventuel builder déjà ouvert
  document.getElementById('composable-builder-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'composable-builder-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:4000;background:rgba(10,18,32,.7);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;';

  // Construire les lignes de composants
  const composantsHTML = composants.length ? composants.map((c, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#F8F9FE;border-radius:14px;margin-bottom:8px">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:#1A1A2E">${c.nom}</div>
        <div style="font-size:11px;color:#1E6FBE;font-weight:600;margin-top:2px">${Number(c.prix).toLocaleString('fr-FR')} FCFA / unité</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <button onclick="window._compChangeQty(${i},-1)" style="width:32px;height:32px;border-radius:50%;border:2px solid #E8EAF0;background:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#4A4A6A;font-weight:700">−</button>
        <span id="comp-qty-${i}" style="font-size:16px;font-weight:800;color:#1A1A2E;min-width:20px;text-align:center">0</span>
        <button onclick="window._compChangeQty(${i},1)" style="width:32px;height:32px;border-radius:50%;border:none;background:#1E6FBE;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">+</button>
      </div>
    </div>`).join('') : `<div style="text-align:center;padding:30px;color:#9999BB;font-size:13px">Aucun composant défini pour ce plat.</div>`;

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;padding-bottom:env(safe-area-inset-bottom,20px)">
      <div style="background:linear-gradient(135deg,#F5820A,#E65100);padding:20px;border-radius:24px 24px 0 0;position:relative">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="font-size:36px">${art.emoji||'🍽️'}</div>
          <div style="flex:1">
            <div style="font-family:'Nunito',sans-serif;font-size:17px;font-weight:800;color:#fff">${art.name}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.75);margin-top:2px">${art.desc||'Composez votre plat'}</div>
          </div>
          <button onclick="document.getElementById('composable-builder-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px">✕</button>
        </div>
      </div>
      <div style="padding:20px">
        <div style="font-size:11px;font-weight:800;color:#9999BB;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">🧩 Composez votre plat</div>
        ${composantsHTML}
        <div style="background:linear-gradient(135deg,#1E6FBE,#155A9C);border-radius:14px;padding:14px 16px;margin-top:16px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:10px;color:rgba(255,255,255,.65);text-transform:uppercase;letter-spacing:.4px">Total composants</div>
            <div style="font-size:22px;font-weight:900;font-family:'Nunito',sans-serif;color:#fff" id="comp-total-display">0 FCFA</div>
          </div>
          <div style="font-size:10px;color:rgba(255,255,255,.6);text-align:right" id="comp-detail-display"></div>
        </div>
        <button id="comp-confirm-btn" onclick="window._compConfirm('${articleId}')" style="display:block;width:100%;margin-top:14px;background:linear-gradient(135deg,#F5820A,#E65100);color:#fff;border:none;border-radius:999px;padding:16px;font-size:15px;font-weight:700;cursor:pointer;font-family:'Poppins',sans-serif;box-shadow:0 4px 18px rgba(245,130,10,.35);opacity:.5;pointer-events:none">
          🛒 Ajouter au panier
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // État des quantités par composant
  const qtys = composants.map(() => 0);

  window._compChangeQty = function(idx, delta) {
    qtys[idx] = Math.max(0, qtys[idx] + delta);
    document.getElementById(`comp-qty-${idx}`).textContent = qtys[idx];

    // Recalculer le total
    let total = 0;
    const details = [];
    composants.forEach((c, i) => {
      if (qtys[i] > 0) {
        total += c.prix * qtys[i];
        details.push(`${c.nom} ×${qtys[i]}`);
      }
    });

    document.getElementById('comp-total-display').textContent = Number(total).toLocaleString('fr-FR') + ' FCFA';
    document.getElementById('comp-detail-display').textContent = details.join('\n');

    const btn = document.getElementById('comp-confirm-btn');
    if (total > 0) {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    } else {
      btn.style.opacity = '.5';
      btn.style.pointerEvents = 'none';
    }
  };

  window._compConfirm = function(artId) {
    const baseArt = _articlesCache[artId] || (DEFAULT_ARTICLES[currentService]||[]).find(a=>a.id===artId);
    if (!baseArt) return;

    let total = 0;
    const choix = [];
    composants.forEach((c, i) => {
      if (qtys[i] > 0) {
        total += c.prix * qtys[i];
        choix.push({ nom: c.nom, prix: c.prix, qte: qtys[i] });
      }
    });

    if (total <= 0) return;

    // Créer un ID unique pour cette composition (article de base + timestamp)
    const compId = `${artId}_comp_${Date.now()}`;
    const nomDetail = choix.map(c => `${c.nom}×${c.qte}`).join(', ');

    cart[compId] = {
      id: compId,
      name: `${baseArt.name} (${nomDetail})`,
      price: total,
      qty: 1,
      emoji: baseArt.emoji || '🍽️',
      composable: true,
      composants: choix,
      restaurantId: baseArt.restaurantId || currentRestaurant?.id || ''
    };

    window.cart = cart;
    updateCartBar();
    showToast(`✅ ${baseArt.name} composé ajouté !`, '#2E7D32');
    document.getElementById('composable-builder-overlay').remove();

    // Rafraîchir la carte pour afficher le badge "dans le panier"
    const card = document.getElementById(`acard-${artId}`);
    if (card) {
      // Compter combien de compositions de cet article sont dans le panier
      const compCount = Object.values(cart).filter(c => c.id.startsWith(artId+'_comp_')).length;
      const badge = card.querySelector('[data-comp-badge]') || (() => {
        const b = document.createElement('div');
        b.setAttribute('data-comp-badge','1');
        b.style.cssText = 'margin-top:6px;font-size:11px;color:#2E7D32;font-weight:700;text-align:center';
        card.querySelector('.art-body').appendChild(b);
        return b;
      })();
      badge.textContent = `✅ ${compCount} composition${compCount>1?'s':''} dans le panier`;
    }
  };
}
window.openComposableBuilder = openComposableBuilder;

// ════════════════════════════════════════
// GESTION PANIER
// ════════════════════════════════════════
// Cache des articles chargés (pour conserver lat/lng et autres données)
const _articlesCache = {};
window._articlesCache = _articlesCache;

function addToCart(id, e) {
  if(e) e.stopPropagation();
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour commander', '#F5820A'); return; }
  const allDefaults = [...(DEFAULT_ARTICLES[currentService]||[])];
  let art = allDefaults.find(a => a.id === id) || _articlesCache[id];
  if (!art) {
    // Fallback : lire depuis le DOM (sans lat/lng)
    const card = document.getElementById(`acard-${id}`);
    if (!card) return;
    const name      = card.querySelector('.art-name')?.textContent || '';
    const priceText = card.querySelector('.art-price')?.textContent.replace(/[^\d]/g,'') || '0';
    art = { id, name, price: parseInt(priceText) || 0 };
  }
  if (cart[id]) cart[id].qty++;
  else cart[id] = { ...art, qty:1 };
  refreshCard(id);
  updateCartBar();
  showToast(`✅ ${art.name} ajouté !`, "#2E7D32");
}
window.addToCart = addToCart;

function changeQty(id, delta, e) {
  if(e) e.stopPropagation();
  if (!cart[id]) return;
  cart[id].qty += delta;
  if (cart[id].qty <= 0) delete cart[id];
  refreshCard(id);
  updateCartBar();
}
window.changeQty = changeQty;

function refreshCard(id) {
  const card = document.getElementById(`acard-${id}`);
  if (!card) return;
  const qty = cart[id]?.qty || 0;
  card.className = `article-card${qty>0?' selected':''}`;
  const qtyEl = document.getElementById(`qty-${id}`);
  if (qtyEl) qtyEl.textContent = qty;
}

function cartTotal() { return Object.values(cart).reduce((s,a) => s+a.price*a.qty, 0); }
function cartCount() { return Object.values(cart).reduce((s,a) => s+a.qty, 0); }

function updateCartBar() {
  window.cart = cart; // Maintenir window.cart synchronisé
  const bar = document.getElementById('cart-bar');
  if (!bar) return;
  const cnt = cartCount();
  if (cnt > 0) {
    bar.style.display = 'flex';
    document.getElementById('cb-count').textContent = `${cnt} article${cnt>1?'s':''}`;
    document.getElementById('cb-total').textContent = fmt(cartTotal());
  } else {
    bar.style.display = 'none';
  }
  const badge = document.getElementById('cart-count');
  if (badge) {
    if (cnt > 0) { badge.textContent = cnt; badge.style.display = 'flex'; }
    else badge.style.display = 'none';
  }
}

// ════════════════════════════════════════
// PAGE LIVRAISON (sans champ téléphone)
// ════════════════════════════════════════
function setLocMode(mode) {
  locMode = mode;
  document.getElementById('loc-btn-gps').className  = 'loc-btn' + (mode==='gps'?' on':'');
  document.getElementById('loc-btn-desc').className = 'loc-btn' + (mode==='desc'?' on':'');
  document.getElementById('loc-gps-panel').style.display  = mode==='gps'  ? 'block' : 'none';
  document.getElementById('loc-desc-panel').style.display = mode==='desc' ? 'block' : 'none';
}
window.setLocMode = setLocMode;

function getGPS() {
  const btn = document.getElementById('gps-btn');
  const res = document.getElementById('gps-result');
  btn.innerHTML = '<span class="spinner"></span> Localisation...';
  btn.disabled = true;
  if (!navigator.geolocation) {
    res.style.display='block';
    res.innerHTML = '❌ Géolocalisation non supportée. Utilisez la description.';
    btn.innerHTML = '📡 Obtenir ma position';
    btn.disabled = false;
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      gpsCoords = {lat:pos.coords.latitude, lng:pos.coords.longitude};
      res.style.display='block';
      res.innerHTML = `✅ <strong>Position obtenue !</strong><br/>📍 Lat: ${gpsCoords.lat.toFixed(5)} — Lng: ${gpsCoords.lng.toFixed(5)}<br/><a href="https://maps.google.com/?q=${gpsCoords.lat},${gpsCoords.lng}" target="_blank" style="color:var(--blue);font-size:11px">Voir sur Google Maps</a>`;
      btn.innerHTML = '🔄 Actualiser la position';
      btn.disabled = false;
    },
    err => {
      res.style.display='block';
      res.innerHTML = `❌ Impossible d'obtenir la position. Utilisez la description manuelle.`;
      btn.innerHTML = '📡 Réessayer';
      btn.disabled = false;
    },
    {enableHighAccuracy:true, timeout:10000}
  );
}
window.getGPS = getGPS;

function goToPayment() {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  const addr = document.getElementById('del-address').value.trim();
  if (locMode==='gps' && !gpsCoords && !addr) {
    showToast('⚠️ Obtenez votre position GPS ou utilisez la description','#F5820A'); return;
  }
  if (locMode==='desc' && !document.getElementById('del-desc').value.trim()) {
    showToast('⚠️ Décrivez votre position','#F5820A'); return;
  }
  const items = Object.values(cart);
  let recapHtml = items.map(a => `
    <div class="recap-item">
      <div><span class="recap-name">${a.name}</span><span class="recap-qty">x${a.qty}</span></div>
      <div class="recap-price">${fmt(a.price*a.qty)}</div>
    </div>`).join('');
  document.getElementById('recap-items').innerHTML = recapHtml;
  document.getElementById('recap-total-val').textContent = fmt(cartTotal());
  showView('payment');
}
window.goToPayment = goToPayment;

// ════════════════════════════════════════
// PAIEMENT
// ════════════════════════════════════════
// ════════════════════════════════════════
// PAIEMENT — Sélection du mode
// ════════════════════════════════════════
function selectPay(mode) {
  selectedPayment = mode;
  ['tmoney','flooz','livraison'].forEach(m => {
    const el = document.getElementById('pay-'+m);
    if (el) el.classList.toggle('selected', m === mode);
  });
}
window.selectPay = selectPay;

// ════════════════════════════════════════
// PAYGATE — proxy Cloudflare Worker
// ════════════════════════════════════════
const PAYGATE_PROXY  = 'https://paygate-proxy.ethancarter170407.workers.dev';
const PAYGATE_ACTIVE = true;

// ── Initier un paiement PayGate Global Togo (Méthode 1 — API v1/pay) ──
// Paramètres exacts selon documentation paygateglobal.com :
//   auth_token, phone_number, amount, description, identifier, network (TMONEY|FLOOZ)
// Réponse : { tx_reference, status }  — status 0=enregistré, 2=jeton invalide, 4=params invalides, 6=doublon
async function paygateInitPayment({ channel, amount, phone, reference, description }) {
  const networkStr = channel === 'tmoney' ? 'TMONEY' : 'FLOOZ';

  const response = await fetch(PAYGATE_PROXY, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action:       'pay',
      phone_number: phone,                          // ✅ phone_number (pas phone)
      amount:       Math.round(amount),
      description:  description || 'Commande OmniService TG',
      identifier:   reference,                      // ✅ identifier unique requis
      network:      networkStr,                     // ✅ "TMONEY" ou "FLOOZ" (pas 1 ou 2)
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `PayGate HTTP ${response.status}`);
  }

  const data = await response.json();
  // status 0 = transaction enregistrée avec succès → notification USSD envoyée au client
  // status 2 = jeton invalide
  // status 4 = paramètres invalides
  // status 6 = doublon (identifier déjà utilisé)
  const s = parseInt(data.status, 10);
  if (s !== 0) {
    const msgs = { 2: 'Jeton API invalide', 4: 'Paramètres invalides', 6: 'Référence déjà utilisée' };
    throw new Error(msgs[s] || `Erreur PayGate (code ${s})`);
  }

  // tx_reference = identifiant unique généré par PayGate pour cette transaction
  const txReference = data.tx_reference || '';
  return {
    success:     true,
    txReference,          // utilisé pour le polling statut v1
    identifier:  reference, // utilisé pour le polling statut v2
    message:     data.message || '',
  };
}

// ── Vérifier le statut d'un paiement (API v1/status par tx_reference) ──
// Paramètres : auth_token, tx_reference
// Réponse : { tx_reference, identifier, payment_reference, status, datetime, payment_method }
// Statuts : 0=succès, 2=en cours, 4=expiré, 6=annulé
async function paygateCheckStatus(txReference) {
  if (!txReference) {
    console.warn('[PayGate] paygateCheckStatus appelé sans tx_reference');
    return { status: 2 }; // continuer à attendre
  }
  const response = await fetch(PAYGATE_PROXY, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'status', tx_reference: txReference }), // ✅ tx_reference (pas transaction_id)
  });
  if (!response.ok) throw new Error(`PayGate status HTTP ${response.status}`);
  return await response.json();
}

// Non utilisé mais conservé pour compatibilité
function paygateWaitForPayment(txReference, maxWait = 120000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const interval = setInterval(async () => {
      try {
        const data = await paygateCheckStatus(txReference);
        const s    = parseInt(data.status, 10);
        const done = s === 0 || s === 4 || s === 6 || Date.now() - start >= maxWait;
        if (done) {
          clearInterval(interval);
          resolve({ success: s === 0, status: s, message: data.message || '' });
        }
      } catch(e) {
        if (Date.now() - start >= maxWait) {
          clearInterval(interval);
          resolve({ success: false, status: -1, message: 'Délai dépassé' });
        }
      }
    }, 5000);
  });
}

// ── État global pour le flux de paiement modal ──
let _pgPendingOrderData = null; // Données commande en attente de confirmation paiement
let _ussdTimer          = null;
let _ussdCountdown      = 120;
let _ussdChannel        = '';

// ── Formater le numéro dans les modals ──
function formatPayPhone(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 8);
  input.value = v.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}
window.formatPayPhone = formatPayPhone;

// ── Ouvrir/fermer les modals de saisie ──
function openPayModal(channel) {
  const total = cartTotal();
  const display = document.getElementById(channel + '-amount-display');
  if (display) display.textContent = fmt(total);
  const btn = document.getElementById(channel + '-pay-btn');
  if (btn) btn.textContent = (channel === 'tmoney' ? '💙' : '🧡') + ' Payer ' + fmt(total) + ' avec ' + (channel === 'tmoney' ? 'T-Money' : 'Flooz');
  document.getElementById('modal-' + channel).classList.add('show');
  setTimeout(() => document.getElementById(channel + '-phone')?.focus(), 300);
}
window.openPayModal = openPayModal;

function closePayModal(modalId) {
  document.getElementById(modalId).classList.remove('show');
  // Nettoyer le champ de confirmation Flooz s'il existe
  const confirmBox = document.getElementById('flooz-confirm-box');
  if (confirmBox) confirmBox.remove();
}
window.closePayModal = closePayModal;

// ── Soumettre le paiement mobile (T-Money ou Flooz) ──
async function submitMobilePayment(channel) {
  if (!PAYGATE_ACTIVE) {
    showToast('⚠️ Paiement mobile temporairement indisponible. Choisissez "Paiement à la livraison".', '#F5820A');
    closePayModal('modal-' + channel);
    return;
  }

  const phoneRaw = document.getElementById(channel + '-phone').value.replace(/\s/g,'');
  if (phoneRaw.length < 8) {
    showToast('⚠️ Numéro ' + (channel === 'tmoney' ? 'T-Money' : 'Flooz') + ' invalide (8 chiffres requis)', '#F5820A');
    return;
  }

  // ── Protection Flooz : confirmation des 4 derniers chiffres du numéro ──
  // Flooz (Moov Africa) débite directement sans code PIN USSD.
  // On demande les 4 derniers chiffres du numéro saisi pour éviter tout débit accidentel.
  if (channel === 'flooz') {
    const last4Expected = phoneRaw.slice(-4);

    // Injecter le champ de confirmation s'il n'existe pas déjà
    let confirmBox = document.getElementById('flooz-confirm-box');
    if (!confirmBox) {
      const payForm = document.querySelector('#modal-flooz .pay-form');
      if (payForm) {
        const box = document.createElement('div');
        box.id = 'flooz-confirm-box';
        box.className = 'pay-field';
        box.style.marginTop = '10px';
        box.innerHTML = `
          <label style="color:#BF360C;font-weight:700">🔐 Confirmation — 4 derniers chiffres de votre numéro Flooz</label>
          <input type="tel" id="flooz-confirm-input" placeholder="Ex : 3 3 3 3" maxlength="5"
                 style="border-color:#F5820A;letter-spacing:4px;font-size:20px;font-weight:700;text-align:center"
                 oninput="this.value=this.value.replace(/\\D/g,'').slice(0,4)" autocomplete="off"/>
          <div id="flooz-confirm-err" style="color:#C62828;font-size:11px;margin-top:4px;display:none">
            ❌ Les chiffres ne correspondent pas. Vérifiez votre numéro Flooz.
          </div>`;
        payForm.appendChild(box);
        // Focus automatique
        setTimeout(() => document.getElementById('flooz-confirm-input')?.focus(), 100);
      }
      return; // Premier clic = afficher le champ, pas encore payer
    }

    // Deuxième clic = vérifier la confirmation
    const confirmInput = document.getElementById('flooz-confirm-input');
    const confirmErr   = document.getElementById('flooz-confirm-err');
    const entered = (confirmInput?.value || '').replace(/\D/g,'');

    if (entered.length < 4) {
      if (confirmErr) { confirmErr.textContent = '⚠️ Saisissez les 4 derniers chiffres de votre numéro Flooz.'; confirmErr.style.display = 'block'; }
      confirmInput?.focus();
      return;
    }

    if (entered !== last4Expected) {
      if (confirmErr) { confirmErr.textContent = '❌ Les chiffres ne correspondent pas. Vérifiez votre numéro Flooz.'; confirmErr.style.display = 'block'; }
      confirmInput.value = '';
      confirmInput?.focus();
      return;
    }

    // ✅ Confirmation réussie — nettoyer le champ avant de payer
    if (confirmErr) confirmErr.style.display = 'none';
    confirmBox.remove();
  }

  const btn = document.getElementById(channel + '-pay-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Connexion à PayGate...';

  try {
    const total = cartTotal();
    const reference = 'OMN-' + Date.now();

    const pgResult = await paygateInitPayment({
      channel,
      amount:      total,
      phone:       phoneRaw,
      reference,
      description: 'Commande OmniService TG',
    });

    // Fermer modal saisie, ouvrir modal USSD avec tx_reference et identifier
    closePayModal('modal-' + channel);
    showUssdWaiting(channel, pgResult.txReference, pgResult.identifier, reference);

  } catch(pgErr) {
    console.warn('[PayGate] Erreur init:', pgErr.message);
    showToast('❌ ' + pgErr.message, '#C62828');
    btn.disabled = false;
    btn.textContent = (channel === 'tmoney' ? '💙' : '🧡') + ' Payer ' + fmt(cartTotal()) + ' avec ' + (channel === 'tmoney' ? 'T-Money' : 'Flooz');
  }
}
window.submitMobilePayment = submitMobilePayment;

// ── Modal en attente de paiement ──
// T-Money : notification USSD interactive → client doit confirmer sur son téléphone
// Flooz   : Moov débite directement sans confirmation → on attend juste le résultat du polling
function showUssdWaiting(channel, txId, identifier, reference) {
  _ussdChannel = channel;
  const isTmoney = channel === 'tmoney';
  const ico = isTmoney ? '💙' : '🧡';

  document.getElementById('ussd-ico').textContent = ico;

  if (isTmoney) {
    document.getElementById('ussd-title').textContent = 'Demande envoyée';
    document.getElementById('ussd-sub').textContent   = 'Confirmez le paiement Togocel sur votre téléphone.';
  } else {
    // Flooz : pas de confirmation USSD, Moov traite directement
    document.getElementById('ussd-title').textContent = 'Paiement en cours';
    document.getElementById('ussd-sub').textContent   = 'Moov Africa traite votre paiement Flooz. Aucune action requise sur votre téléphone.';
  }

  ['pg-step-1','pg-step-2','pg-step-3','pg-step-4'].forEach((id,i) => {
    const el = document.getElementById(id);
    el.classList.remove('done','active');
    if (i === 0) el.classList.add('done');
    if (i === 1) el.classList.add('active');
  });

  // Adapter les libellés des étapes selon le réseau
  const step2el = document.getElementById('pg-step-2');
  const step3el = document.getElementById('pg-step-3');
  if (step2el) step2el.innerHTML = isTmoney
    ? '<span class="ussd-step-ico">📲</span>Notification USSD envoyée sur votre téléphone'
    : '<span class="ussd-step-ico">⚡</span>Traitement en cours chez Moov Africa';
  if (step3el) step3el.innerHTML = isTmoney
    ? '<span class="ussd-step-ico">⏳</span>En attente de votre confirmation...'
    : '<span class="ussd-step-ico">💳</span>Vérification du débit Flooz...';

  document.getElementById('ussd-bar-fill').style.width = '0%';
  _ussdCountdown = 120;
  document.getElementById('ussd-countdown').textContent = _ussdCountdown;
  document.getElementById('ussd-overlay').classList.add('show');

  clearInterval(_ussdTimer);
  _ussdTimer = setInterval(() => {
    _ussdCountdown--;
    document.getElementById('ussd-countdown').textContent = _ussdCountdown;
    document.getElementById('ussd-bar-fill').style.width = ((120 - _ussdCountdown) / 120 * 100) + '%';
    if (_ussdCountdown <= 0) {
      clearInterval(_ussdTimer);
      closeUssdAndShowResult('timeout', reference, null);
    }
  }, 1000);

  pollPaygateStatus(txId, identifier, reference, channel);
}


async function pollPaygateStatus(txReference, identifier, reference, channel) {
  const start = Date.now();
  const MAX   = 120000;
  // Avancer les étapes visuelles après 3s
  setTimeout(() => {
    document.getElementById('pg-step-2').classList.replace('active','done');
    document.getElementById('pg-step-3').classList.add('active');
  }, 3000);

  while (Date.now() - start < MAX) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const data = await paygateCheckStatus(txReference);
      const s    = parseInt(data.status, 10);
      // Statuts PayGate Global : 0=succès, 2=en cours, 4=expiré, 6=annulé
      if (s === 0) {
        document.getElementById('pg-step-3').classList.replace('active','done');
        document.getElementById('pg-step-4').classList.add('active');
        await new Promise(r => setTimeout(r, 800));
        closeUssdAndShowResult('success', reference, txReference);
        return;
      }
      if (s === 4) { closeUssdAndShowResult('expired',   reference, txReference); return; }
      if (s === 6) { closeUssdAndShowResult('cancelled', reference, txReference); return; }
      // s === 2 = en cours → continuer le polling
    } catch(e) { /* erreur réseau passagère → continuer */ }
  }
  closeUssdAndShowResult('timeout', reference, null);
}

function cancelUssdPayment() {
  clearInterval(_ussdTimer);
  document.getElementById('ussd-overlay').classList.remove('show');
  // Réactiver le bouton
  const btn = document.getElementById(_ussdChannel + '-pay-btn');
  if (btn) { btn.disabled = false; btn.textContent = (_ussdChannel === 'tmoney' ? '💙' : '🧡') + ' Payer ' + fmt(cartTotal()) + ' avec ' + (_ussdChannel === 'tmoney' ? 'T-Money' : 'Flooz'); }
  showToast('Paiement annulé', '#F5820A');
}
window.cancelUssdPayment = cancelUssdPayment;

function closeUssdAndShowResult(state, reference, txId) {
  clearInterval(_ussdTimer);
  document.getElementById('ussd-overlay').classList.remove('show');
  const ico   = document.getElementById('pg-result-ico');
  const title = document.getElementById('pg-result-title');
  const sub   = document.getElementById('pg-result-sub');
  const ref   = document.getElementById('pg-result-ref');
  const btnP  = document.getElementById('pg-result-btn-primary');

  if (state === 'success') {
    ico.textContent    = '✅';
    title.textContent  = 'Paiement confirmé !';
    title.style.color  = '#2E7D32';
    sub.textContent    = 'Votre paiement a été validé. La commande va être enregistrée.';
    ref.textContent    = 'Réf : ' + (txId || reference);
    ref.style.color    = '#2E7D32';
    btnP.textContent   = '📦 Voir ma commande';
    btnP.style.display = 'block';
    // Enregistrer la commande dans Firestore
    _pgPendingOrderData = { paygateStatus: 'success', paygateTransactionId: txId || '', paygateReference: reference, phoneUsed: document.getElementById(_ussdChannel + '-phone')?.value.replace(/\s/g,'') || '' };
  } else {
    ico.textContent    = state === 'timeout' ? '⏰' : '❌';
    title.textContent  = state === 'timeout' ? 'Délai dépassé' : state === 'expired' ? 'Paiement expiré' : 'Paiement annulé';
    title.style.color  = '#C62828';
    sub.textContent    = 'Aucun montant débité. Réessayez ou choisissez un autre mode de paiement.';
    ref.textContent    = 'Aucune commande créée';
    ref.style.color    = '#C62828';
    btnP.style.display = 'none';
    _pgPendingOrderData = null;
  }
  document.getElementById('pg-result-overlay').classList.add('show');
}

async function onPaymentResultClose(confirmed) {
  document.getElementById('pg-result-overlay').classList.remove('show');
  if (confirmed && _pgPendingOrderData) {
    await finalizeOrder(_pgPendingOrderData);
    _pgPendingOrderData = null;
  }
}
window.onPaymentResultClose = onPaymentResultClose;

// ════════════════════════════════════════
// CONFIRM ORDER — redirige vers modal si mobile, direct si livraison
// ════════════════════════════════════════
async function confirmOrder() {
  if (!currentUser) { openAuthModal('login'); return; }

  if (selectedPayment === 'tmoney' || selectedPayment === 'flooz') {
    openPayModal(selectedPayment);
    return; // la suite se passe dans submitMobilePayment → pollPaygateStatus → finalizeOrder
  }

  // Paiement à la livraison — flux direct
  await finalizeOrder({ paygateStatus: 'non_configure', paygateTransactionId: '', paygateReference: '' });
}

// ── finalizeOrder : crée la commande dans Firestore (appelé après paiement confirmé ou livraison) ──
async function finalizeOrder(pgData = {}) {
  const svc   = SVCS[currentService];
  const addr  = document.getElementById('del-address')?.value.trim() || '';
  const notes = document.getElementById('del-notes')?.value.trim()   || '';
  let positionData = {};

  // Localisation GPS injectée par localisation-module.js (catalogue / restaurant)
  const catSnap = window._catGpsSnapshot || null;
  if (catSnap) {
    positionData = {
      positionType:    'GPS',
      clientLat:       catSnap.lat,
      clientLng:       catSnap.lng,
      distanceKm:      parseFloat(catSnap.km.toFixed(2)),
      fraisLivraison:  catSnap.fare,
      positionDesc:    catSnap.desc || '',
    };
    window._catGpsSnapshot = null;
  } else if (locMode === 'gps' && gpsCoords) {
    positionData = {positionType:'GPS', lat:gpsCoords.lat, lng:gpsCoords.lng};
  } else {
    positionData = {positionType:'description', positionDesc: document.getElementById('del-desc')?.value.trim()||''};
  }

  // Utiliser le total avec frais si calculé par localisation-module.js
  const _totalOverride = window._catTotalWithFrais || null;
  if (_totalOverride) window._catTotalWithFrais = null;

  const btn = document.getElementById('confirm-btn');
  if (btn) { btn.innerHTML = '<span class="spinner"></span> Enregistrement...'; btn.disabled = true; }

  try {
    const items = Object.values(cart).map(a=>({id:a.id,name:a.name,price:a.price,qty:a.qty}));
    const total = _totalOverride !== null ? _totalOverride : cartTotal();
    const restaurantInfo = (currentService === 'restaurant' && currentRestaurant)
      ? { restaurantId: currentRestaurant.id, restaurantNom: currentRestaurant.nom } : {};
    const kitInfo = (currentService === 'kits' && currentKit)
      ? { kitId: currentKit.id, kitNom: currentKit.nom } : {};

    const docRef = await addDoc(collection(db,'commandes'), {
      service:      currentService,
      serviceName:  currentService === 'restaurant' && currentRestaurant
                      ? `Restaurants — ${currentRestaurant.nom}`
                      : currentService === 'kits' && currentKit
                        ? `Kits/PACKS — ${currentKit.nom}`
                        : svc.name,
      statut:             'En attente',
      uid:                currentUser.uid,
      clientNom:          currentUser.nom    || '',
      clientPrenom:       currentUser.prenom || '',
      clientGenre:        currentUser.genre  || '',
      phone:              currentUser.phone  || '',
      clientVille:        currentUser.ville  || '',
      adresse:            addr,
      notes,
      modePaiement:       selectedPayment,
      paygateTransactionId: pgData.paygateTransactionId || '',
      paygateReference:   pgData.paygateReference      || '',
      paygateStatus:      pgData.paygateStatus          || 'non_configure',
      phonePayment:       pgData.phoneUsed              || '',  // numéro saisi dans la modal
      articles:           items,
      total,
      ...restaurantInfo,
      ...kitInfo,
      ...positionData,
      createdAt: serverTimestamp()
    });

    document.getElementById('succ-msg').innerHTML =
      `Commande <strong style="color:var(--blue)">${svc.name}</strong> confirmée !<br/>
       Référence : <strong>#${docRef.id.slice(0,8).toUpperCase()}</strong><br/>
       ${selectedPayment === 'livraison'
         ? '💵 Paiement à la livraison — notre agent vous contacte bientôt.'
         : `📱 Paiement ${selectedPayment === 'tmoney' ? 'T-Money' : 'Flooz'} confirmé ✅`}<br/>
       <small style="color:var(--light)">Contact : ${currentUser.phone || ''}</small>`;
    cart = {};
    updateCartBar();
    showSuccessView();
  } catch(err) {
    console.error(err);
    showToast('❌ Erreur lors de l\'enregistrement. Vérifiez votre connexion.','#C62828');
  } finally {
    if (btn) { btn.innerHTML = '✅ Confirmer la commande'; btn.disabled = false; }
  }
}
window.finalizeOrder  = finalizeOrder;
window.confirmOrder   = confirmOrder;

// ════════════════════════════════════════
// FORMULAIRE STANDARD (sans champ phone)
// ════════════════════════════════════════
async function submitStandardForm() {
  if (!currentUser) { openAuthModal('login'); return; }

  const svc = SVCS[currentService];
  const btn = document.getElementById('form-submit-btn');
  const data = {
    service:      currentService,
    serviceName:  svc.name,
    statut:       'En attente',
    // Satisfait totalIsConsistent() côté Firestore rules
    besoin:       svc.name,
    // Satisfait mobilePaymentOk() côté Firestore rules
    modePaiement:  'livraison',
    paygateStatus: 'non_configure',
    // Infos client issues du profil
    uid:          currentUser.uid,
    clientNom:    currentUser.nom    || '',
    clientPrenom: currentUser.prenom || '',
    clientGenre:  currentUser.genre  || '',
    phone:        currentUser.phone  || '',
    clientVille:  currentUser.ville  || '',
    createdAt:    serverTimestamp()
  };
  let valid = true;

  svc.fields.forEach(f => {
    const el = document.getElementById(`ff-${f.n}`);
    if (!el) return;
    const val = el.value.trim();
    if (!f.opt && !val) { el.style.borderColor='#F5820A'; valid=false; }
    else { el.style.borderColor=''; data[f.n]=val; }
  });

  if (!valid) { showToast('⚠️ Remplissez tous les champs obligatoires','#F5820A'); return; }

  btn.innerHTML = '<span class="spinner"></span> Envoi...';
  btn.disabled = true;

  try {
    const docRef = await addDoc(collection(db,'commandes'), data);
    document.getElementById('succ-msg').innerHTML =
      `Demande <strong style="color:var(--blue)">${svc.name}</strong> envoyée !<br/>
       Référence : <strong>#${docRef.id.slice(0,8).toUpperCase()}</strong><br/>
       Notre équipe vous contactera très bientôt.`;
    showSuccessView();
  } catch(err) {
    showToast('❌ Erreur d\'envoi. Vérifiez votre connexion.','#C62828');
  } finally {
    btn.innerHTML = '📨 Envoyer ma demande';
    btn.disabled = false;
  }
}
window.submitStandardForm = submitStandardForm;

// ════════════════════════════════════════
// IMMOBILIER — SOUS-MENU DES CATÉGORIES
// ════════════════════════════════════════
const IMMO_CATEGORIES = [
  { id:'immo_construction',       label:'Nouvelles constructions',                     emoji:'🏗️', color:'#E8F5E9' },
  { id:'immo_appart_louer',       label:'Maisons & appartements à louer',              emoji:'🏠', color:'#E3F2FD' },
  { id:'immo_appart_vendre',      label:'Maisons & appartements à vendre',             emoji:'🏡', color:'#FFF8E1' },
  { id:'immo_terrain_louer',      label:'Terrains & parcelles à louer',                emoji:'🌿', color:'#E8F5E9' },
  { id:'immo_terrain_vendre',     label:'Terrains & parcelles à vendre',               emoji:'🗺️', color:'#FFF3E0' },
  { id:'immo_commercial_louer',   label:'Propriété commerciale à louer',               emoji:'🏪', color:'#EDE7F6' },
  { id:'immo_commercial_vendre',  label:'Propriété commerciale à vendre',              emoji:'🏬', color:'#FCE4EC' },
  { id:'immo_evenementiel',       label:'Centres événementiels & lieux',               emoji:'🎪', color:'#E0F7FA' },
  { id:'immo_courte_duree',       label:'Propriété en location courte durée',          emoji:'🛏️', color:'#FBE9E7' },
  { id:'immo_assistance',         label:'Assistance Immobilière',                       emoji:'🤝', color:'#EDE7F6' },
  { id:'immo_gestion',            label:'Gestion Locative',                              emoji:'🏛️', color:'#FFF3E0' },
];

function showImmoSubMenu() {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour accéder', '#F5820A'); return; }

  // Utiliser la vue kits pour afficher le sous-menu
  const svc = SVCS['immobilier'];
  document.getElementById('kits-svc-ico').style.background = svc.bg;
  document.getElementById('kits-svc-ico').textContent = svc.icon;
  document.getElementById('kits-svc-title').textContent = svc.name;

  const titleEl = document.getElementById('kits-section-title');
  if (titleEl) titleEl.textContent = '🏢 Choisissez une catégorie';

  const container = document.getElementById('kits-list');
  if (!container) return;

  const SELECTION_IDS = ['immo_assistance', 'immo_gestion'];
  container.innerHTML = IMMO_CATEGORIES.map(cat => {
    const isSelection = SELECTION_IDS.includes(cat.id);
    const actionLabel = isSelection ? 'Faire une demande' : 'Voir les annonces';
    const badgeLabel  = isSelection ? 'Service' : 'Immobilier';
    const badgeStyle  = isSelection
      ? 'color:#7B1FA2;background:#EDE7F6'
      : 'color:#2E7D32;background:#E8F5E9';
    return `
    <div class="kit-card" onclick="openImmoService('${cat.id}')" style="cursor:pointer">
      <div class="kit-body">
        <div>
          <div class="kit-badge" style="${badgeStyle}">${badgeLabel}</div>
          <div class="kit-name">${cat.label}</div>
        </div>
        <div class="kit-footer">
          <div style="font-size:11px;color:#1E6FBE;font-weight:600">${actionLabel}</div>
          <div class="kit-count">›</div>
        </div>
      </div>
      <div class="kit-img-wrap" style="background:${cat.color}">
        <span style="font-size:42px">${cat.emoji}</span>
      </div>
    </div>`;
  }).join('');

  showView('kits');
}
window.showImmoSubMenu = showImmoSubMenu;

function openImmoService(svcId) {
  // immo_assistance et immo_gestion → formulaire de sélection (type selection)
  if (svcId === 'immo_assistance' || svcId === 'immo_gestion') {
    // Chercher dans IMMO_ENVELOPE exposé depuis index.html
    const env = window._IMMO_ENVELOPE_REF;
    const sub = env ? env.subServices.find(s => s.id === svcId) : null;
    if (sub && window.renderImmoSelection) {
      window.renderImmoSelection(sub);
    } else if (window.openImmoSubService) {
      window.openImmoSubService(svcId);
    }
    return;
  }

  const svc = SVCS[svcId];
  if (!svc) return;
  currentService = svcId;
  cart = {};
  window.cart = cart;

  document.getElementById('cat-ico').style.background = svc.bg || '#E8F5E9';
  document.getElementById('cat-ico').textContent = svc.icon;
  document.getElementById('cat-title').textContent = svc.name;

  const backBtn = document.getElementById('catalogue-back-btn');
  if (backBtn) backBtn.onclick = () => showImmoSubMenu();

  loadCatalogue(svcId);
  showView('catalogue');
}
window.openImmoService = openImmoService;

// ════════════════════════════════════════
// IMMOBILIER — CATÉGORIES (ancien système kits)
// ════════════════════════════════════════
let _immoFormBackFn = null;

function immoFormGoBack() {
  if (typeof _immoFormBackFn === 'function') {
    _immoFormBackFn();
  } else {
    showView('immo-options');
  }
}
window.immoFormGoBack = immoFormGoBack;
let currentImmoOption   = null; // mini-prestation sélectionnée
let currentImmoCategory = null; // catégorie immo courante

function openImmoCategory(kitId, kitNom, kitEmoji, kitDesc, kitCat) {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  // Gestion Locative → modal type de bien
  if (kitId === 'immo3') {
    showGestionLocativeModal();
    return;
  }
  // Assistance Diaspora → modal prestations
  if (kitId === 'immo4') {
    showAssistanceModal();
    return;
  }

  currentImmoCategory = null;

  // Chercher le kit dans DEFAULT_KITS
  let cat = DEFAULT_KITS.find(k => k.id === kitId);
  if (!cat) { showToast('❌ Catégorie introuvable.', '#C62828'); return; }
  currentImmoCategory = cat;

  // Mettre à jour le header
  const ico   = document.getElementById('immo-options-ico');
  const title = document.getElementById('immo-options-title');
  const back  = document.getElementById('immo-options-back-btn');
  if (ico)   { ico.textContent = kitEmoji; }
  if (title) title.textContent = kitNom;
  if (back)  back.onclick = () => showView('kits');

  // Rendre les options (articles du kit)
  const list = document.getElementById('immo-options-list');
  if (!list) return;
  const articles = cat.articles || [];
  if (!articles.length) {
    list.innerHTML = `<div style="text-align:center;padding:40px;color:#9999BB">Aucune prestation disponible.</div>`;
    showView('immo-options');
    return;
  }

  list.innerHTML = articles.map((a, idx) => `
    <div class="kit-card" onclick="openImmoForm('${kitId}','${(kitNom||'').replace(/'/g,"\\'")}','${kitEmoji}','${kitCat||''}',${idx})" style="cursor:pointer">
      <div class="kit-body">
        <div>
          <div class="kit-badge" style="color:#2E7D32;background:#E8F5E9">${kitCat||'Immobilier'}</div>
          <div class="kit-name">${a.name}</div>
        </div>
        <div class="kit-footer">
          <div style="font-size:11px;color:#1E6FBE;font-weight:600">Faire une demande</div>
          <div class="kit-count">→</div>
        </div>
      </div>
      <div class="kit-img-wrap" style="background:#E8F5E9">
        <span>${a.emoji||'🏢'}</span>
      </div>
    </div>`).join('');

  showView('immo-options');
}
window.openImmoCategory = openImmoCategory;

function openImmoForm(kitId, kitNom, kitEmoji, kitCat, articleIdx) {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A'); return; }
  if (!currentImmoCategory) {
    let cat = DEFAULT_KITS.find(k => k.id === kitId);
    if (cat) currentImmoCategory = cat;
  }

  const article = currentImmoCategory?.articles?.[articleIdx];
  if (!article) { showToast('❌ Prestation introuvable.', '#C62828'); return; }

  currentImmoOption = { kitId, kitNom, kitEmoji, kitCat, article, articleIdx };

  // Mettre à jour le header et le hero
  document.getElementById('immo-form-ico').textContent = article.emoji || kitEmoji;
  document.getElementById('immo-form-title').textContent = article.name;
  document.getElementById('immo-form-hero-emoji').textContent = article.emoji || kitEmoji;
  document.getElementById('immo-form-category').textContent = kitCat || 'Service Immobilier';
  document.getElementById('immo-form-prestation-name').textContent = article.name;
  document.getElementById('immo-form-prestation-desc').textContent = currentImmoCategory?.description || '';

  // Bouton retour vers les options
  _immoFormBackFn = () => showView('immo-options');

  // Afficher le bandeau "bientôt disponible" si service pas encore actif
  const svc = SVCS['immobilier'];
  const soonEl = document.getElementById('immo-form-soon');
  if (soonEl) soonEl.style.display = (!svc.active && svc.soon) ? 'block' : 'none';

  // Réinitialiser les champs
  ['immo-ff-besoin','immo-ff-localisation','immo-ff-budget','immo-ff-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const dateEl = document.getElementById('immo-ff-date');
  if (dateEl) dateEl.value = '';

  showView('immo-form');
}
window.openImmoForm = openImmoForm;

async function submitImmoForm() {
  if (!currentUser) { openAuthModal('login'); return; }

  const besoin = document.getElementById('immo-ff-besoin')?.value.trim();
  const date   = document.getElementById('immo-ff-date')?.value.trim();
  const notes  = document.getElementById('immo-ff-notes')?.value.trim();

  if (!besoin) {
    const besoinEl = document.getElementById('immo-ff-besoin');
    if (besoinEl) besoinEl.style.borderColor = '#F5820A';
    showToast('⚠️ Remplissez les champs obligatoires', '#F5820A');
    return;
  }

  const btn = document.getElementById('immo-form-submit-btn');
  if (btn) { btn.innerHTML = '<span class="spinner"></span> Envoi...'; btn.disabled = true; }

  try {
    let serviceName, immoCategorieId, immoCategorieNom, immoPrestation, immoPrestationEmoji;
    let localisation = '', budget = '';

    if (currentImmoOption) {
      // Cas standard : Gestion Locative, Assistance, kits immo
      const { kitId, kitNom, kitEmoji, kitCat, article, bienType } = currentImmoOption;
      const locEl    = document.getElementById('immo-ff-localisation');
      const budgetEl = document.getElementById('immo-ff-budget');
      localisation   = locEl?.style.display !== 'none' ? locEl?.value.trim() || '' : '';
      budget         = budgetEl?.style.display !== 'none' ? budgetEl?.value.trim() || '' : '';

      serviceName = bienType
        ? `Immobilier — Gestion Locative — ${bienType}`
        : `Immobilier — ${kitNom} — ${article.name}`;
      immoCategorieId      = kitId;
      immoCategorieNom     = kitNom;
      immoPrestation       = article.name;
      immoPrestationEmoji  = article.emoji || '🏢';
    } else {
      // Cas À louer / À vendre : lire depuis le DOM
      const nom   = document.getElementById('immo-form-prestation-name')?.textContent.trim() || '';
      const cat   = document.getElementById('immo-form-category')?.textContent.trim() || 'Service Immobilier';
      const emoji = document.getElementById('immo-form-hero-emoji')?.textContent.trim() || '🏢';
      serviceName         = cat + ' — ' + nom;
      immoCategorieNom    = cat;
      immoPrestation      = nom;
      immoPrestationEmoji = emoji;
    }

    const docRef = await addDoc(collection(db,'commandes'), {
      service:             'immobilier',
      serviceName,
      statut:              'En attente',
      prestation:          immoPrestation,
      modePaiement:        'livraison',
      paygateStatus:       'non_configure',
      immoCategorieId:     immoCategorieId   || '',
      immoCategorieNom:    immoCategorieNom  || '',
      immoPrestation:      immoPrestation    || '',
      immoPrestationEmoji: immoPrestationEmoji || '🏢',
      besoin,
      localisation,
      budget:              budget || '',
      dateSouhaitee:       date   || '',
      notes:               notes  || '',
      uid:                 currentUser.uid,
      clientNom:           currentUser.nom    || '',
      clientPrenom:        currentUser.prenom || '',
      clientGenre:         currentUser.genre  || '',
      phone:               currentUser.phone  || '',
      clientVille:         currentUser.ville  || '',
      createdAt:           serverTimestamp()
    });

    document.getElementById('succ-msg').innerHTML =
      `Demande <strong style="color:var(--blue)">${immoPrestation}</strong> envoyée !<br/>
       Référence : <strong>#${docRef.id.slice(0,8).toUpperCase()}</strong><br/>
       Notre équipe immobilière vous contactera très bientôt.<br/>
       <small style="color:var(--light)">Contact : ${currentUser.phone || ''}</small>`;

    const succBtn = document.getElementById('succ-view-orders-btn');
    if (succBtn) succBtn.style.display = 'block';
    currentImmoOption    = null;
    currentImmoCategory  = null;
    showSuccessView();
  } catch(err) {
    console.error(err);
    showToast('❌ Erreur d\'envoi. Vérifiez votre connexion.', '#C62828');
  } finally {
    if (btn) { btn.innerHTML = '📨 Envoyer ma demande'; btn.disabled = false; }
    // Réinitialiser tous les champs du formulaire
    ['immo-ff-besoin','immo-ff-localisation','immo-ff-budget','immo-ff-notes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; el.style.borderColor = ''; }
    });
    const df = document.getElementById('immo-ff-date');    if (df) df.value = '';
    const sf = document.getElementById('immo-ff-type-select'); if (sf) sf.value = '';
  }
}
window.submitImmoForm = submitImmoForm;

// ════════════════════════════════════════
// ANNULATION / SUPPRESSION DE COMMANDE
// (seulement si statut = "En attente")
// ════════════════════════════════════════
async function cancelOrder(orderId, orderName) {
  if (!currentUser) return;

  // Confirmation via la modal dédiée dans le HTML
  const modal = document.getElementById('cancel-order-modal');
  const nameEl = document.getElementById('cancel-order-name');
  const refEl  = document.getElementById('cancel-order-ref');
  if (!modal) {
    // Fallback confirm natif
    if (!confirm(`Annuler et supprimer la commande "${orderName}" ?`)) return;
    await _doDeleteOrder(orderId);
    return;
  }
  if (nameEl) nameEl.textContent = orderName || 'cette commande';
  if (refEl)  refEl.textContent  = '#' + orderId.slice(0, 8).toUpperCase();
  modal.style.display = 'flex';
  // Les boutons de la modal appellent confirmCancelOrder / closeCancelModal
  window._pendingCancelId   = orderId;
  window._pendingCancelName = orderName;
}
window.cancelOrder = cancelOrder;

async function confirmCancelOrder() {
  const id = window._pendingCancelId;
  if (!id) return;
  closeCancelModal();
  await _doDeleteOrder(id);
  window._pendingCancelId   = null;
  window._pendingCancelName = null;
}
window.confirmCancelOrder = confirmCancelOrder;

function closeCancelModal() {
  const modal = document.getElementById('cancel-order-modal');
  if (modal) modal.style.display = 'none';
}
window.closeCancelModal = closeCancelModal;

async function _doDeleteOrder(orderId) {
  try {
    // Vérifier une dernière fois que le statut est bien "En attente"
    const snap = await getDoc(doc(db, 'commandes', orderId));
    if (!snap.exists()) { showToast('❌ Commande introuvable.', '#C62828'); return; }
    const data = snap.data();
    if (data.statut !== 'En attente') {
      showToast('⛔ Impossible : la commande n\'est plus en attente.', '#C62828');
      loadMyOrders();
      return;
    }
    // Mettre le statut à "Annulée" au lieu de supprimer (les rules Firestore permettent l'update)
    await updateDoc(doc(db, 'commandes', orderId), {
      statut: 'Annulée',
      cancelledAt: serverTimestamp()
    });
    showToast('🗑️ Commande annulée avec succès.', '#4A4A6A');
    loadMyOrders();
  } catch(e) {
    console.error(e);
    showToast('❌ Erreur lors de l\'annulation.', '#C62828');
  }
}

// ════════════════════════════════════════
// COMMANDES — CHARGEMENT LIÉ AU COMPTE
// ════════════════════════════════════════
async function loadMyOrders() {
  const out = document.getElementById('orders-out');
  if (!out) return;
  if (!currentUser) {
    out.innerHTML = `
      <div class="orders-empty">
        <div class="orders-empty-ico">🔐</div>
        <div class="orders-empty-title">Connexion requise</div>
        <div class="orders-empty-sub">Connectez-vous pour voir vos commandes.</div>
        <button class="btn-primary" style="max-width:220px;margin:20px auto 0" onclick="openAuthModal('login')">Se connecter</button>
      </div>`;
    return;
  }

  out.innerHTML = `
    <div class="orders-empty">
      <div class="orders-empty-ico" style="animation:spin .8s linear infinite;display:inline-block">⏳</div>
      <div class="orders-empty-title">Chargement de vos commandes...</div>
    </div>`;

  try {
    // Requête par UID — avec fallback si l'index composite n'est pas encore créé
    let snap;
    try {
      const q = query(
        collection(db,'commandes'),
        where('uid','==', currentUser.uid),
        orderBy('createdAt','desc')
      );
      snap = await getDocs(q);
    } catch(indexErr) {
      // Index composite manquant → requête sans orderBy, tri côté client
      console.warn('Index Firestore manquant, tri côté client activé. Créez l\'index dans la console Firebase.', indexErr);
      const q2 = query(
        collection(db,'commandes'),
        where('uid','==', currentUser.uid)
      );
      snap = await getDocs(q2);
    }

    // Tri côté client (utile si l'index Firebase n'est pas encore créé)
    const allDocs = [];
    snap.forEach(d => allDocs.push({id:d.id,...d.data()}));
    allDocs.sort((a,b) => {
      const ta = a.createdAt?.seconds || 0;
      const tb = b.createdAt?.seconds || 0;
      return tb - ta;
    });

    if (allDocs.length === 0) {
      out.innerHTML = `
        <div class="orders-empty">
          <div class="orders-empty-ico">📦</div>
          <div class="orders-empty-title">Aucune commande pour l'instant</div>
          <div class="orders-empty-sub">Vos commandes passées apparaîtront ici.</div>
          <button class="btn-primary" style="max-width:220px;margin:20px auto 0" onclick="goTab('services')">Découvrir nos services</button>
        </div>`;
      return;
    }

    const SC = {
      'En attente':{c:'#F5820A',bg:'#FFF3E0'},
      'Confirmée': {c:'#1E6FBE',bg:'#E3F2FD'},
      'En cours':  {c:'#7B1FA2',bg:'#F3E5F5'},
      'Terminée':  {c:'#2E7D32',bg:'#E8F5E9'},
      'Annulée':   {c:'#C62828',bg:'#FFEBEE'}
    };
    const STEPS = ['En attente','Confirmée','En cours','Terminée'];
    let h = `<div style="font-size:12px;color:var(--light);margin-bottom:12px">${allDocs.length} commande${allDocs.length>1?'s':''} trouvée${allDocs.length>1?'s':''}</div>`;

    allDocs.forEach(o => {
      const s = SC[o.statut] || SC['En attente'];
      const idx = STEPS.indexOf(o.statut);
      const dateStr = o.createdAt
        ? new Date(o.createdAt.seconds*1000).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
        : '—';
      const prog = STEPS.map((st,i) => {
        const act = i <= idx;
        return `<div class="prog-dot" style="background:${act?'#1E6FBE':'#E8EAF0'}">${act?'✓':''}</div>
                ${i<3?`<div class="prog-line" style="background:${i<idx?'#1E6FBE':'#E8EAF0'}"></div>`:''}`;
      }).join('');
      const totalStr = o.total ? fmt(o.total) : '';
      const orderName = (o.serviceName||o.service||'Service').replace(/'/g,"\\'");

      // Bouton d'annulation uniquement si "En attente"
      const cancelBtn = (o.statut === 'En attente' || !o.statut)
        ? `<button class="o-cancel-btn" onclick="cancelOrder('${o.id}','${orderName}')">
             🗑️ Annuler la commande
           </button>`
        : '';

      // Bouton "Voir les articles commandés" — toujours visible, même quand Terminée
      const articlesBtn = `<button class="o-articles-btn" onclick="showOrderArticles('${o.id}')">
           📋 Voir les articles commandés
         </button>`;

      h += `<div class="o-card" id="ocard-${o.id}">
        <div class="o-head">
          <div style="flex:1;min-width:0">
            <div class="o-name">${o.serviceName||o.service||'Service'}</div>
            <div class="o-date">📅 ${dateStr}${totalStr?' — '+totalStr:''}</div>
          </div>
          <span class="o-pill" style="background:${s.bg};color:${s.c}">${o.statut||'En attente'}</span>
        </div>
        <div class="o-detail">
          ${o.adresse?`<div class="o-drow"><span class="o-dk">Adresse :</span><span class="o-dv">${o.adresse}</span></div>`:''}
          ${o.modePaiement?`<div class="o-drow"><span class="o-dk">Paiement :</span><span class="o-dv">${o.modePaiement}</span></div>`:''}
          <div class="o-drow"><span class="o-dk">Réf :</span><span class="o-dv">#${o.id.slice(0,8).toUpperCase()}</span></div>
        </div>
        <div class="prog">${prog}</div>
        <div class="prog-lbls">
          <span class="prog-lbl">Reçue</span>
          <span class="prog-lbl">Confirmée</span>
          <span class="prog-lbl">En cours</span>
          <span class="prog-lbl">Terminée</span>
        </div>
        <div class="o-actions">
          ${articlesBtn}
          ${cancelBtn}
        </div>
      </div>`;
    });

    out.innerHTML = h;

  } catch(err) {
    console.error(err);
    out.innerHTML = `
      <div class="orders-empty">
        <div class="orders-empty-ico">❌</div>
        <div class="orders-empty-title">Erreur de connexion</div>
        <div class="orders-empty-sub">Impossible de charger vos commandes.<br/>Vérifiez votre connexion et réessayez.</div>
        <button class="btn-primary" style="max-width:220px;margin:20px auto 0" onclick="loadMyOrders()">🔄 Réessayer</button>
      </div>`;
  }
}
window.loadMyOrders = loadMyOrders;

// ════════════════════════════════════════
// MODAL — VOIR LES ARTICLES D'UNE COMMANDE
// ════════════════════════════════════════
async function showOrderArticles(orderId) {
  // Créer/récupérer le modal
  let modal = document.getElementById('order-articles-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'order-articles-modal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:4000;
      background:rgba(10,18,32,.7);backdrop-filter:blur(4px);
      display:flex;align-items:flex-end;justify-content:center;
      padding:0;
    `;
    modal.innerHTML = `
      <div id="order-articles-sheet" style="
        background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:520px;
        max-height:82vh;display:flex;flex-direction:column;
        box-shadow:0 -8px 40px rgba(0,0,0,.2);
        animation:slideUp .25s cubic-bezier(.4,0,.2,1)
      ">
        <div style="background:linear-gradient(135deg,#1E6FBE,#155A9C);padding:18px 20px;border-radius:24px 24px 0 0;display:flex;align-items:center;gap:12px;flex-shrink:0">
          <div style="font-size:22px">📋</div>
          <div style="flex:1">
            <div style="font-family:'Nunito',sans-serif;font-size:16px;font-weight:800;color:#fff" id="oam-title">Articles commandés</div>
            <div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:1px" id="oam-ref">Réf —</div>
          </div>
          <button onclick="document.getElementById('order-articles-modal').remove()" style="background:rgba(255,255,255,.15);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">✕</button>
        </div>
        <div id="oam-body" style="overflow-y:auto;flex:1;padding:16px"></div>
        <div style="padding:14px 16px;flex-shrink:0;border-top:1px solid #F0F0F8">
          <button onclick="document.getElementById('order-articles-modal').remove()" style="width:100%;background:#F4F6FA;border:1.5px solid #E8EAF0;border-radius:12px;padding:12px;font-size:13px;font-weight:700;color:#1A1A2E;cursor:pointer;font-family:'Poppins',sans-serif">Fermer</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  // Afficher le loading
  const body = document.getElementById('oam-body');
  if (body) body.innerHTML = `<div style="text-align:center;padding:40px;color:#9999BB"><div class="spinner" style="border-color:rgba(30,111,190,.2);border-top-color:#1E6FBE;margin:0 auto 10px"></div>Chargement...</div>`;

  try {
    const snap = await getDoc(doc(db, 'commandes', orderId));
    if (!snap.exists()) {
      if (body) body.innerHTML = `<div style="text-align:center;padding:40px;color:#9999BB">Commande introuvable.</div>`;
      return;
    }
    const o = { id: snap.id, ...snap.data() };

    // Mettre à jour le titre/ref
    const titleEl = document.getElementById('oam-title');
    const refEl   = document.getElementById('oam-ref');
    if (titleEl) titleEl.textContent = o.serviceName || o.service || 'Articles commandés';
    if (refEl)   refEl.textContent   = `Réf #${o.id.slice(0,8).toUpperCase()} · ${o.statut || 'En attente'}`;

    // Construire la liste d'articles
    const articles = o.articles || [];
    const SC = {'En attente':{c:'#F5820A',bg:'#FFF3E0'},'Confirmée':{c:'#1E6FBE',bg:'#E3F2FD'},'En cours':{c:'#7B1FA2',bg:'#F3E5F5'},'Terminée':{c:'#2E7D32',bg:'#E8F5E9'},'Annulée':{c:'#C62828',bg:'#FFEBEE'}};
    const sc = SC[o.statut] || SC['En attente'];

    // Statut pill en haut du contenu
    let html = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding:10px 12px;background:${sc.bg};border-radius:12px">
      <span style="font-size:13px;font-weight:700;color:${sc.c}">● ${o.statut || 'En attente'}</span>
      ${o.total ? `<span style="margin-left:auto;font-size:13px;font-weight:800;color:#1A1A2E">${fmt(o.total)}</span>` : ''}
    </div>`;

    if (articles.length > 0) {
      html += `<div style="font-size:11px;font-weight:800;color:#9999BB;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">🛒 ${articles.length} article${articles.length>1?'s':''}</div>`;
      html += articles.map(a => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#F8F9FE;border-radius:14px;margin-bottom:8px">
          <div style="width:44px;height:44px;border-radius:12px;background:#E8F0FE;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📦</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:#1A1A2E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.name}</div>
            <div style="font-size:11px;color:#9999BB;margin-top:2px">Quantité : <strong style="color:#4A4A6A">× ${a.qty||1}</strong></div>
          </div>
          ${a.price > 0 ? `<div style="font-size:13px;font-weight:800;color:#1E6FBE;white-space:nowrap">${fmt(a.price*(a.qty||1))}</div>` : ''}
        </div>`).join('');
    } else {
      // Formulaire (pas d'articles discrets) — afficher les infos de la demande
      html += `<div style="font-size:11px;font-weight:800;color:#9999BB;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">📝 Détails de la demande</div>`;
      const fields = ['besoin','localisation','type','type_event','nb_personnes','adresse','date','budget','notes','immoPrestation','kitNom'];
      const labels = {besoin:'Besoin',localisation:'Localisation',type:'Type',type_event:'Événement',nb_personnes:'Nb personnes',adresse:'Adresse',date:'Date',budget:'Budget',notes:'Remarques',immoPrestation:'Prestation',kitNom:'Catégorie'};
      let hasField = false;
      fields.forEach(f => {
        if (o[f]) {
          hasField = true;
          html += `<div style="padding:10px 12px;background:#F8F9FE;border-radius:12px;margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;color:#9999BB;text-transform:uppercase;letter-spacing:.5px">${labels[f]||f}</div>
            <div style="font-size:13px;color:#1A1A2E;margin-top:3px;line-height:1.5">${o[f]}</div>
          </div>`;
        }
      });
      if (!hasField) html += `<div style="text-align:center;padding:30px;color:#9999BB;font-size:13px">Aucun détail d'article disponible pour cette commande.</div>`;
    }

    // Infos livraison si disponibles
    if (o.adresse || o.modePaiement) {
      html += `<div style="margin-top:16px;padding:12px;background:#F0F7FF;border-radius:14px;font-size:12px;color:#4A4A6A">`;
      if (o.adresse) html += `<div style="margin-bottom:4px">📍 <strong>Livraison :</strong> ${o.adresse}</div>`;
      if (o.modePaiement) html += `<div>💳 <strong>Paiement :</strong> ${o.modePaiement}</div>`;
      html += `</div>`;
    }

    if (body) body.innerHTML = html;

  } catch(err) {
    console.error(err);
    if (body) body.innerHTML = `<div style="text-align:center;padding:40px;color:#9999BB">Erreur de chargement. Vérifiez votre connexion.</div>`;
  }
}
window.showOrderArticles = showOrderArticles;

// ════════════════════════════════════════
// SUPPRESSION D'UNE COMMANDE (statut "En attente" seulement)
// ════════════════════════════════════════
function confirmDeleteOrder(orderId, orderName) {
  // Supprimer l'overlay existant s'il y en a un
  const existing = document.getElementById('delete-confirm-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'delete-confirm-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(10,18,32,.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;';

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px;padding:28px 24px;max-width:360px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);text-align:center">
      <div style="font-size:48px;margin-bottom:14px">🗑️</div>
      <div style="font-family:'Nunito',sans-serif;font-size:18px;font-weight:800;color:#1A1A2E;margin-bottom:8px">Supprimer cette commande ?</div>
      <div style="font-size:13px;color:#4A4A6A;line-height:1.6;margin-bottom:6px">
        <strong style="color:#1E6FBE">${orderName}</strong>
      </div>
      <div style="font-size:12px;color:#9999BB;line-height:1.6;margin-bottom:22px">
        Cette action est irréversible. Votre demande sera définitivement supprimée.<br/>
        <span style="color:#C62828;font-weight:700">Suppression impossible si la commande est déjà confirmée.</span>
      </div>
      <div style="display:flex;gap:12px">
        <button onclick="document.getElementById('delete-confirm-overlay').remove()"
          style="flex:1;background:#F4F6FA;border:1.5px solid #E8EAF0;border-radius:14px;padding:14px;font-size:13px;font-weight:700;color:#4A4A6A;cursor:pointer;font-family:'Poppins',sans-serif">
          ← Annuler
        </button>
        <button onclick="executeDeleteOrder('${orderId}')"
          style="flex:1;background:linear-gradient(135deg,#C62828,#8B0000);border:none;border-radius:14px;padding:14px;font-size:13px;font-weight:700;color:#fff;cursor:pointer;font-family:'Poppins',sans-serif;box-shadow:0 4px 16px rgba(198,40,40,.35)">
          🗑️ Supprimer
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
window.confirmDeleteOrder = confirmDeleteOrder;

async function executeDeleteOrder(orderId) {
  const overlay = document.getElementById('delete-confirm-overlay');

  // Vérifier en temps réel que le statut est bien "En attente"
  try {
    const snap = await getDoc(doc(db, 'commandes', orderId));
    if (!snap.exists()) {
      if (overlay) overlay.remove();
      showToast('❌ Commande introuvable.', '#C62828');
      return;
    }
    const data = snap.data();
    if (data.statut && data.statut !== 'En attente') {
      if (overlay) overlay.remove();
      showToast(`⛔ Impossible : la commande est "${data.statut}". Seules les commandes "En attente" peuvent être supprimées.`, '#C62828');
      return;
    }

    // Supprimer dans Firestore
    await deleteDoc(doc(db, 'commandes', orderId));

    // Animer la carte disparaissant
    const card = document.getElementById(`ocard-${orderId}`);
    if (card) {
      card.style.transition = 'all .35s cubic-bezier(.4,0,.2,1)';
      card.style.opacity = '0';
      card.style.transform = 'translateX(60px) scale(.95)';
      setTimeout(() => card.remove(), 380);
    }

    if (overlay) overlay.remove();
    showToast('✅ Commande supprimée avec succès.', '#2E7D32');

    // Recharger la liste après un court délai
    setTimeout(() => loadMyOrders(), 500);

  } catch(err) {
    console.error(err);
    if (overlay) overlay.remove();
    showToast('❌ Erreur lors de la suppression. Réessayez.', '#C62828');
  }
}
window.executeDeleteOrder = executeDeleteOrder;


// ════════════════════════════════════════
// BANDEAU PUBLICITAIRE
// loadPartnerSlides() charge Firestore, injecte les cartes,
// puis appelle startAdband() — zero setTimeout aveugle.
// ════════════════════════════════════════

const PROMO_LABELS = {
  partenaire:'PARTENAIRE OFFICIEL', sponsor:'SPONSOR',
  collaborateur:'COLLABORATEUR', nouveaute:'NOUVEAUTE',
  promotion:'PROMOTION', evenement:'EVENEMENT'
};

const STD_BANNER_IDS = new Set([
  'std-delivery','std-restaurant','std-food','std-cleaning','std-clothes','std-kits'
]);

function startAdband() {
  const track    = document.getElementById('adband-track');
  const dotsWrap = document.getElementById('adband-dots');
  if (!track) return;

  const INTERVAL = 2400;
  let idx = 0;
  let originals = Array.from(track.querySelectorAll('.adcard'));
  let clone = null, timer = null, paused = false, jumping = false;

  if (originals.length < 2) return;

  if (dotsWrap) {
    dotsWrap.innerHTML = '';
    originals.forEach(function(_,i) {
      var d = document.createElement('span');
      d.className = 'adband-dot' + (i===0?' on':'');
      dotsWrap.appendChild(d);
    });
  }

  function updateDot(i) {
    if (!dotsWrap) return;
    dotsWrap.querySelectorAll('.adband-dot').forEach(function(d,j){ d.classList.toggle('on', j===i); });
  }
  function scrollTo(el, smooth) {
    track.scrollTo({ left: el.offsetLeft - track.offsetLeft, behavior: smooth?'smooth':'instant' });
  }
  function next() {
    if (jumping) return;
    if (idx+1 < originals.length) {
      scrollTo(originals[++idx], true); updateDot(idx);
    } else {
      scrollTo(clone, true); updateDot(0); jumping=true;
      setTimeout(function(){ idx=0; scrollTo(originals[0],false); jumping=false; }, 420);
    }
  }
  function prev() {
    idx = (idx-1+originals.length) % originals.length;
    scrollTo(originals[idx],true); updateDot(idx);
  }

  clone = originals[0].cloneNode(true);
  clone.setAttribute('aria-hidden','true');
  clone.style.pointerEvents = 'none';
  track.appendChild(clone);

  scrollTo(originals[0], false);
  updateDot(0);
  timer = setInterval(function(){ if(!paused && !jumping) next(); }, INTERVAL);

  track.addEventListener('mouseenter', function(){ paused=true; });
  track.addEventListener('mouseleave', function(){ paused=false; });
  var tx=0;
  track.addEventListener('touchstart', function(e){ paused=true; tx=e.touches[0].clientX; }, {passive:true});
  track.addEventListener('touchend',   function(e){
    var dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx)>40) { if(dx<0) next(); else prev(); }
    setTimeout(function(){ paused=false; }, INTERVAL);
  }, {passive:true});
}

// ── Gestion des liens bandeaux : openService:xxx ou URL externe ──
function handleBandeauLien(lien) {
  if (!lien) return;
  if (lien.startsWith('openService:')) {
    var svcId = lien.replace('openService:', '').trim();
    if (typeof openService === 'function') openService(svcId);
  } else if (lien.match(/^https?:\/\//)) {
    window.open(lien, '_blank');
  }
}

async function loadPartnerSlides() {
  const track = document.getElementById('adband-track');
  if (!track) { startAdband(); return; }

  try {
    // ── 1. Charger les personnalisations de bandeaux (collection 'bandeaux') ──
    try {
      const bSnap = await getDocs(collection(db,'bandeaux'));
      bSnap.forEach(function(d) {
        const b = d.data();
        const id = d.id; // ex: 'delivery', 'food', 'cleaning'...
        const stdCard = track.querySelector('[data-service="'+id+'"]');
        if (!stdCard) return;
        // Appliquer chaque champ si présent
        if (b.emoji)  { const el=stdCard.querySelector('.adcard-emoji-bg');  if(el) el.textContent=b.emoji; }
        if (b.badge)  { const el=stdCard.querySelector('.adcard-badge');      if(el) el.textContent=b.badge; }
        if (b.promo)  { const el=stdCard.querySelector('.adcard-promo');      if(el) el.textContent=b.promo; }
        if (b.titre1) {
          const el=stdCard.querySelector('.adcard-title');
          if(el) el.innerHTML=b.titre1+(b.titre2?'<br/><span style="color:rgba(255,255,255,.75)">'+b.titre2+'</span>':'');
        }
        if (b.sub)    { const el=stdCard.querySelector('.adcard-sub');        if(el) el.textContent=b.sub; }
        if (b.cta)    { const el=stdCard.querySelector('.adcard-cta');        if(el) el.textContent=b.cta; }
        if (b.bg)     { const zone=stdCard.querySelector('.adcard-img');       if(zone) zone.style.background=b.bg; }
        if (b.lien)   { stdCard.style.cursor='pointer'; stdCard.onclick=function(){ handleBandeauLien(b.lien); }; }
      });
    } catch(_) { /* bandeaux override silencieux si collection absente */ }

    // ── 2. Charger les partenaires (collection 'partenaires') ──
    const snap = await getDocs(query(collection(db,'partenaires'), orderBy('ordre','asc')));

    snap.forEach(function(d) {
      const p = Object.assign({ id:d.id }, d.data());

      // Override d'un bandeau standard
      if (STD_BANNER_IDS.has(p.id)) {
        const service = p.id.replace('std-','');
        const stdCard = track.querySelector('[data-service="'+service+'"]');
        if (!stdCard) return;
        if (p.actif === false) {
          stdCard.remove();
        } else {
          if (p.nom)         { const el=stdCard.querySelector('.adcard-title'); if(el) el.textContent=p.nom; }
          if (p.badge)       { const el=stdCard.querySelector('.adcard-badge'); if(el) el.textContent=p.badge; }
          if (p.description) { const el=stdCard.querySelector('.adcard-sub');   if(el) el.textContent=p.description; }
          if (p.imageUrl) {
            const zone = stdCard.querySelector('.adcard-img');
            if (zone) {
              const img = document.createElement('img');
              img.src=p.imageUrl; img.alt=p.nom||'';
              img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1';
              img.onerror=function(){ img.remove(); };
              zone.prepend(img);
            }
          }
        }
        return;
      }

      // Partenaire pur Firestore — on publie même si seulement une image est fournie
      if (p.actif===false || (!p.nom && !p.imageUrl && !p.bg)) return;

      const card = document.createElement('div');
      card.className = 'adcard';
      if (p.lien) { card.style.cursor='pointer'; card.onclick=function(){ handleBandeauLien(p.lien); }; }

      // Badge : affiché UNIQUEMENT si explicitement renseigné
      const badgeHtml = p.badge
        ? '<div class="adcard-badge">'+p.badge+'</div>'
        : '';

      // Promo label : affiché UNIQUEMENT si un type a été choisi
      const promoTxt = p.promo ? (PROMO_LABELS[p.promo] || p.promo.toUpperCase()) : '';
      const promoHtml = promoTxt ? '<div class="adcard-promo">'+promoTxt+'</div>' : '';

      // Titre : affiché UNIQUEMENT si renseigné
      const titreHtml = p.nom
        ? '<div class="adcard-title">'+p.nom+(p.titre2?'<br>'+p.titre2:'')+'</div>'
        : '';

      // Sous-titre : affiché UNIQUEMENT si renseigné
      const subHtml = p.description ? '<div class="adcard-sub">'+p.description+'</div>' : '';

      // Emoji filigrane : seulement si pas d'image ET emoji défini
      const emojiHtml = (!p.imageUrl && p.emoji)
        ? '<span class="adcard-emoji-bg">'+p.emoji+'</span>' : '';

      // Image de fond
      const imgHtml = p.imageUrl
        ? '<img src="'+p.imageUrl+'" alt="'+(p.nom||'')+'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center" onerror="this.style.display=\'none\'"/>'
        : emojiHtml;

      // CTA : seulement si texte explicitement défini
      const ctaHtml = p.ctaText ? '<div class="adcard-cta">'+p.ctaText+'</div>' : '';

      // Body : inséré seulement s'il y a au moins un élément visible
      const bodyContent = promoHtml + titreHtml + subHtml + ctaHtml;
      const bodyHtml = bodyContent ? '<div class="adcard-body">'+bodyContent+'</div>' : '';

      // Fond : couleur personnalisée ou défaut neutre
      const bgStyle = p.bg || 'linear-gradient(135deg,#1A1A2E 0%,#1E6FBE 100%)';

      card.innerHTML =
        '<div class="adcard-img" style="background:'+bgStyle+'">'
        +'<div class="adcard-gradient"></div>'
        +imgHtml
        +badgeHtml
        +'</div>'
        +bodyHtml;
      track.appendChild(card);
    });

  } catch(e) {
    console.warn('Partenaires Firestore indisponibles :', e.message);
  }

  // Lancer le slider APRES injection de toutes les cartes
  startAdband();
}
loadPartnerSlides();

function filterServices(q) {
  if (!document.getElementById('t-services')?.classList.contains('on')) goTab('services');
  document.querySelectorAll('#view-list .svc-row').forEach(r => {
    r.style.display = !q || r.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}
window.filterServices = filterServices;

// ════════════════════════════════════════
// ÉCOUTE TEMPS RÉEL — STATUTS COMMANDES (Notifications)
// ════════════════════════════════════════
let _orderStatusListener  = null;
let _knownOrderStatuts    = {};   // { orderId: statut }
let _listenerInitialized  = false;

function startOrderStatusListener() {
  if (!currentUser) return;
  // Arrêter l'ancien listener s'il existe
  stopOrderStatusListener();

  try {
    const q = query(
      collection(db, 'commandes'),
      where('uid', '==', currentUser.uid)
    );

    _orderStatusListener = onSnapshot(q, (snap) => {
      if (!_listenerInitialized) {
        // Première lecture : mémoriser les statuts sans notifier
        snap.forEach(d => { _knownOrderStatuts[d.id] = d.data().statut || ''; });
        _listenerInitialized = true;
        return;
      }

      snap.docChanges().forEach(change => {
        if (change.type === 'modified' || change.type === 'added') {
          const data   = change.doc.data();
          const id     = change.doc.id;
          const statut = data.statut || '';
          const prev   = _knownOrderStatuts[id];

          // Notifier seulement si le statut a réellement changé
          if (prev !== undefined && prev !== statut) {
            const ref     = '#' + id.slice(0, 8).toUpperCase();
            const svcName = data.serviceName || data.service || 'votre service';

            const notifMap = {
              'Confirmée': ['✅ Commande confirmée !',
                `Votre commande ${ref} (${svcName}) a été confirmée. Notre équipe se prépare.`,
                'en_cours'],
              'En cours':  ['🚀 Commande en cours !',
                `Votre commande ${ref} (${svcName}) est prise en charge par notre équipe.`,
                'en_cours'],
              'Terminée':  ['🎉 Commande terminée !',
                `Votre commande ${ref} (${svcName}) est terminée. Merci de votre confiance — OmniService TG 🙏`,
                'terminee'],
              'Annulée':   ['❌ Commande annulée',
                `Votre commande ${ref} (${svcName}) a été annulée. Contactez-nous pour plus d'informations.`,
                'info'],
            };

            const n = notifMap[statut];
            if (n && typeof window.addNotification === 'function') {
              window.addNotification(n[0], n[1], n[2], id);
            }
          }
          _knownOrderStatuts[id] = statut;
        }
      });
    }, (err) => {
      // Les rules bloquent ? → fallback polling toutes les 30s
      console.warn('[Notifs] onSnapshot échoué, polling actif :', err.message);
      _startNotifPolling();
    });
  } catch(e) {
    console.warn('[Notifs] Impossible de démarrer le listener :', e.message);
  }
}

function stopOrderStatusListener() {
  if (_orderStatusListener) {
    _orderStatusListener(); // unsubscribe
    _orderStatusListener  = null;
    _listenerInitialized  = false;
    _knownOrderStatuts    = {};
  }
  _stopNotifPolling();
}

// ── Fallback polling (si les rules bloquent onSnapshot) ──
let _notifPollTimer = null;
let _lastKnownStatuts = {}; // copie pour le polling

function _startNotifPolling() {
  if (_notifPollTimer || !currentUser) return;
  console.log('[Notifs] Démarrage polling 30s');
  _notifPollTimer = setInterval(async () => {
    if (!currentUser) { _stopNotifPolling(); return; }
    try {
      const snap = await getDocs(
        query(collection(db, 'commandes'), where('uid', '==', currentUser.uid))
      );
      snap.forEach(d => {
        const id     = d.id;
        const statut = d.data().statut || '';
        const prev   = _lastKnownStatuts[id];
        if (prev !== undefined && prev !== statut) {
          const ref     = '#' + id.slice(0,8).toUpperCase();
          const svcName = d.data().serviceName || d.data().service || 'votre service';
          const notifMap = {
            'Confirmée': ['✅ Commande confirmée !', `Votre commande ${ref} (${svcName}) a été confirmée.`, 'en_cours'],
            'En cours':  ['🚀 Commande en cours !',  `Votre commande ${ref} (${svcName}) est prise en charge.`, 'en_cours'],
            'Terminée':  ['🎉 Commande terminée !',  `Votre commande ${ref} (${svcName}) est terminée. Merci 🙏`, 'terminee'],
            'Annulée':   ['❌ Commande annulée',     `Votre commande ${ref} (${svcName}) a été annulée.`, 'info'],
          };
          const n = notifMap[statut];
          if (n && typeof window.addNotification === 'function') window.addNotification(n[0], n[1], n[2], id);
        }
        _lastKnownStatuts[id] = statut;
      });
    } catch(e) { /* silencieux */ }
  }, 30000);
}

function _stopNotifPolling() {
  if (_notifPollTimer) { clearInterval(_notifPollTimer); _notifPollTimer = null; }
}
