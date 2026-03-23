/* ══════════════════════════════════════════════════════════════════
   OmniService TG — localisation-module.js
   Gestion complète de la localisation GPS pour :
   ▸ Restaurant & Catalogue (food, marketplace, clothes, omni_drink)
   ▸ Livraison & Course (double point A→B + modal colis)
   ▸ Dépannage (modal type → GPS, ref Adidogomé)
   ══════════════════════════════════════════════════════════════════ */

// ── Attendre que app.js soit chargé ──
document.addEventListener('DOMContentLoaded', () => {
  initLocalisationModule();
});

function initLocalisationModule() {

// ════════════════════════════════════════
// DONNÉES GÉOGRAPHIQUES
// ════════════════════════════════════════
const ZONES_LOME = [
  { name:'Adidogomé',      lat:6.1050, lng:1.1780 },
  { name:'Tokoin',         lat:6.1520, lng:1.2220 },
  { name:'Bè',             lat:6.1370, lng:1.2310 },
  { name:'Agbalépédogan',  lat:6.1200, lng:1.2150 },
  { name:'Hédzranawoé',    lat:6.1450, lng:1.2050 },
  { name:'Kégué',          lat:6.1280, lng:1.2400 },
  { name:'Agoè',           lat:6.1800, lng:1.2100 },
  { name:'Cacavéli',       lat:6.1150, lng:1.1900 },
  { name:'Kodjoviakopé',   lat:6.1310, lng:1.2290 },
  { name:'Nyékonakpoè',    lat:6.1390, lng:1.2260 },
  { name:'Baguida',        lat:6.1000, lng:1.3100 },
  { name:'Lomé Centre',    lat:6.1375, lng:1.2123 },
  { name:'Djidjolé',       lat:6.1600, lng:1.2000 },
  { name:'Wété',           lat:6.1420, lng:1.2180 },
  { name:'Nukafu',         lat:6.1580, lng:1.2350 },
  { name:'Hanoukopé',      lat:6.1430, lng:1.2070 },
  { name:'Zanguéra',       lat:6.1100, lng:1.2050 },
  { name:'Aflao',          lat:6.1000, lng:1.1900 },
];

// Point de référence Adidogomé (0,0 km pour Dépannage)
const ADIDOGOME = { lat:6.1050, lng:1.1780 };

// Position OmniService par défaut (dépôt/entrepôt) pour catalogue
const OMNI_DEPOT = { lat:6.1375, lng:1.2123 };

// ════════════════════════════════════════
// MATHS & TARIF
// ════════════════════════════════════════
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function calcFare(km) {
  if (km <= 0) return 0;
  if (km < 2)  return 500;
  return 500 + Math.ceil(km - 1) * 100;
}

function fmtFare(km) {
  const fare   = calcFare(km);
  const detail = km >= 2
    ? `${km.toFixed(1)} km · 500 + ${Math.ceil(km-1)}×100`
    : `${km.toFixed(1)} km · forfait`;
  return { fare, detail };
}

function fmtMoney(n) {
  return Number(n).toLocaleString('fr-FR') + ' FCFA';
}

// ════════════════════════════════════════
// GPS — DÉTECTION GÉNÉRIQUE
// ════════════════════════════════════════
function detectGPS(btnEl, onSuccess, onFail) {
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:loc-spin .7s linear infinite;vertical-align:middle;margin-right:5px"></span>Localisation…';
  }
  if (!navigator.geolocation) {
    if (btnEl) { btnEl.disabled=false; btnEl.innerHTML='📍 Détecter'; }
    if (onFail) onFail('GPS non disponible sur cet appareil');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      if (btnEl) { btnEl.disabled=false; btnEl.innerHTML='🔄 Actualiser'; }
      onSuccess(pos.coords.latitude, pos.coords.longitude);
    },
    () => {
      // Fallback démo : position aléatoire dans Lomé
      const lat = 6.1375 + (Math.random() - 0.5) * 0.04;
      const lng = 1.2123 + (Math.random() - 0.5) * 0.04;
      if (btnEl) { btnEl.disabled=false; btnEl.innerHTML='🔄 Actualiser'; }
      if (onFail) onFail('GPS refusé', lat, lng);
      else onSuccess(lat, lng);
    },
    { timeout: 9000, enableHighAccuracy: true }
  );
}

// ════════════════════════════════════════
// SELECT ZONES (dropdown)
// ════════════════════════════════════════
function buildZoneSelect(id, onChangeFn) {
  const opts = ZONES_LOME.map(z =>
    `<option value="${z.lat}|${z.lng}|${z.name}">${z.name}</option>`
  ).join('');
  return `
    <select id="${id}" class="f-select" onchange="${onChangeFn}(this)"
      style="margin-top:8px;width:100%;padding:11px 14px;border:1.5px solid #E8EAF0;
             border-radius:12px;font-size:13px;font-family:'Poppins',sans-serif;
             background:#F4F6FA;color:#1A1A2E;outline:none">
      <option value="">— Choisir un quartier —</option>
      ${opts}
    </select>`;
}

// ════════════════════════════════════════
// CSS INJECTÉ UNE SEULE FOIS
// ════════════════════════════════════════
if (!document.getElementById('loc-module-css')) {
  const style = document.createElement('style');
  style.id = 'loc-module-css';
  style.textContent = `
    @keyframes loc-spin { to { transform:rotate(360deg); } }

    .loc-overlay {
      display:none; position:fixed; inset:0; z-index:3000;
      background:rgba(10,18,32,.6); backdrop-filter:blur(4px);
      align-items:flex-end; justify-content:center;
    }
    .loc-overlay.open { display:flex; }

    .loc-sheet {
      background:#fff; border-radius:24px 24px 0 0;
      width:100%; max-width:480px; max-height:92vh; overflow-y:auto;
      padding-bottom:env(safe-area-inset-bottom,16px);
      animation:loc-sheetUp .3s cubic-bezier(.16,1,.3,1);
    }
    @keyframes loc-sheetUp {
      from { transform:translateY(100%); opacity:0; }
      to   { transform:translateY(0);   opacity:1; }
    }
    .loc-handle {
      width:40px; height:4px; border-radius:2px;
      background:#E8EAF0; margin:12px auto 0;
    }
    .loc-hdr {
      padding:16px 20px 14px; border-bottom:1px solid #E8EAF0;
      display:flex; align-items:center; gap:12px;
    }
    .loc-hdr-ico {
      width:40px; height:40px; border-radius:12px;
      display:flex; align-items:center; justify-content:center;
      font-size:20px; flex-shrink:0;
    }
    .loc-hdr-title {
      font-size:16px; font-weight:800;
      font-family:'Nunito',sans-serif; color:#1A1A2E;
    }
    .loc-hdr-sub { font-size:11px; color:#9999BB; margin-top:1px; }
    .loc-hdr-close {
      margin-left:auto; background:#F4F6FA; border:none;
      width:32px; height:32px; border-radius:50%;
      font-size:16px; cursor:pointer; color:#9999BB;
      display:flex; align-items:center; justify-content:center;
    }
    .loc-body { padding:16px 20px 24px; }

    .loc-slabel {
      font-size:11px; font-weight:700; color:#4A4A6A;
      text-transform:uppercase; letter-spacing:.5px;
      margin-bottom:6px; margin-top:16px;
    }
    .loc-slabel:first-child { margin-top:0; }

    .loc-gps-card {
      background:linear-gradient(135deg,#E3F2FD,#BBDEFB);
      border-radius:14px; padding:14px 16px;
      display:flex; align-items:center; gap:12px;
      border:1.5px solid transparent;
      transition:border-color .15s;
    }
    .loc-gps-card.active { border-color:#1E6FBE; }
    .loc-gps-info { flex:1; min-width:0; }
    .loc-gps-title { font-size:13px; font-weight:700; color:#155A9C; }
    .loc-gps-coords { font-size:11px; color:#1E6FBE; font-weight:600; margin-top:2px; }
    .loc-gps-status { font-size:10px; color:#4A4A6A; margin-top:1px; }
    .loc-gps-btn {
      background:#1E6FBE; color:#fff; border:none; border-radius:999px;
      padding:8px 14px; font-size:11px; font-weight:700;
      cursor:pointer; font-family:'Poppins',sans-serif;
      white-space:nowrap; flex-shrink:0;
    }
    .loc-gps-btn:disabled { opacity:.55; cursor:not-allowed; }

    .loc-or { display:flex; align-items:center; gap:10px; margin:12px 0;
               font-size:11px; color:#9999BB; }
    .loc-or::before, .loc-or::after { content:''; flex:1; height:1px; background:#E8EAF0; }

    .loc-fare-box {
      background:linear-gradient(135deg,#1E6FBE,#155A9C);
      border-radius:14px; padding:14px 16px; color:#fff;
      margin-top:14px; display:flex; align-items:center; gap:14px;
    }
    .loc-fare-km   { font-size:13px; font-weight:700; color:rgba(255,255,255,.85); }
    .loc-fare-price{ font-size:22px; font-weight:900; font-family:'Nunito',sans-serif; }
    .loc-fare-det  { font-size:10px; color:rgba(255,255,255,.55); margin-top:3px; }

    .loc-point-card {
      background:#F4F6FA; border-radius:14px;
      padding:14px 16px; border:1.5px solid #E8EAF0; margin-bottom:4px;
    }
    .loc-point-hdr {
      display:flex; align-items:center; gap:10px; margin-bottom:12px;
    }
    .loc-dot { width:12px; height:12px; border-radius:50%; flex-shrink:0; }
    .loc-dot-green { background:#2E7D32; }
    .loc-dot-red   { background:#C62828; }
    .loc-point-title { font-size:13px; font-weight:700; color:#1A1A2E; }
    .loc-point-sub   { font-size:10px; color:#9999BB; margin-top:1px; }

    .loc-total-box {
      background:#F4F6FA; border:1.5px solid #E8EAF0;
      border-radius:14px; padding:14px 16px; margin-top:14px;
    }
    .loc-total-row {
      display:flex; justify-content:space-between; align-items:center;
      font-size:13px; padding:3px 0;
    }
    .loc-total-row.big {
      font-size:16px; font-weight:800; color:#1E6FBE;
      padding-top:10px; border-top:1px solid #E8EAF0; margin-top:8px;
    }
    .loc-total-label { color:#4A4A6A; }
    .loc-total-val   { font-weight:700; color:#1A1A2E; }

    .loc-submit-btn {
      display:block; width:100%; margin-top:16px;
      background:linear-gradient(135deg,#1E6FBE,#155A9C);
      color:#fff; border:none; border-radius:999px; padding:16px;
      font-size:15px; font-weight:700; cursor:pointer;
      font-family:'Poppins',sans-serif;
      box-shadow:0 4px 18px rgba(30,111,190,.35);
      transition:all .2s;
    }
    .loc-submit-btn:hover { transform:translateY(-1px); box-shadow:0 8px 28px rgba(30,111,190,.45); }
    .loc-submit-btn:disabled { opacity:.5; cursor:not-allowed; transform:none; }

    .loc-pay-opt {
      display:flex; align-items:center; gap:12px;
      background:#F4F6FA; border:1.5px solid #E8EAF0;
      border-radius:14px; padding:12px 14px;
      cursor:pointer; transition:all .15s; margin-bottom:8px;
    }
    .loc-pay-opt:hover { border-color:#1E6FBE; background:#EEF4FF; }
    .loc-pay-opt.selected { border-color:#1E6FBE; background:#EEF4FF; }
    .loc-pay-radio {
      width:20px; height:20px; border-radius:50%;
      border:2px solid #E8EAF0; margin-left:auto; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; transition:all .15s;
    }
    .loc-pay-opt.selected .loc-pay-radio { border-color:#1E6FBE; background:#1E6FBE; }
    .loc-pay-opt.selected .loc-pay-radio::after {
      content:''; width:8px; height:8px; border-radius:50%; background:#fff;
    }

    .loc-warn {
      background:#FFF8E1; border-radius:12px; padding:10px 14px;
      font-size:11px; color:#E65100; margin-top:10px;
      border:1px solid #FFE082;
    }

    /* Spinner dans le formulaire standard */
    .loc-spinner {
      display:inline-block; width:12px; height:12px;
      border:2px solid rgba(30,111,190,.25);
      border-top-color:#1E6FBE; border-radius:50%;
      animation:loc-spin .7s linear infinite; vertical-align:middle;
      margin-right:6px;
    }
  `;
  document.head.appendChild(style);
}

// ════════════════════════════════════════
// ██  MODULE 1 — RESTAURANT & CATALOGUE  ██
// ════════════════════════════════════════
// Le client n'entre PAS sa position : elle est détectée automatiquement.
// La position du restaurant/service est fixe (depuis la DB).
// Le client peut ajouter une description supplémentaire (optionnel).

const CATALOGUE_DEPOT = {
  food:       OMNI_DEPOT,
  marketplace:OMNI_DEPOT,
  omni_drink: OMNI_DEPOT,
  clothes:    OMNI_DEPOT,
};

// État GPS pour catalogue
let catGps = { lat:null, lng:null, fare:0, km:0 };

// Injecter le bandeau GPS dans la vue catalogue (avant les articles)
function injectCatGpsBanner(svcId) {
  // Supprimer l'ancien bandeau s'il existe
  const old = document.getElementById('cat-gps-banner');
  if (old) old.remove();
  catGps = { lat:null, lng:null, fare:0, km:0 };

  const banner = document.createElement('div');
  banner.id = 'cat-gps-banner';
  banner.style.cssText = 'margin:0 16px 14px;';
  banner.innerHTML = `
    <div style="background:linear-gradient(135deg,#E3F2FD,#BBDEFB);border-radius:16px;
                padding:14px 16px;border:1.5px solid transparent;transition:border-color .2s;"
         id="cat-gps-card-inner">
      <div style="font-size:11px;font-weight:700;color:#1A1A2E;text-transform:uppercase;
                  letter-spacing:.5px;margin-bottom:10px">📍 Votre position de livraison</div>
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-size:26px">📡</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:#155A9C" id="cat-gps-title">
            Localisation GPS requise</div>
          <div style="font-size:11px;color:#1E6FBE;font-weight:600;margin-top:2px"
               id="cat-gps-coords">Non détectée</div>
          <div style="font-size:10px;color:#4A4A6A;margin-top:1px" id="cat-gps-status">
            Les frais de livraison seront calculés automatiquement</div>
        </div>
        <button id="cat-gps-btn"
          onclick="window._catDetectGPS('${svcId}')"
          class="loc-gps-btn">📍 Détecter</button>
      </div>
      <div id="cat-fare-box" style="display:none;margin-top:12px;
           background:linear-gradient(135deg,#1E6FBE,#155A9C);
           border-radius:12px;padding:12px 14px;color:#fff">
        <div style="font-size:10px;color:rgba(255,255,255,.65);text-transform:uppercase;
                    letter-spacing:.4px;margin-bottom:4px">🛵 Frais de livraison estimés</div>
        <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
          <span style="font-size:13px;font-weight:700;color:rgba(255,255,255,.85)"
                id="cat-fare-km">— km</span>
          <span style="font-size:22px;font-weight:900;font-family:'Nunito',sans-serif"
                id="cat-fare-price">— FCFA</span>
        </div>
        <div style="font-size:10px;color:rgba(255,255,255,.55);margin-top:3px"
             id="cat-fare-detail"></div>
      </div>
      <div style="margin-top:10px">
        <label style="font-size:11px;font-weight:700;color:#4A4A6A;
                      text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px">
          Description supplémentaire
          <span style="font-weight:400;color:#9999BB;text-transform:none;font-size:10px">
            (optionnel)</span>
        </label>
        <textarea id="cat-gps-desc" rows="2"
          style="width:100%;padding:10px 13px;border:1.5px solid #E8EAF0;border-radius:12px;
                 font-size:13px;font-family:'Poppins',sans-serif;background:#fff;color:#1A1A2E;
                 outline:none;resize:none;transition:border-color .2s;"
          placeholder="Ex : Derrière le marché, portail bleu, 2ème maison à gauche…"
          onfocus="this.style.borderColor='#1E6FBE'"
          onblur="this.style.borderColor='#E8EAF0'"></textarea>
      </div>
    </div>`;

  // Insérer AVANT le catalogue-items
  const catItems = document.getElementById('catalogue-items');
  if (catItems && catItems.parentNode) {
    catItems.parentNode.insertBefore(banner, catItems);
  }
}

window._catDetectGPS = function(svcId) {
  const btn = document.getElementById('cat-gps-btn');
  detectGPS(btn,
    (lat, lng) => {
      catGps.lat = lat; catGps.lng = lng;
      const depot = svcId === 'restaurant'
        ? (window.currentRestaurant && window.currentRestaurant.lat
            ? { lat: window.currentRestaurant.lat, lng: window.currentRestaurant.lng }
            : ADIDOGOME )
        : (CATALOGUE_DEPOT[svcId] || OMNI_DEPOT);

      const km = haversine(lat, lng, depot.lat, depot.lng);
      const { fare, detail } = fmtFare(km);
      catGps.km   = km;
      catGps.fare = fare;

      document.getElementById('cat-gps-title').textContent  = 'Position détectée ✅';
      document.getElementById('cat-gps-coords').textContent = `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
      document.getElementById('cat-gps-status').textContent = 'Votre position de livraison';
      document.getElementById('cat-gps-card-inner').style.borderColor = '#1E6FBE';
      document.getElementById('cat-fare-km').textContent    = km.toFixed(1) + ' km';
      document.getElementById('cat-fare-price').textContent = fmtMoney(fare);
      document.getElementById('cat-fare-detail').textContent= detail;
      document.getElementById('cat-fare-box').style.display = 'block';
      // Stocker pour finalizeOrder
      window._locFraisLiv = fare;
      window._locKm       = km;
    },
    (err, fallLat, fallLng) => {
      catGps.lat = fallLat; catGps.lng = fallLng;
      const depot = svcId === 'restaurant'
        ? ADIDOGOME
        : (CATALOGUE_DEPOT[svcId] || OMNI_DEPOT);
      const km = haversine(fallLat, fallLng, depot.lat, depot.lng);
      const { fare, detail } = fmtFare(km);
      catGps.km = km; catGps.fare = fare;

      document.getElementById('cat-gps-title').textContent  = 'Position simulée (démo)';
      document.getElementById('cat-gps-coords').textContent = `${fallLat.toFixed(5)}° N, ${fallLng.toFixed(5)}° E`;
      document.getElementById('cat-gps-status').textContent = '⚠️ GPS refusé — position approximative Lomé';
      document.getElementById('cat-gps-card-inner').style.borderColor = '#F5820A';
      document.getElementById('cat-fare-km').textContent    = km.toFixed(1) + ' km';
      document.getElementById('cat-fare-price').textContent = fmtMoney(fare);
      document.getElementById('cat-fare-detail').textContent= detail;
      document.getElementById('cat-fare-box').style.display = 'block';
      window._locFraisLiv = fare;
      window._locKm       = km;
    }
  );
};

// Intercept openService pour injecter le bandeau GPS sur les services catalogue
const _origOpenService = window.openService;
window.openService = function(id) {
  _origOpenService(id);
  // Après ouverture, injecter le bandeau GPS si service catalogue ou restaurant
  const GPSABLE = ['food','marketplace','omni_drink','clothes','restaurant'];
  if (GPSABLE.includes(id)) {
    setTimeout(() => injectCatGpsBanner(id), 120);
  }
};

// Intercept openRestaurant pour injecter le bandeau GPS
const _origOpenRestaurant = window.openRestaurant;
if (_origOpenRestaurant) {
  window.openRestaurant = async function(restaurantId, restaurantNom, restaurantEmoji) {
    await _origOpenRestaurant(restaurantId, restaurantNom, restaurantEmoji);
    setTimeout(() => injectCatGpsBanner('restaurant'), 120);
  };
}

// Intercept goToPayment pour valider le GPS catalogue et sauvegarder le snapshot
const _origGoToPayment = window.goToPayment;
window.goToPayment = function() {
  const catBanner = document.getElementById('cat-gps-banner');
  if (catBanner) {
    // Service catalogue avec bandeau GPS
    if (!catGps.lat) {
      if (window.showToast) window.showToast('⚠️ Détectez votre position GPS avant de continuer', '#F5820A');
      return;
    }
    window._catGpsSnapshot = {
      lat:  catGps.lat,
      lng:  catGps.lng,
      fare: catGps.fare,
      km:   catGps.km,
      desc: document.getElementById('cat-gps-desc')?.value.trim() || '',
    };
  }
  _origGoToPayment();
};

// Intercept goToPayment pour sauvegarder snapshot GPS catalogue
// (la localisation GPS est transmise via window._catGpsSnapshot à finalizeOrder)
// Note: finalizeOrder lit window._catGpsSnapshot directement via addDoc dans app.js.
// On s'assure que le snapshot est toujours à jour avant la confirmation de commande.

// ════════════════════════════════════════
// ██  MODULE 2 — LIVRAISON & COURSE     ██
// ════════════════════════════════════════

// État interne
const livState = {
  A: { lat:null, lng:null, label:'' },
  B: { lat:null, lng:null, label:'' },
  payMode: null,
  colisInfo: null,
};

// ── MODAL 1 : Infos colis ──
function openColisModal() {
  let overlay = document.getElementById('loc-colis-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'loc-colis-overlay';
  overlay.className = 'loc-overlay open';
  overlay.innerHTML = `
    <div class="loc-sheet">
      <div class="loc-handle"></div>
      <div class="loc-hdr">
        <div class="loc-hdr-ico" style="background:linear-gradient(135deg,#FF7043,#E64A19)">📦</div>
        <div>
          <div class="loc-hdr-title">Informations sur le colis</div>
          <div class="loc-hdr-sub">Quelques détails avant la localisation</div>
        </div>
        <button class="loc-hdr-close" onclick="window._closeLivOverlay('loc-colis-overlay')">✕</button>
      </div>
      <div class="loc-body">
        <div class="loc-slabel">Type de service</div>
        <select id="liv-type-select" class="f-select" style="width:100%;padding:11px 14px;
          border:1.5px solid #E8EAF0;border-radius:12px;font-size:13px;
          font-family:'Poppins',sans-serif;background:#F4F6FA;color:#1A1A2E;outline:none">
          <option value="">— Choisir —</option>
          <option value="Livraison express">🚀 Livraison express</option>
          <option value="Courses personnalisées">🛒 Courses personnalisées</option>
          <option value="Livraison entreprise">🏢 Livraison entreprise</option>
          <option value="Livraison de plats">🍽️ Livraison de plats</option>
          <option value="Transport de colis">📦 Transport de colis</option>
          <option value="Courses diverses">🏃 Courses diverses</option>
        </select>

        <div class="loc-slabel" style="margin-top:14px">Description du colis / de la course *</div>
        <textarea id="liv-colis-desc" rows="3"
          style="width:100%;padding:10px 13px;border:1.5px solid #E8EAF0;border-radius:12px;
                 font-size:13px;font-family:'Poppins',sans-serif;background:#F4F6FA;color:#1A1A2E;
                 outline:none;resize:none;transition:border-color .2s;"
          placeholder="Ex : Colis fragile ~2 kg, documents urgents, courses marché (liste jointe)…"
          onfocus="this.style.borderColor='#1E6FBE'"
          onblur="this.style.borderColor='#E8EAF0'"></textarea>

        <div class="loc-slabel" style="margin-top:14px">Destinataire / Contact sur place <span style="font-weight:400;color:#9999BB;text-transform:none;font-size:10px">(optionnel)</span></div>
        <input id="liv-colis-contact" type="text"
          style="width:100%;padding:11px 14px;border:1.5px solid #E8EAF0;border-radius:12px;
                 font-size:13px;font-family:'Poppins',sans-serif;background:#F4F6FA;color:#1A1A2E;
                 outline:none;transition:border-color .2s;"
          placeholder="Nom et numéro du destinataire"
          onfocus="this.style.borderColor='#1E6FBE'"
          onblur="this.style.borderColor='#E8EAF0'"/>

        <button class="loc-submit-btn" onclick="window._confirmColis()">
          Continuer → Localisation 📍
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) window._closeLivOverlay('loc-colis-overlay'); });
}

window._closeLivOverlay = function(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
};

window._confirmColis = function() {
  const typeEl    = document.getElementById('liv-type-select');
  const descEl    = document.getElementById('liv-colis-desc');
  const contactEl = document.getElementById('liv-colis-contact');
  const desc      = descEl?.value.trim();
  if (!desc) {
    descEl.style.borderColor = '#F5820A';
    if (window.showToast) window.showToast('⚠️ Décrivez le colis ou la course', '#F5820A');
    return;
  }
  livState.colisInfo = {
    type:    typeEl?.value || '',
    desc,
    contact: contactEl?.value.trim() || '',
  };
  window._closeLivOverlay('loc-colis-overlay');
  openLivraisonSheet();
};

// ── SHEET PRINCIPAL : double localisation ──
function openLivraisonSheet() {
  livState.A = { lat:null, lng:null, label:'' };
  livState.B = { lat:null, lng:null, label:'' };
  livState.payMode = null;

  let overlay = document.getElementById('loc-liv-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'loc-liv-overlay';
  overlay.className = 'loc-overlay open';

  overlay.innerHTML = `
    <div class="loc-sheet">
      <div class="loc-handle"></div>
      <div class="loc-hdr">
        <div class="loc-hdr-ico" style="background:linear-gradient(135deg,#FF7043,#E64A19)">🛵</div>
        <div>
          <div class="loc-hdr-title">Livraison & Course</div>
          <div class="loc-hdr-sub">${livState.colisInfo?.type || 'Définissez vos deux points'}</div>
        </div>
        <button class="loc-hdr-close" onclick="window._closeLivOverlay('loc-liv-overlay')">✕</button>
      </div>
      <div class="loc-body">

        ${livState.colisInfo ? `
        <div style="background:#FFF3E0;border-radius:12px;padding:10px 14px;margin-bottom:2px;
                    border:1px solid #FFE082;display:flex;align-items:flex-start;gap:10px">
          <span style="font-size:18px">📦</span>
          <div style="flex:1;font-size:11px;color:#E65100">
            <strong>${livState.colisInfo.type || 'Livraison'}</strong>
            ${livState.colisInfo.desc ? ' · ' + livState.colisInfo.desc : ''}
            ${livState.colisInfo.contact ? '<br/>👤 ' + livState.colisInfo.contact : ''}
          </div>
          <button onclick="window._closeLivOverlay('loc-liv-overlay');openColisModal()"
            style="background:none;border:1.5px solid #F5820A;color:#F5820A;border-radius:8px;
                   padding:3px 9px;font-size:10px;font-weight:700;cursor:pointer;
                   font-family:'Poppins',sans-serif;flex-shrink:0">Modifier</button>
        </div>` : ''}

        <!-- POINT A -->
        <div class="loc-point-card" style="margin-top:8px">
          <div class="loc-point-hdr">
            <div class="loc-dot loc-dot-green"></div>
            <div>
              <div class="loc-point-title">Point de collecte (départ)</div>
              <div class="loc-point-sub">D'où doit-on récupérer le colis / la course ?</div>
            </div>
          </div>
          <!-- GPS -->
          <div class="loc-gps-card" id="gps-A-card">
            <div style="font-size:24px">📡</div>
            <div class="loc-gps-info">
              <div class="loc-gps-title" id="gps-A-title">Localisation GPS</div>
              <div class="loc-gps-coords" id="gps-A-coords">Non détectée</div>
              <div class="loc-gps-status" id="gps-A-status">Appuyez pour détecter votre position</div>
            </div>
            <button class="loc-gps-btn" id="gps-A-btn" onclick="window._livDetectGPS('A')">
              📍 Détecter
            </button>
          </div>
          <!-- OU select zone -->
          <div class="loc-or">ou choisir un quartier</div>
          ${buildZoneSelect('zone-select-A', 'window._livZoneChange_A')}
          <!-- Description optionnelle -->
          <div style="margin-top:10px">
            <label style="font-size:11px;font-weight:700;color:#4A4A6A;text-transform:uppercase;
                          letter-spacing:.4px;display:block;margin-bottom:4px">
              Précision <span style="font-weight:400;color:#9999BB;text-transform:none">(optionnel)</span>
            </label>
            <textarea id="liv-A-desc" rows="2"
              style="width:100%;padding:10px 13px;border:1.5px solid #E8EAF0;border-radius:12px;
                     font-size:13px;font-family:'Poppins',sans-serif;background:#fff;color:#1A1A2E;
                     outline:none;resize:none;transition:border-color .2s;"
              placeholder="Ex : Devant la pharmacie, maison rouge portail noir…"
              onfocus="this.style.borderColor='#1E6FBE'"
              onblur="this.style.borderColor='#E8EAF0'"></textarea>
          </div>
        </div>

        <!-- FLÈCHE -->
        <div style="text-align:center;font-size:22px;color:#C5C5D8;margin:4px 0">↕</div>

        <!-- POINT B -->
        <div class="loc-point-card">
          <div class="loc-point-hdr">
            <div class="loc-dot loc-dot-red"></div>
            <div>
              <div class="loc-point-title">Point de livraison (arrivée)</div>
              <div class="loc-point-sub">Où doit-on livrer / déposer ?</div>
            </div>
          </div>
          <div class="loc-gps-card" id="gps-B-card">
            <div style="font-size:24px">📡</div>
            <div class="loc-gps-info">
              <div class="loc-gps-title" id="gps-B-title">Localisation GPS</div>
              <div class="loc-gps-coords" id="gps-B-coords">Non détectée</div>
              <div class="loc-gps-status" id="gps-B-status">Appuyez pour détecter votre position</div>
            </div>
            <button class="loc-gps-btn" id="gps-B-btn" onclick="window._livDetectGPS('B')">
              📍 Détecter
            </button>
          </div>
          <div class="loc-or">ou choisir un quartier</div>
          ${buildZoneSelect('zone-select-B', 'window._livZoneChange_B')}
          <div style="margin-top:10px">
            <label style="font-size:11px;font-weight:700;color:#4A4A6A;text-transform:uppercase;
                          letter-spacing:.4px;display:block;margin-bottom:4px">
              Précision <span style="font-weight:400;color:#9999BB;text-transform:none">(optionnel)</span>
            </label>
            <textarea id="liv-B-desc" rows="2"
              style="width:100%;padding:10px 13px;border:1.5px solid #E8EAF0;border-radius:12px;
                     font-size:13px;font-family:'Poppins',sans-serif;background:#fff;color:#1A1A2E;
                     outline:none;resize:none;transition:border-color .2s;"
              placeholder="Ex : Résidence derrière le lycée, 1er étage, appartement 3…"
              onfocus="this.style.borderColor='#1E6FBE'"
              onblur="this.style.borderColor='#E8EAF0'"></textarea>
          </div>
        </div>

        <!-- FARE (masqué jusqu'au calcul) -->
        <div class="loc-fare-box" id="liv-fare-box" style="display:none">
          <div style="font-size:28px">📏</div>
          <div style="flex:1">
            <div style="font-size:10px;color:rgba(255,255,255,.65);text-transform:uppercase;
                        letter-spacing:.4px;margin-bottom:3px">Distance & tarif</div>
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
              <span class="loc-fare-km" id="liv-fare-km">— km</span>
              <span class="loc-fare-price" id="liv-fare-price">— FCFA</span>
            </div>
            <div class="loc-fare-det" id="liv-fare-detail"></div>
          </div>
        </div>

        <!-- PAIEMENT -->
        <div id="liv-pay-section" style="display:none;margin-top:16px">
          <div style="font-size:12px;font-weight:700;color:#4A4A6A;text-transform:uppercase;
                      letter-spacing:.5px;margin-bottom:10px">💳 Mode de paiement</div>
          <div class="loc-pay-opt" id="liv-pay-tmoney" onclick="window._livSelectPay('tmoney')">
            <div style="width:34px;height:34px;border-radius:10px;background:#FFF9E0;border:1px solid #E8EAF0;
                        display:flex;align-items:center;justify-content:center;flex-shrink:0">🟡</div>
            <div>
              <div style="font-size:13px;font-weight:700;color:#1A1A2E">Mixx by Yas (T-Money)</div>
              <div style="font-size:10px;color:#9999BB;margin-top:1px">Paiement mobile Togocel</div>
            </div>
            <div class="loc-pay-radio"></div>
          </div>
          <div class="loc-pay-opt" id="liv-pay-flooz" onclick="window._livSelectPay('flooz')">
            <div style="width:34px;height:34px;border-radius:10px;background:#E3F0FF;border:1px solid #E8EAF0;
                        display:flex;align-items:center;justify-content:center;flex-shrink:0">🔵</div>
            <div>
              <div style="font-size:13px;font-weight:700;color:#1A1A2E">Flooz (Moov Africa)</div>
              <div style="font-size:10px;color:#9999BB;margin-top:1px">Paiement mobile Moov</div>
            </div>
            <div class="loc-pay-radio"></div>
          </div>
          <div class="loc-pay-opt" id="liv-pay-cash" onclick="window._livSelectPay('cash')">
            <div style="width:34px;height:34px;border-radius:10px;background:#F3E5F5;border:1px solid #E8EAF0;
                        display:flex;align-items:center;justify-content:center;flex-shrink:0">💵</div>
            <div>
              <div style="font-size:13px;font-weight:700;color:#1A1A2E">Payer à la livraison</div>
              <div style="font-size:10px;color:#9999BB;margin-top:1px">Cash à la réception</div>
            </div>
            <div class="loc-pay-radio"></div>
          </div>
        </div>

        <!-- TOTAL -->
        <div class="loc-total-box" id="liv-total-box" style="display:none">
          <div class="loc-total-row">
            <span class="loc-total-label">🛵 Frais de livraison</span>
            <span class="loc-total-val" id="liv-total-fare">— FCFA</span>
          </div>
          <div class="loc-total-row big">
            <span>Total à payer</span>
            <span id="liv-total-val">— FCFA</span>
          </div>
        </div>

        <!-- BOUTON SOUMETTRE -->
        <button class="loc-submit-btn" id="liv-submit-btn" style="display:none"
          onclick="window._submitLivraison()">
          🛵 Confirmer la livraison
        </button>

      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) window._closeLivOverlay('loc-liv-overlay'); });
}

// ── GPS pour point A ou B ──
window._livDetectGPS = function(point) {
  const btn = document.getElementById(`gps-${point}-btn`);
  detectGPS(btn,
    (lat, lng) => {
      livState[point].lat   = lat;
      livState[point].lng   = lng;
      livState[point].label = 'Votre position GPS';
      document.getElementById(`gps-${point}-title`).textContent  = 'Position détectée ✅';
      document.getElementById(`gps-${point}-coords`).textContent = `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
      document.getElementById(`gps-${point}-status`).textContent = 'Position actuelle';
      document.getElementById(`gps-${point}-card`).classList.add('active');
      // Reset le select zone si GPS détecté
      const sel = document.getElementById(`zone-select-${point}`);
      if (sel) sel.value = '';
      tryCalcLivFare();
    },
    (err, fallLat, fallLng) => {
      livState[point].lat   = fallLat;
      livState[point].lng   = fallLng;
      livState[point].label = 'Position simulée';
      document.getElementById(`gps-${point}-title`).textContent  = 'Position simulée (démo)';
      document.getElementById(`gps-${point}-coords`).textContent = `${fallLat.toFixed(5)}° N, ${fallLng.toFixed(5)}° E`;
      document.getElementById(`gps-${point}-status`).textContent = '⚠️ GPS refusé — position approximative Lomé';
      document.getElementById(`gps-${point}-card`).classList.add('active');
      const sel = document.getElementById(`zone-select-${point}`);
      if (sel) sel.value = '';
      tryCalcLivFare();
    }
  );
};

// ── Select zone ──
window._livZoneChange_A = function(sel) {
  const val = sel.value;
  if (!val) { livState.A = { lat:null, lng:null, label:'' }; return; }
  const [lat, lng, name] = val.split('|');
  livState.A.lat = parseFloat(lat);
  livState.A.lng = parseFloat(lng);
  livState.A.label = name;
  // Reset GPS card si zone sélectionnée
  document.getElementById('gps-A-title').textContent  = `Zone : ${name}`;
  document.getElementById('gps-A-coords').textContent = `${parseFloat(lat).toFixed(5)}° N, ${parseFloat(lng).toFixed(5)}° E`;
  document.getElementById('gps-A-status').textContent = 'Quartier sélectionné';
  document.getElementById('gps-A-card').classList.add('active');
  tryCalcLivFare();
};

window._livZoneChange_B = function(sel) {
  const val = sel.value;
  if (!val) { livState.B = { lat:null, lng:null, label:'' }; return; }
  const [lat, lng, name] = val.split('|');
  livState.B.lat = parseFloat(lat);
  livState.B.lng = parseFloat(lng);
  livState.B.label = name;
  document.getElementById('gps-B-title').textContent  = `Zone : ${name}`;
  document.getElementById('gps-B-coords').textContent = `${parseFloat(lat).toFixed(5)}° N, ${parseFloat(lng).toFixed(5)}° E`;
  document.getElementById('gps-B-status').textContent = 'Quartier sélectionné';
  document.getElementById('gps-B-card').classList.add('active');
  tryCalcLivFare();
};

function tryCalcLivFare() {
  if (livState.A.lat === null || livState.B.lat === null) return;
  const km = haversine(livState.A.lat, livState.A.lng, livState.B.lat, livState.B.lng);
  const { fare, detail } = fmtFare(km);
  document.getElementById('liv-fare-km').textContent    = km.toFixed(1) + ' km';
  document.getElementById('liv-fare-price').textContent = fmtMoney(fare);
  document.getElementById('liv-fare-detail').textContent= `De ${livState.A.label||'Point A'} → ${livState.B.label||'Point B'} · ${detail}`;
  document.getElementById('liv-fare-box').style.display = 'flex';
  document.getElementById('liv-pay-section').style.display = 'block';
  document.getElementById('liv-total-box').style.display   = 'block';
  document.getElementById('liv-total-fare').textContent    = fmtMoney(fare);
  document.getElementById('liv-total-val').textContent     = fmtMoney(fare);
  livState._fare = fare; livState._km = km;
}

// ── Sélection paiement ──
window._livSelectPay = function(mode) {
  livState.payMode = mode;
  ['tmoney','flooz','cash'].forEach(m => {
    document.getElementById(`liv-pay-${m}`)?.classList.toggle('selected', m === mode);
  });
  document.getElementById('liv-submit-btn').style.display = 'block';
};

// ── Soumettre la livraison ──
window._submitLivraison = async function() {
  const currentUser = window._currentUser;
  if (!currentUser) { if (window.openAuthModal) window.openAuthModal('login'); return; }

  if (!livState.A.lat || !livState.B.lat) {
    if (window.showToast) window.showToast('⚠️ Définissez les deux points de livraison', '#F5820A');
    return;
  }
  if (!livState.payMode) {
    if (window.showToast) window.showToast('⚠️ Choisissez un mode de paiement', '#F5820A');
    return;
  }

  const btn = document.getElementById('liv-submit-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loc-spinner"></span>Enregistrement…'; }

  try {
    const db = window._firestoreDb;
    const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

    const svc = window.SVCS?.['delivery'] || { name:'Livraison et courses' };
    const fare = livState._fare || 0;
    const km   = livState._km   || 0;
    const payLabels = { tmoney:'Mixx by Yas (T-Money)', flooz:'Flooz (Moov)', cash:'Paiement à la livraison' };

    const docRef = await addDoc(collection(db, 'commandes'), {
      service:        'delivery',
      serviceName:    svc.name,
      statut:         'En attente',
      // Colis
      typeService:    livState.colisInfo?.type    || '',
      descriptionColis: livState.colisInfo?.desc  || '',
      contactDestinataire: livState.colisInfo?.contact || '',
      // Localisation
      pointA_lat:     livState.A.lat,
      pointA_lng:     livState.A.lng,
      pointA_label:   livState.A.label,
      pointA_desc:    document.getElementById('liv-A-desc')?.value.trim() || '',
      pointB_lat:     livState.B.lat,
      pointB_lng:     livState.B.lng,
      pointB_label:   livState.B.label,
      pointB_desc:    document.getElementById('liv-B-desc')?.value.trim() || '',
      distanceKm:     parseFloat(km.toFixed(2)),
      fraisLivraison: fare,
      total:          fare,
      // Paiement
      modePaiement:   livState.payMode,
      modePaiementLabel: payLabels[livState.payMode] || livState.payMode,
      paygateStatus:  'non_configure',
      // Client
      uid:            currentUser.uid,
      clientNom:      currentUser.nom    || '',
      clientPrenom:   currentUser.prenom || '',
      clientGenre:    currentUser.genre  || '',
      phone:          currentUser.phone  || '',
      clientVille:    currentUser.ville  || '',
      createdAt:      serverTimestamp(),
    });

    // Afficher le message de succès
    const succMsg = document.getElementById('succ-msg');
    if (succMsg) {
      succMsg.innerHTML = `
        Livraison <strong style="color:var(--blue)">${livState.A.label||'Point A'} → ${livState.B.label||'Point B'}</strong> confirmée !<br/>
        Référence : <strong>#${docRef.id.slice(0,8).toUpperCase()}</strong><br/>
        Distance : ${km.toFixed(1)} km — Tarif : ${fmtMoney(fare)}<br/>
        ${livState.payMode === 'cash'
          ? '💵 Paiement à la livraison — notre coursier vous contacte bientôt.'
          : `📱 Paiement ${payLabels[livState.payMode]} à préparer.`}<br/>
        <small style="color:var(--light)">Contact : ${currentUser.phone || ''}</small>`;
    }

    window._closeLivOverlay('loc-liv-overlay');
    if (window.showSuccessView) window.showSuccessView();

  } catch(err) {
    console.error('[Livraison]', err);
    if (window.showToast) window.showToast('❌ Erreur : ' + err.message, '#C62828');
    if (btn) { btn.disabled = false; btn.innerHTML = '🛵 Confirmer la livraison'; }
  }
};

// ── Intercepter openService pour delivery ──
const _origOpenServiceLiv = window.openService;
window.openService = function(id) {
  if (id === 'delivery') {
    const currentUser = window._currentUser;
    if (!currentUser) {
      if (window.openAuthModal) window.openAuthModal('login');
      if (window.showToast) window.showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A');
      return;
    }
    // Active l'onglet services
    document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
    document.getElementById('p-services')?.classList.add('on');
    document.querySelectorAll('.btab').forEach(b => b.classList.remove('on'));
    document.getElementById('t-services')?.classList.add('on');
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('on'));
    document.getElementById('nl-services')?.classList.add('on');

    openColisModal();
    return;
  }
  _origOpenServiceLiv(id);
};


// ════════════════════════════════════════
// ██  MODULE 3 — DÉPANNAGE              ██
// ════════════════════════════════════════
// Adidogomé = point de référence (0,0 km)
// Modal : select type + description → GPS client → calcul km depuis Adidogomé

const MAINTENANCE_TYPES = [
  { id:'electricite',  label:'Électricité',          emoji:'⚡' },
  { id:'plomberie',    label:'Plomberie',             emoji:'🔧' },
  { id:'clim',         label:'Climatisation',         emoji:'❄️' },
  { id:'electromenager',label:'Électroménager',       emoji:'🏠' },
  { id:'informatique', label:'Informatique',          emoji:'💻' },
  { id:'tv_antenne',   label:'Pose TV / Antenne',     emoji:'📺' },
  { id:'autres',       label:'Autres travaux',        emoji:'🛠️' },
];

function openMaintenanceModal() {
  const currentUser = window._currentUser;
  if (!currentUser) {
    if (window.openAuthModal) window.openAuthModal('login');
    if (window.showToast) window.showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A');
    return;
  }

  let overlay = document.getElementById('loc-maint-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'loc-maint-overlay';
  overlay.className = 'loc-overlay open';

  const svc = window.SVCS?.['maintenance'] || { active:false, soon:'', name:'Dépannage' };
  const soonHtml = (!svc.active && svc.soon)
    ? `<div style="background:#FFF3E0;border-radius:12px;padding:10px 14px;margin-bottom:14px;
                   border:1px solid #FFE082;font-size:12px;color:#E65100">
         ⏳ <strong>Bientôt disponible</strong> — Opérationnel le ${svc.soon}.<br/>
         Vous pouvez déjà pré-enregistrer votre demande.
       </div>`
    : '';

  overlay.innerHTML = `
    <div class="loc-sheet">
      <div class="loc-handle"></div>
      <div class="loc-hdr">
        <div class="loc-hdr-ico" style="background:linear-gradient(135deg,#EF5350,#C62828)">🔧</div>
        <div>
          <div class="loc-hdr-title">Dépannage</div>
          <div class="loc-hdr-sub">Quel type d'intervention ?</div>
        </div>
        <button class="loc-hdr-close" onclick="window._closeLivOverlay('loc-maint-overlay')">✕</button>
      </div>
      <div class="loc-body">
        ${soonHtml}

        <div class="loc-slabel">Type d'intervention *</div>
        <select id="maint-type-select" class="f-select"
          style="width:100%;padding:11px 14px;border:1.5px solid #E8EAF0;border-radius:12px;
                 font-size:13px;font-family:'Poppins',sans-serif;background:#F4F6FA;
                 color:#1A1A2E;outline:none"
          onchange="window._onMaintTypeChange(this)">
          <option value="">— Choisir le type d'intervention —</option>
          ${MAINTENANCE_TYPES.map(t =>
            `<option value="${t.id}" data-emoji="${t.emoji}">${t.emoji} ${t.label}</option>`
          ).join('')}
        </select>

        <div class="loc-slabel" style="margin-top:14px">Description du problème *</div>
        <textarea id="maint-desc" rows="4"
          style="width:100%;padding:10px 13px;border:1.5px solid #E8EAF0;border-radius:12px;
                 font-size:13px;font-family:'Poppins',sans-serif;background:#F4F6FA;color:#1A1A2E;
                 outline:none;resize:none;transition:border-color .2s;"
          placeholder="Décrivez le problème en détail : panne, fuite, bruit suspect, symptômes…"
          onfocus="this.style.borderColor='#1E6FBE'"
          onblur="this.style.borderColor='#E8EAF0'"></textarea>

        <!-- GPS section — apparaît après saisie description -->
        <div id="maint-gps-section" style="margin-top:14px">
          <div class="loc-slabel">Votre position (lieu d'intervention)</div>
          <div class="loc-gps-card" id="maint-gps-card">
            <div style="font-size:24px">📡</div>
            <div class="loc-gps-info">
              <div class="loc-gps-title" id="maint-gps-title">Localisation GPS</div>
              <div class="loc-gps-coords" id="maint-gps-coords">Non détectée</div>
              <div class="loc-gps-status" id="maint-gps-status">
                Distance calculée depuis Adidogomé (base OmniService)
              </div>
            </div>
            <button class="loc-gps-btn" id="maint-gps-btn"
              onclick="window._maintDetectGPS()">📍 Détecter</button>
          </div>

          <!-- OU select zone -->
          <div class="loc-or">ou choisir un quartier</div>
          ${buildZoneSelect('zone-select-maint', 'window._maintZoneChange')}

          <!-- Fare -->
          <div class="loc-fare-box" id="maint-fare-box" style="display:none;margin-top:14px">
            <div style="font-size:28px">📏</div>
            <div style="flex:1">
              <div style="font-size:10px;color:rgba(255,255,255,.65);text-transform:uppercase;
                          letter-spacing:.4px;margin-bottom:3px">
                Distance depuis Adidogomé & frais déplacement
              </div>
              <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
                <span class="loc-fare-km" id="maint-fare-km">— km</span>
                <span class="loc-fare-price" id="maint-fare-price">— FCFA</span>
              </div>
              <div class="loc-fare-det" id="maint-fare-detail"></div>
            </div>
          </div>
        </div>

        <button class="loc-submit-btn" id="maint-submit-btn" onclick="window._submitMaintenance()">
          📨 Envoyer ma demande de dépannage
        </button>

      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) window._closeLivOverlay('loc-maint-overlay'); });
}

window._onMaintTypeChange = function(sel) {
  const opt = sel.options[sel.selectedIndex];
  // Rien de spécial ici, juste UX
};

window._maintDetectGPS = function() {
  const btn = document.getElementById('maint-gps-btn');
  detectGPS(btn,
    (lat, lng) => {
      const km = haversine(lat, lng, ADIDOGOME.lat, ADIDOGOME.lng);
      const { fare, detail } = fmtFare(km);
      window._maintGps = { lat, lng, km, fare };
      document.getElementById('maint-gps-title').textContent  = 'Position détectée ✅';
      document.getElementById('maint-gps-coords').textContent = `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
      document.getElementById('maint-gps-status').textContent = 'Votre position d\'intervention';
      document.getElementById('maint-gps-card').classList.add('active');
      const sel = document.getElementById('zone-select-maint');
      if (sel) sel.value = '';
      showMaintFare(km, fare, detail, lat, lng);
    },
    (err, fallLat, fallLng) => {
      const km = haversine(fallLat, fallLng, ADIDOGOME.lat, ADIDOGOME.lng);
      const { fare, detail } = fmtFare(km);
      window._maintGps = { lat:fallLat, lng:fallLng, km, fare };
      document.getElementById('maint-gps-title').textContent  = 'Position simulée (démo)';
      document.getElementById('maint-gps-coords').textContent = `${fallLat.toFixed(5)}° N, ${fallLng.toFixed(5)}° E`;
      document.getElementById('maint-gps-status').textContent = '⚠️ GPS refusé — position approximative';
      document.getElementById('maint-gps-card').classList.add('active');
      showMaintFare(km, fare, detail, fallLat, fallLng);
    }
  );
};

window._maintZoneChange = function(sel) {
  const val = sel.value;
  if (!val) { window._maintGps = null; document.getElementById('maint-fare-box').style.display='none'; return; }
  const [lat, lng, name] = val.split('|');
  const la = parseFloat(lat), lo = parseFloat(lng);
  const km = haversine(la, lo, ADIDOGOME.lat, ADIDOGOME.lng);
  const { fare, detail } = fmtFare(km);
  window._maintGps = { lat:la, lng:lo, km, fare, label:name };
  document.getElementById('maint-gps-title').textContent  = `Zone : ${name}`;
  document.getElementById('maint-gps-coords').textContent = `${la.toFixed(5)}° N, ${lo.toFixed(5)}° E`;
  document.getElementById('maint-gps-status').textContent = 'Quartier sélectionné';
  document.getElementById('maint-gps-card').classList.add('active');
  showMaintFare(km, fare, detail, la, lo);
};

function showMaintFare(km, fare, detail, lat, lng) {
  document.getElementById('maint-fare-km').textContent    = km.toFixed(1) + ' km depuis Adidogomé';
  document.getElementById('maint-fare-price').textContent = fmtMoney(fare);
  document.getElementById('maint-fare-detail').textContent= `Frais déplacement · ${detail}`;
  document.getElementById('maint-fare-box').style.display = 'flex';
}

window._submitMaintenance = async function() {
  const currentUser = window._currentUser;
  if (!currentUser) { if (window.openAuthModal) window.openAuthModal('login'); return; }

  const typeEl = document.getElementById('maint-type-select');
  const descEl = document.getElementById('maint-desc');
  const type   = typeEl?.value;
  const desc   = descEl?.value.trim();

  if (!type) {
    if (typeEl) typeEl.style.borderColor = '#F5820A';
    if (window.showToast) window.showToast('⚠️ Choisissez le type d\'intervention', '#F5820A');
    return;
  }
  if (!desc) {
    if (descEl) descEl.style.borderColor = '#F5820A';
    if (window.showToast) window.showToast('⚠️ Décrivez le problème', '#F5820A');
    return;
  }

  const typeLabel = MAINTENANCE_TYPES.find(t => t.id === type)?.label || type;
  const typeEmoji = MAINTENANCE_TYPES.find(t => t.id === type)?.emoji || '🔧';
  const gps       = window._maintGps || null;

  const btn = document.getElementById('maint-submit-btn');
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="loc-spinner"></span>Envoi…'; }

  try {
    const db = window._firestoreDb;
    const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const svc = window.SVCS?.['maintenance'] || { name:'Dépannage' };

    const docRef = await addDoc(collection(db, 'commandes'), {
      service:         'maintenance',
      serviceName:     `Dépannage — ${typeLabel}`,
      statut:          'En attente',
      typeIntervention: typeLabel,
      typeEmoji,
      besoin:          desc,
      modePaiement:    'livraison',
      paygateStatus:   'non_configure',
      // GPS
      positionType:    gps ? 'GPS' : 'non_definie',
      clientLat:       gps?.lat || null,
      clientLng:       gps?.lng || null,
      distanceKm:      gps ? parseFloat(gps.km.toFixed(2)) : null,
      fraisDeplacement:gps?.fare || 0,
      // Référence Adidogomé
      refLat:          ADIDOGOME.lat,
      refLng:          ADIDOGOME.lng,
      refLabel:        'Adidogomé',
      // Client
      uid:             currentUser.uid,
      clientNom:       currentUser.nom    || '',
      clientPrenom:    currentUser.prenom || '',
      clientGenre:     currentUser.genre  || '',
      phone:           currentUser.phone  || '',
      clientVille:     currentUser.ville  || '',
      createdAt:       serverTimestamp(),
    });

    const succMsg = document.getElementById('succ-msg');
    if (succMsg) {
      succMsg.innerHTML = `
        Demande <strong style="color:var(--blue)">${typeEmoji} ${typeLabel}</strong> envoyée !<br/>
        Référence : <strong>#${docRef.id.slice(0,8).toUpperCase()}</strong><br/>
        ${gps ? `📍 Distance depuis notre base : ${gps.km.toFixed(1)} km<br/>
                 🚗 Frais de déplacement estimés : ${fmtMoney(gps.fare)}<br/>` : ''}
        Notre équipe vous contactera très bientôt.<br/>
        <small style="color:var(--light)">Contact : ${currentUser.phone || ''}</small>`;
    }

    window._maintGps = null;
    window._closeLivOverlay('loc-maint-overlay');
    if (window.showSuccessView) window.showSuccessView();

  } catch(err) {
    console.error('[Maintenance]', err);
    if (window.showToast) window.showToast('❌ Erreur : ' + err.message, '#C62828');
    if (btn) { btn.disabled=false; btn.innerHTML='📨 Envoyer ma demande de dépannage'; }
  }
};

// ── Intercepter openService pour maintenance ──
const _origOpenServiceMaint = window.openService;
window.openService = function(id) {
  if (id === 'maintenance') {
    const currentUser = window._currentUser;
    if (!currentUser) {
      if (window.openAuthModal) window.openAuthModal('login');
      if (window.showToast) window.showToast('⚠️ Connectez-vous pour passer une commande', '#F5820A');
      return;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
    document.getElementById('p-services')?.classList.add('on');
    document.querySelectorAll('.btab').forEach(b => b.classList.remove('on'));
    document.getElementById('t-services')?.classList.add('on');
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('on'));
    document.getElementById('nl-services')?.classList.add('on');

    openMaintenanceModal();
    return;
  }
  _origOpenServiceMaint(id);
};

// ════════════════════════════════════════
// FIN DU MODULE
// ════════════════════════════════════════
console.log('[OmniService] localisation-module.js chargé ✅');

} // fin initLocalisationModule
