/* ══════════════════════════════════════════════════════════════════
   OmniService TG — localisation-module.js  v5  (Full Places Edition)
   Nouveautés v5 :
   ▸ Moteur Google Places Autocomplete — résultats en temps réel
   ▸ Restriction géographique : cercle ~30 km autour de Lomé + country:tg
   ▸ Icônes distinctives par type de lieu (station, resto, quartier…)
   ▸ Place Details → extraction lat/lng dynamique via Place ID
   ▸ Fare Card affiche le nom complet du lieu (ex : "Station Sanol Agoè")
   ▸ Champ de précision conservé (étage, porte, repère)
   ▸ Payload Firebase enrichi : placeName, placeId, lat/lng réels
   ▸ Logique Haversine/tarif/GPS/roadDistance : STRICTEMENT CONSERVÉE
   ══════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initLocalisationModule, 300);
});

function initLocalisationModule() {

// ════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════
const GOOGLE_MAPS_API_KEY = 'AIzaSyD8SidnsUkDMbIc9jA1qxBbuaZpuThNbMI';
const OMNI_DEPOT          = { lat: 6.17719, lng: 1.18233 };
// Centre de Lomé + rayon ~30 km pour le biais Places
const LOME_CENTER         = { lat: 6.1375, lng: 1.2123 };
const LOME_RADIUS_M       = 30000;
const CATALOGUE_GPS_SERVICES = ['food','marketplace','omni_drink','clothes','restaurant'];

// ════════════════════════════════════════
// CHARGEMENT ASYNCHRONE DE LA LIBRAIRIE GOOGLE MAPS (Places)
// ════════════════════════════════════════
let _placesLibReady = false;
let _placesLib      = null; // google.maps.places namespace

function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    // Déjà chargé (nouvelle API v=beta avec importLibrary)
    if (window.google?.maps?.importLibrary) {
      window.google.maps.importLibrary('places').then(lib => {
        _placesLib = lib;
        _placesLibReady = true;
        resolve();
      }).catch(reject);
      return;
    }
    // Ancienne API déjà chargée (fallback)
    if (window.google?.maps?.places) {
      _placesLib = window.google.maps.places;
      _placesLibReady = true;
      resolve();
      return;
    }
    if (document.getElementById('gmap-script')) {
      // Script déjà en cours de chargement — attendre
      const wait = setInterval(() => {
        if (window.google?.maps?.importLibrary) {
          clearInterval(wait);
          window.google.maps.importLibrary('places').then(lib => {
            _placesLib = lib;
            _placesLibReady = true;
            resolve();
          }).catch(reject);
        } else if (window.google?.maps?.places) {
          clearInterval(wait);
          _placesLib = window.google.maps.places;
          _placesLibReady = true;
          resolve();
        }
      }, 100);
      return;
    }
    // Charger le SDK avec v=beta pour accéder à importLibrary + nouvelle Places API
    const s = document.createElement('script');
    s.id  = 'gmap-script';
    // v=beta expose importLibrary() et la nouvelle AutocompleteSuggestion
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&v=beta&libraries=places&language=fr&loading=async`;
    s.async = true;
    s.defer = true;
    s.onload = () => {
      if (window.google?.maps?.importLibrary) {
        window.google.maps.importLibrary('places').then(lib => {
          _placesLib = lib;
          _placesLibReady = true;
          resolve();
        }).catch(reject);
      } else {
        _placesLib = window.google.maps.places;
        _placesLibReady = true;
        resolve();
      }
    };
    s.onerror = () => reject(new Error('Google Maps SDK failed to load'));
    document.head.appendChild(s);
  });
}

// Démarrer le chargement immédiatement
loadGoogleMaps().catch(e => console.warn('[OmniService] Google Maps:', e.message));

// ════════════════════════════════════════
// ICÔNES PAR TYPE DE LIEU
// ════════════════════════════════════════
const PLACE_TYPE_ICONS = {
  gas_station          : '⛽',
  fuel                 : '⛽',
  restaurant           : '🍽️',
  food                 : '🍔',
  cafe                 : '☕',
  bar                  : '🍺',
  bakery               : '🥐',
  bank                 : '🏦',
  atm                  : '🏧',
  hospital             : '🏥',
  pharmacy             : '💊',
  school               : '🏫',
  university           : '🎓',
  church               : '⛪',
  mosque               : '🕌',
  supermarket          : '🛒',
  grocery_or_supermarket:'🛒',
  store                : '🏪',
  shopping_mall        : '🏬',
  hotel                : '🏨',
  lodging              : '🏨',
  airport              : '✈️',
  transit_station      : '🚉',
  bus_station          : '🚌',
  taxi_stand           : '🚕',
  park                 : '🌳',
  stadium              : '🏟️',
  gym                  : '🏋️',
  neighborhood         : '🏘️',
  sublocality          : '🏘️',
  locality             : '🌆',
  political            : '📍',
  route                : '🛣️',
  point_of_interest    : '📌',
  establishment        : '🏢',
};

function placeIcon(types) {
  if (!types) return '📍';
  for (const t of types) {
    if (PLACE_TYPE_ICONS[t]) return PLACE_TYPE_ICONS[t];
  }
  return '📍';
}

// ════════════════════════════════════════
// MATHS & TARIF — STRICTEMENT CONSERVÉ
// ════════════════════════════════════════
function haversine(la1, lo1, la2, lo2) {
  const R = 6371, dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function roadDistance(la1, lo1, la2, lo2) {
  try {
    const origin = `${la1},${lo1}`;
    const dest   = `${la2},${lo2}`;
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${dest}&mode=driving&language=fr&key=${GOOGLE_MAPS_API_KEY}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const el = data?.rows?.[0]?.elements?.[0];
    if (el?.status === 'OK' && el.distance?.value) {
      const km = el.distance.value / 1000;
      const dur = el.duration?.text || '';
      return { km, durationText: dur };
    }
    throw new Error('Distance Matrix: ' + el?.status);
  } catch (err) {
    console.warn('[roadDistance] fallback haversine ×1.4 —', err.message);
    const km = haversine(la1, lo1, la2, lo2) * 1.4;
    return { km, durationText: '' };
  }
}

function calcFare(km) {
  if (km < 2) return 500;
  return 500 + Math.ceil(km - 1) * 100;
}
function fmtFare(km) {
  const fare = calcFare(km);
  const detail = km >= 2
    ? `${km.toFixed(2)} km · 500+${Math.ceil(km-1)}×100 FCFA`
    : `${km.toFixed(2)} km · forfait 500 FCFA`;
  return { fare, detail };
}
function fmtMoney(n) { return Number(n).toLocaleString('fr-FR') + ' FCFA'; }

// ════════════════════════════════════════
// GPS — DÉTECTION GÉNÉRIQUE — INCHANGÉ
// ════════════════════════════════════════
function detectGPS(btnEl, onOk, onFail) {
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:loc-spin .7s linear infinite;vertical-align:middle;margin-right:5px"></span>Localisation…'; }
  if (!navigator.geolocation) {
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '📍 Détecter'; }
    if (onFail) onFail('no-gps', null, null); return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => { if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '🔄 Actualiser'; } onOk(pos.coords.latitude, pos.coords.longitude); },
    ()  => { if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '🔄 Actualiser'; } if (onFail) onFail('refused', null, null); },
    { timeout: 9000, enableHighAccuracy: true }
  );
}

// ════════════════════════════════════════
// CSS v5 — SEARCH-FIRST + PLACES
// ════════════════════════════════════════
if (!document.getElementById('loc-css')) {
  const s = document.createElement('style'); s.id = 'loc-css';
  s.textContent = `
    @keyframes loc-spin{to{transform:rotate(360deg)}}
    @keyframes loc-up{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes loc-fade-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes loc-pulse{0%,100%{opacity:1}50%{opacity:.5}}

    .loc-ov{display:none;position:fixed;inset:0;z-index:3000;background:rgba(10,18,32,.6);backdrop-filter:blur(4px);align-items:flex-end;justify-content:center;}
    .loc-ov.open{display:flex;}
    .loc-sh{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:480px;max-height:92vh;overflow-y:auto;padding-bottom:env(safe-area-inset-bottom,16px);animation:loc-up .3s cubic-bezier(.16,1,.3,1);}
    .loc-handle{width:40px;height:4px;border-radius:2px;background:#E8EAF0;margin:12px auto 0;}
    .loc-hdr{padding:16px 20px 14px;border-bottom:1px solid #E8EAF0;display:flex;align-items:center;gap:12px;}
    .loc-hico{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}
    .loc-htitle{font-size:16px;font-weight:800;font-family:'Nunito',sans-serif;color:#1A1A2E;}
    .loc-hsub{font-size:11px;color:#9999BB;margin-top:1px;}
    .loc-hclose{margin-left:auto;background:#F4F6FA;border:none;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;color:#9999BB;display:flex;align-items:center;justify-content:center;}
    .loc-body{padding:16px 20px 24px;}
    .loc-sl{font-size:11px;font-weight:700;color:#4A4A6A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;margin-top:16px;}
    .loc-sl:first-child{margin-top:0;}
    .loc-gc{background:linear-gradient(135deg,#E3F2FD,#BBDEFB);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;border:1.5px solid transparent;transition:border-color .15s;}
    .loc-gc.on{border-color:#1E6FBE;}
    .loc-gc.off{background:linear-gradient(135deg,#F4F6FA,#E8EAF0);border-color:#E8EAF0;}
    .loc-gi{flex:1;min-width:0;}
    .loc-gt{font-size:13px;font-weight:700;color:#155A9C;}
    .loc-gc2{font-size:11px;color:#1E6FBE;font-weight:600;margin-top:2px;}
    .loc-gs{font-size:10px;color:#4A4A6A;margin-top:1px;}
    .loc-gbtn{background:#1E6FBE;color:#fff;border:none;border-radius:999px;padding:8px 14px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Poppins',sans-serif;white-space:nowrap;flex-shrink:0;}
    .loc-gbtn:disabled{opacity:.55;cursor:not-allowed;}
    .loc-or{display:flex;align-items:center;gap:10px;margin:10px 0;font-size:11px;color:#9999BB;}
    .loc-or::before,.loc-or::after{content:'';flex:1;height:1px;background:#E8EAF0;}

    /* ══ PLACES AUTOCOMPLETE WIDGET ══ */
    .lsf-wrap{position:relative;width:100%;}
    .lsf-input-row{display:flex;align-items:center;gap:8px;background:#F4F6FA;border:1.5px solid #E8EAF0;border-radius:14px;padding:10px 14px;transition:border-color .2s,background .2s;}
    .lsf-input-row:focus-within{border-color:#1E6FBE;background:#EEF6FF;}
    .lsf-icon{font-size:16px;flex-shrink:0;color:#9999BB;}
    .lsf-input{flex:1;border:none;background:transparent;outline:none;font-size:14px;font-family:'Poppins',sans-serif;color:#1A1A2E;}
    .lsf-input::placeholder{color:#B0B0C8;}
    .lsf-clear{background:none;border:none;cursor:pointer;color:#9999BB;font-size:16px;padding:0;line-height:1;display:none;}
    .lsf-clear.visible{display:block;}
    .lsf-dropdown{display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.12),0 2px 8px rgba(0,0,0,.06);border:1px solid #E8EAF0;z-index:9999;overflow:hidden;animation:loc-fade-in .18s ease;}
    .lsf-dropdown.open{display:block;}
    .lsf-item{padding:12px 16px;cursor:pointer;border-bottom:1px solid #F4F6FA;transition:background .12s;display:flex;align-items:center;gap:12px;}
    .lsf-item:last-child{border-bottom:none;}
    .lsf-item:hover,.lsf-item.active{background:#EEF6FF;}
    .lsf-item-ico{font-size:16px;flex-shrink:0;}
    .lsf-item-body{flex:1;min-width:0;}
    .lsf-item-name{font-size:13px;font-weight:700;color:#1A1A2E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .lsf-item-commune{font-size:11px;color:#9999BB;margin-top:1px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .lsf-item-name em{background:#FFF9C4;color:#1A1A2E;font-style:normal;border-radius:3px;padding:0 2px;}
    .lsf-empty{padding:20px 16px;text-align:center;color:#9999BB;font-size:12px;}
    .lsf-loading{padding:14px 16px;text-align:center;color:#9999BB;font-size:12px;display:flex;align-items:center;justify-content:center;gap:8px;}
    .lsf-powered{padding:8px 14px;font-size:10px;color:#B0B0C8;text-align:right;border-top:1px solid #F4F6FA;}

    /* ══ FARE CARD ══ */
    .lsf-fare-card{background:linear-gradient(135deg,#1E6FBE,#155A9C);border-radius:14px;padding:14px 16px;color:#fff;margin-top:12px;display:flex;align-items:center;gap:14px;animation:loc-fade-in .25s ease;}
    .lsf-fare-card.hors-zone{background:linear-gradient(135deg,#C62828,#B71C1C);}
    .lsf-fare-zone{flex:1;}
    .lsf-fare-qname{font-size:13px;font-weight:800;font-family:'Nunito',sans-serif;margin-bottom:2px;}
    .lsf-fare-commune{font-size:10px;color:rgba(255,255,255,.65);margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px;}
    .lsf-fare-price{font-size:24px;font-weight:900;font-family:'Nunito',sans-serif;}
    .lsf-fare-detail{font-size:10px;color:rgba(255,255,255,.55);margin-top:3px;}
    .lsf-selected-badge{display:inline-flex;align-items:center;gap:6px;background:#E8F5E9;border:1.5px solid #A5D6A7;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;color:#2E7D32;margin-top:8px;}

    /* ══ CHAMP DE PRÉCISION ══ */
    .loc-precision-box{background:#F9FAFB;border:1.5px solid #E8EAF0;border-radius:14px;padding:14px 16px;margin-top:12px;}
    .loc-precision-title{font-size:11px;font-weight:700;color:#4A4A6A;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;display:flex;align-items:center;gap:6px;}
    .loc-precision-sub{font-size:10px;color:#9999BB;font-weight:400;text-transform:none;letter-spacing:0;}

    .loc-sel{width:100%;padding:11px 14px;border:1.5px solid #E8EAF0;border-radius:12px;font-size:13px;font-family:'Poppins',sans-serif;background:#F4F6FA;color:#1A1A2E;outline:none;transition:border-color .2s;}
    .loc-sel:focus{border-color:#1E6FBE;background:#fff;}
    .loc-sel.on{border-color:#1E6FBE;background:#EEF6FF;}
    .loc-fare{background:linear-gradient(135deg,#1E6FBE,#155A9C);border-radius:14px;padding:14px 16px;color:#fff;margin-top:14px;display:flex;align-items:center;gap:14px;}
    .loc-fkm{font-size:13px;font-weight:700;color:rgba(255,255,255,.85);}
    .loc-fp{font-size:22px;font-weight:900;font-family:'Nunito',sans-serif;}
    .loc-fd{font-size:10px;color:rgba(255,255,255,.55);margin-top:3px;}
    .loc-pc{background:#F4F6FA;border-radius:14px;padding:14px 16px;border:1.5px solid #E8EAF0;margin-bottom:4px;}
    .loc-ph{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
    .loc-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;}
    .loc-dg{background:#2E7D32;} .loc-dr{background:#C62828;}
    .loc-ptit{font-size:13px;font-weight:700;color:#1A1A2E;}
    .loc-psub{font-size:10px;color:#9999BB;margin-top:1px;}
    .loc-btn{display:block;width:100%;margin-top:16px;background:linear-gradient(135deg,#1E6FBE,#155A9C);color:#fff;border:none;border-radius:999px;padding:16px;font-size:15px;font-weight:700;cursor:pointer;font-family:'Poppins',sans-serif;box-shadow:0 4px 18px rgba(30,111,190,.35);transition:all .2s;}
    .loc-btn:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(30,111,190,.45);}
    .loc-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;}
    .loc-spin{display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:loc-spin .7s linear infinite;vertical-align:middle;margin-right:6px;}
    .loc-ta{width:100%;padding:10px 13px;border:1.5px solid #E8EAF0;border-radius:12px;font-size:13px;font-family:'Poppins',sans-serif;background:#F4F6FA;color:#1A1A2E;outline:none;resize:none;transition:border-color .2s;}
    .loc-ta:focus{border-color:#1E6FBE;background:#fff;}
    .loc-inp{width:100%;padding:11px 14px;border:1.5px solid #E8EAF0;border-radius:12px;font-size:13px;font-family:'Poppins',sans-serif;background:#F4F6FA;color:#1A1A2E;outline:none;transition:border-color .2s;}
    .loc-inp:focus{border-color:#1E6FBE;background:#fff;}
    .recap-frais-row{display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:6px 0;border-top:1px dashed #E8EAF0;margin-top:6px;}
    .recap-frais-lbl{color:#4A4A6A;}
    .recap-frais-val{font-weight:700;color:#1E6FBE;}
    .recap-loc-box{background:#EEF6FF;border-radius:12px;padding:10px 14px;margin-top:10px;font-size:11px;color:#155A9C;border:1px solid #BBDEFB;line-height:1.6;}
    .loc-horszone{background:linear-gradient(135deg,#FFEBEE,#FFCDD2);border:1.5px solid #EF9A9A;border-radius:16px;padding:16px 18px;margin-top:14px;display:flex;gap:14px;align-items:flex-start;}
    .loc-horszone-ico{font-size:28px;flex-shrink:0;margin-top:2px;}
    .loc-horszone-body{flex:1;min-width:0;}
    .loc-horszone-title{font-size:15px;font-weight:800;font-family:'Nunito',sans-serif;color:#B71C1C;margin-bottom:5px;}
    .loc-horszone-msg{font-size:12px;color:#C62828;line-height:1.6;}
    .loc-horszone-detail{font-size:11px;color:#E53935;margin-top:6px;font-weight:600;}
    .loc-horszone-tip{margin-top:10px;background:rgba(198,40,40,.08);border-radius:10px;padding:9px 12px;font-size:11px;color:#7F0000;line-height:1.6;}
  `;
  document.head.appendChild(s);
}

// ════════════════════════════════════════
// HELPERS COMMUNS
// ════════════════════════════════════════
function ov(id) { return document.getElementById(id); }
function removeOv(id) { ov(id)?.remove(); }
function makeOv(id) { let el = ov(id); if (el) el.remove(); el = document.createElement('div'); el.id = id; el.className = 'loc-ov open'; return el; }

// ════════════════════════════════════════════════════════════════
// MOTEUR GOOGLE PLACES AUTOCOMPLETE
// ────────────────────────────────────────────────────────────────
// Remplace entièrement ZONES_LOME + searchZones() de la v4.
// Chaque widget appelle AutocompleteService.getPlacePredictions()
// puis PlacesService.getDetails() pour récupérer lat/lng via Place ID.
// ════════════════════════════════════════════════════════════════
let _placesServiceDiv = null;
function getPlacesService() {
  if (!_placesServiceDiv) {
    _placesServiceDiv = document.createElement('div');
    document.body.appendChild(_placesServiceDiv);
  }
  return new window.google.maps.places.PlacesService(_placesServiceDiv);
}

// Debounce pour éviter de sur-solliciter l'API
function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Map inputId → debounced predict function (une instance par widget)
const _debouncedPredict = {};

/**
 * Lance la prédiction Places pour un widget donné
 */
function _placesPredict(inputId, dropdownId) {
  const inp = ov(inputId);
  const dd  = ov(dropdownId);
  if (!inp || !dd) return;

  const q = inp.value.trim();

  if (q.length === 0) {
    dd.innerHTML = '';
    dd.classList.remove('open');
    return;
  }

  // Afficher un indicateur de chargement
  dd.innerHTML = `<div class="lsf-loading"><span style="display:inline-block;width:12px;height:12px;border:2px solid #E8EAF0;border-top-color:#1E6FBE;border-radius:50%;animation:loc-spin .7s linear infinite"></span>Recherche en cours…</div>`;
  dd.classList.add('open');

  if (!window.google?.maps) {
    dd.innerHTML = `<div class="lsf-empty">⚠️ Service de localisation non disponible</div>`;
    return;
  }

  // Helper commun : affiche les suggestions dans le dropdown
  function _renderSuggestions(items) {
    // items = [{ placeId, main, secondary, types }]
    if (!items?.length) {
      dd.innerHTML = `<div class="lsf-empty">🏙️ Aucun lieu trouvé pour "<strong>${q}</strong>"<br/><span style="font-size:10px;color:#B0B0C8">Essayez : hôtel, carrefour, banque, quartier…</span></div>`;
      return;
    }
    dd.innerHTML = items.map((it, i) => {
      const icon     = placeIcon(it.types || []);
      const safeMain = it.main.replace(/'/g, '&#39;');
      const safeSec  = it.secondary.replace(/'/g, '&#39;');
      return `
      <div class="lsf-item" data-i="${i}"
           onmousedown="window._lsfPlaceSelect('${inputId}','${dropdownId}','${it.placeId}','${safeMain}','${safeSec}')">
        <span class="lsf-item-ico">${icon}</span>
        <div class="lsf-item-body">
          <div class="lsf-item-name">${it.main}</div>
          <div class="lsf-item-commune">${it.secondary}</div>
        </div>
      </div>`;
    }).join('') + `<div class="lsf-powered">Propulsé par Google</div>`;
    dd.classList.add('open');
  }

  // ── Nouvelle API (disponible depuis v=beta, mars 2025) ──
  const useNewApi = !!window.google.maps.places?.AutocompleteSuggestion;

  if (useNewApi) {
    window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input              : q,
      locationBias       : { center: LOME_CENTER, radius: LOME_RADIUS_M },
      includedRegionCodes: ['tg'],
      language           : 'fr',
    }).then(({ suggestions }) => {
      _renderSuggestions((suggestions || []).map(s => {
        const pred = s.placePrediction;
        return {
          placeId   : pred?.placeId || '',
          main      : pred?.mainText?.text      || pred?.text?.text || '',
          secondary : pred?.secondaryText?.text || '',
          types     : pred?.types || [],
        };
      }));
    }).catch(() => {
      dd.innerHTML = `<div class="lsf-empty">⚠️ Erreur de recherche — réessayez</div>`;
    });

  } else {
    // ── Fallback : ancienne AutocompleteService (toujours fonctionnelle) ──
    const autocompleteService = new window.google.maps.places.AutocompleteService();
    const latDelta = LOME_RADIUS_M / 1000 / 111;
    const lngDelta = LOME_RADIUS_M / 1000 / (111 * Math.cos(LOME_CENTER.lat * Math.PI / 180));
    const bounds   = new window.google.maps.LatLngBounds(
      { lat: LOME_CENTER.lat - latDelta, lng: LOME_CENTER.lng - lngDelta },
      { lat: LOME_CENTER.lat + latDelta, lng: LOME_CENTER.lng + lngDelta }
    );
    autocompleteService.getPlacePredictions({
      input                : q,
      locationBias         : { latLngBounds: bounds, strictBounds: false },
      componentRestrictions: { country: 'tg' },
      language             : 'fr',
    }, (predictions, status) => {
      _renderSuggestions(status !== window.google.maps.places.PlacesServiceStatus.OK
        ? []
        : (predictions || []).map(p => ({
            placeId   : p.place_id,
            main      : p.structured_formatting?.main_text      || p.description,
            secondary : p.structured_formatting?.secondary_text || '',
            types     : p.types || [],
          }))
      );
    });
  }
}

/**
 * Sélection d'une suggestion Places → Place Details → lat/lng → callbacks contextuels
 */
window._lsfPlaceSelect = function(inputId, dropdownId, placeId, mainText, secondaryText) {
  const inp = ov(inputId);
  const dd  = ov(dropdownId);
  const clr = ov(inputId + '-clear');
  if (inp) inp.value = mainText;
  if (dd) { dd.innerHTML = ''; dd.classList.remove('open'); }
  if (clr) clr.classList.add('visible');

  // Afficher état "résolution des coordonnées"
  _dispatchPlaceLoading(inputId, mainText, secondaryText);

  if (!window.google?.maps?.places) {
    if (window.showToast) window.showToast('⚠️ Service Google Maps non disponible', '#F5820A');
    return;
  }

  const svc = getPlacesService();
  svc.getDetails({ placeId, fields: ['geometry', 'name', 'types', 'formatted_address'] }, (place, status) => {
    if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
      if (window.showToast) window.showToast('⚠️ Impossible de localiser ce lieu — réessayez', '#F5820A');
      return;
    }
    const lat    = place.geometry.location.lat();
    const lng    = place.geometry.location.lng();
    const name   = place.name || mainText;
    const address= place.formatted_address || secondaryText;

    // Dispatcher vers le bon module selon l'inputId
    if      (inputId === 'cg-sf-inp')    _catSelectPlace(lat, lng, name, address, placeId);
    else if (inputId === 'lv-sf-inp-A')  _livSelectPlace('A', lat, lng, name, address, placeId);
    else if (inputId === 'lv-sf-inp-B')  _livSelectPlace('B', lat, lng, name, address, placeId);
    else if (inputId === 'mg-sf-inp')    _maintSelectPlace(lat, lng, name, address, placeId);
    else if (inputId === 'kl-sf-inp')    _kitSelectPlace(lat, lng, name, address, placeId);
  });
};

function _dispatchPlaceLoading(inputId, name, address) {
  const wrapId =
    inputId === 'cg-sf-inp'   ? 'cg-farecard-wrap'  :
    inputId === 'mg-sf-inp'   ? 'mg-farecard-wrap'  :
    inputId === 'kl-sf-inp'   ? 'kl-farecard-wrap'  :
    inputId === 'lv-sf-inp-A' ? 'lv-farecard-A'     :
    inputId === 'lv-sf-inp-B' ? 'lv-farecard-B'     : null;
  if (!wrapId) return;
  const wrap = ov(wrapId);
  if (wrap) wrap.innerHTML = `
    <div class="lsf-fare-card" style="margin-top:10px">
      <div style="font-size:26px">📍</div>
      <div class="lsf-fare-zone">
        <div class="lsf-fare-qname">${name}</div>
        <div class="lsf-fare-commune">${address}</div>
        <div class="lsf-fare-detail" style="animation:loc-pulse 1s infinite">⏳ Calcul des frais…</div>
      </div>
    </div>`;
}

/**
 * Crée un widget Places Autocomplete (HTML uniquement, JS câblé séparément)
 */
function makeSearchWidget(wrapperId, inputId, dropdownId, placeholder = 'Rechercher un lieu à Lomé…') {
  return `
  <div class="lsf-wrap" id="${wrapperId}">
    <div class="lsf-input-row">
      <span class="lsf-icon">🔍</span>
      <input class="lsf-input" id="${inputId}" type="text"
        placeholder="${placeholder}" autocomplete="off" autocorrect="off"
        oninput="window._lsfInput('${inputId}','${dropdownId}')"
        onkeydown="window._lsfKey(event,'${inputId}','${dropdownId}')"
        onfocus="window._lsfFocus('${inputId}','${dropdownId}')"/>
      <button class="lsf-clear" id="${inputId}-clear"
        onclick="window._lsfClear('${inputId}','${dropdownId}')">✕</button>
    </div>
    <div class="lsf-dropdown" id="${dropdownId}"></div>
  </div>`;
}

let _lsfActiveIndex = -1;

// Initialise le debounce par inputId à la 1re frappe
window._lsfInput = function(inputId, dropdownId) {
  const inp = ov(inputId);
  const clr = ov(inputId + '-clear');
  if (!inp) return;
  const q = inp.value;
  if (clr) clr.classList.toggle('visible', q.length > 0);
  _lsfActiveIndex = -1;

  if (!_debouncedPredict[inputId]) {
    _debouncedPredict[inputId] = debounce(_placesPredict, 350);
  }
  _debouncedPredict[inputId](inputId, dropdownId);
};

window._lsfFocus = function(inputId, dropdownId) {
  const inp = ov(inputId);
  if (inp && inp.value.trim().length > 0) window._lsfInput(inputId, dropdownId);
};

window._lsfKey = function(e, inputId, dropdownId) {
  const dd = ov(dropdownId);
  if (!dd || !dd.classList.contains('open')) return;
  const items = dd.querySelectorAll('.lsf-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _lsfActiveIndex = Math.min(_lsfActiveIndex + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _lsfActiveIndex = Math.max(_lsfActiveIndex - 1, -1);
  } else if (e.key === 'Enter' && _lsfActiveIndex >= 0) {
    e.preventDefault();
    items[_lsfActiveIndex]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    return;
  } else if (e.key === 'Escape') {
    dd.classList.remove('open');
    return;
  }
  items.forEach((it, i) => it.classList.toggle('active', i === _lsfActiveIndex));
};

window._lsfClear = function(inputId, dropdownId) {
  const inp = ov(inputId);
  const dd  = ov(dropdownId);
  const clr = ov(inputId + '-clear');
  if (inp) inp.value = '';
  if (dd) { dd.innerHTML = ''; dd.classList.remove('open'); }
  if (clr) clr.classList.remove('visible');
  if (inp) inp.focus();
};

document.addEventListener('click', function(e) {
  document.querySelectorAll('.lsf-dropdown.open').forEach(dd => {
    if (!dd.parentElement?.contains(e.target)) dd.classList.remove('open');
  });
});

// ════════════════════════════════════════════════════════
// MODULE 1 — CATALOGUE GPS (food, marketplace, etc.)
// ════════════════════════════════════════════════════════
const CAT = { lat: null, lng: null, fare: 0, km: 0, mode: null, zone: '', address: '', placeId: '', desc: '' };

function catDepot(svcId) {
  if (svcId === 'restaurant' && window.currentRestaurant) {
    const r = window.currentRestaurant;
    if (r.lat && r.lng) return { lat: parseFloat(r.lat), lng: parseFloat(r.lng) };
  }
  if (svcId !== 'restaurant') {
    const items = Object.values(window.cart || {});
    const withLoc = items.find(a => a.lat && a.lng);
    if (withLoc) return { lat: parseFloat(withLoc.lat), lng: parseFloat(withLoc.lng) };
  }
  return OMNI_DEPOT;
}

function buildCatDelivery(svcId) {
  const dv = document.getElementById('view-delivery');
  if (!dv) return;
  CAT.lat = null; CAT.lng = null; CAT.fare = 0; CAT.km = 0; CAT.mode = null;
  CAT.zone = ''; CAT.address = ''; CAT.placeId = ''; CAT.desc = '';
  ov('loc-horszone-block')?.remove();

  dv.innerHTML = `
    <div class="cat-hdr">
      <button class="back-btn" onclick="showView('catalogue')">←</button>
      <div style="font-size:22px">📍</div>
      <div>
        <div style="font-size:14px;font-weight:700;color:#1A1A2E">Position de livraison</div>
        <div style="font-size:11px;color:#9999BB">Étape 1 sur 2</div>
      </div>
    </div>
    <div class="step-bar">
      <div class="step active"><div class="step-num">1</div><span>Livraison</span></div>
      <div class="step-line"></div>
      <div class="step"><div class="step-num">2</div><span>Paiement</span></div>
    </div>
    <div class="order-card">
      <div class="order-card-title">📍 Votre position de livraison</div>

      <div class="loc-gc" id="cg-card">
        <div style="font-size:22px">📡</div>
        <div class="loc-gi">
          <div class="loc-gt" id="cg-t">Localisation GPS</div>
          <div class="loc-gc2" id="cg-c">Non détectée</div>
          <div class="loc-gs" id="cg-s">Appuyez pour détecter votre position exacte</div>
        </div>
        <button class="loc-gbtn" id="cg-btn" onclick="window._catGPS('${svcId}')">📍 Détecter</button>
      </div>

      <div class="loc-or">ou rechercher un lieu</div>

      ${makeSearchWidget('cg-sf-wrap', 'cg-sf-inp', 'cg-sf-dd', 'Hôtel, carrefour, banque, quartier…')}

      <div id="cg-farecard-wrap"></div>

      <div class="loc-precision-box" style="margin-top:14px">
        <div class="loc-precision-title">
          📌 Complément d'adresse
          <span class="loc-precision-sub">(optionnel)</span>
        </div>
        <textarea id="cg-desc" class="loc-ta" rows="2"
          placeholder="Ex : Derrière le marché, portail bleu, 2ème maison à gauche…"></textarea>
      </div>

      <div class="loc-fare" id="cg-fare" style="display:none">
        <div style="font-size:24px">🛵</div>
        <div style="flex:1">
          <div style="font-size:10px;color:rgba(255,255,255,.65);text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">Frais de livraison estimés</div>
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
            <span class="loc-fkm" id="cg-fkm">— km</span>
            <span class="loc-fp" id="cg-fp">— FCFA</span>
          </div>
          <div class="loc-fd" id="cg-fd"></div>
        </div>
      </div>
    </div>

    <input type="hidden" id="del-address" value=""/>
    <input type="hidden" id="del-desc" value=""/>
    <input type="hidden" id="del-notes" value=""/>
    <button class="btn-primary" onclick="window._catPay('${svcId}')">Continuer → Paiement</button>`;
}

window.buildCatDelivery = buildCatDelivery;

// ── Sélection via Places (Catalogue) ─────────────────────────────
function _catSelectPlace(lat, lng, name, address, placeId) {
  const btn = ov('cg-btn');
  if (btn) { btn.innerHTML = '📍 Détecter'; btn.disabled = false; }
  const card = ov('cg-card');
  if (card) { card.classList.remove('on'); card.classList.add('off'); }
  ov('cg-t') && (ov('cg-t').textContent = 'GPS non utilisé');
  ov('cg-c') && (ov('cg-c').textContent = '—');
  ov('cg-s') && (ov('cg-s').textContent = 'Lieu sélectionné via recherche');
  ov('cg-fare') && (ov('cg-fare').style.display = 'none');

  CAT.lat = lat; CAT.lng = lng; CAT.zone = name; CAT.address = address;
  CAT.placeId = placeId; CAT.mode = 'place';

  _renderCatFareCard(name, address, null, null, true);

  const svcId = window.currentService || 'food';
  const d = catDepot(svcId);
  roadDistance(lat, lng, d.lat, d.lng).then(({ km, durationText }) => {
    const { fare, detail } = fmtFare(km);
    CAT.km = km; CAT.fare = fare;
    setCatFare(km, fare, detail);
    _renderCatFareCard(name, address, fare, detail, false);
  });
}

function _renderCatFareCard(name, address, fare, detail, loading) {
  const wrap = ov('cg-farecard-wrap');
  if (!wrap) return;

  const svcId   = window.currentService || '';
  const isResto = svcId === 'restaurant';
  const horsZone= isResto && fare !== null && fare >= RESTAURANT_MAX_FARE;

  if (loading) {
    wrap.innerHTML = `
      <div class="lsf-fare-card">
        <div style="font-size:26px">🛵</div>
        <div class="lsf-fare-zone">
          <div class="lsf-fare-qname">${name}</div>
          <div class="lsf-fare-commune">${address}</div>
          <div class="lsf-fare-detail" style="animation:loc-pulse 1s infinite">⏳ Calcul de la distance…</div>
        </div>
      </div>`;
    return;
  }

  if (horsZone) {
    wrap.innerHTML = `
      <div class="lsf-fare-card hors-zone">
        <div style="font-size:26px">🚫</div>
        <div class="lsf-fare-zone">
          <div class="lsf-fare-qname">${name}</div>
          <div class="lsf-fare-commune">${address}</div>
          <div class="lsf-fare-price">Hors zone</div>
          <div class="lsf-fare-detail">Distance trop élevée pour la livraison</div>
        </div>
      </div>`;
    return;
  }

  if (fare !== null) {
    wrap.innerHTML = `
      <div class="lsf-fare-card">
        <div style="font-size:26px">🛵</div>
        <div class="lsf-fare-zone">
          <div class="lsf-fare-qname">${name}</div>
          <div class="lsf-fare-commune">${address}</div>
          <div class="lsf-fare-price">${fmtMoney(fare)}</div>
          <div class="lsf-fare-detail">${detail}</div>
        </div>
        <span class="lsf-selected-badge">✅ Sélectionné</span>
      </div>`;
  }
}

window._catGPS = function(svcId) {
  window._lsfClear('cg-sf-inp', 'cg-sf-dd');
  const fareWrap = ov('cg-farecard-wrap');
  if (fareWrap) fareWrap.innerHTML = '';
  CAT.mode = 'gps';
  detectGPS(ov('cg-btn'),
    async (la, lo) => {
      CAT.lat = la; CAT.lng = lo;
      setCatCard(true, 'Position détectée ✅', `${la.toFixed(5)}° N, ${lo.toFixed(5)}° E`, 'Calcul de la distance en cours…');
      const d = catDepot(svcId);
      const { km, durationText } = await roadDistance(la, lo, d.lat, d.lng);
      const { fare, detail } = fmtFare(km);
      CAT.km = km; CAT.fare = fare;
      const sub = durationText ? `Votre position actuelle · ~${durationText}` : 'Votre position actuelle';
      setCatCard(true, 'Position détectée ✅', `${la.toFixed(5)}° N, ${lo.toFixed(5)}° E`, sub);
      setCatFare(km, fare, detail);
    },
    (e, la, lo) => {
      if (la === null) { if (window.showToast) window.showToast('⚠️ GPS refusé — recherchez un lieu', '#F5820A'); CAT.mode = null; return; }
      if (window.showToast) window.showToast('⚠️ Accès GPS refusé — recherchez votre lieu dans la liste', '#F5820A');
      CAT.mode = null;
    }
  );
};

const RESTAURANT_MAX_FARE = 2000;

function setCatFare(km, fare, detail) {
  const svcId    = window.currentService || '';
  const isResto  = svcId === 'restaurant';
  const horsZone = isResto && fare >= RESTAURANT_MAX_FARE;

  const fkmEl = ov('cg-fkm');
  const fpEl  = ov('cg-fp');
  const fdEl  = ov('cg-fd');
  const fc    = ov('cg-fare');
  const subBtn= document.querySelector('#view-delivery .btn-primary');

  if (fkmEl) fkmEl.textContent = km > 0 ? km.toFixed(1) + ' km' : '— km';
  if (fc) fc.style.display = 'flex';
  ov('loc-horszone-block')?.remove();

  if (horsZone) {
    if (fc) fc.style.background = 'linear-gradient(135deg,#C62828,#B71C1C)';
    if (fpEl) fpEl.innerHTML = '🚫 Hors zone';
    if (fdEl) fdEl.textContent = `${km.toFixed(1)} km — Zone non desservie`;
    if (subBtn) { subBtn.disabled = true; subBtn.style.opacity = '0.45'; }
    const hz = document.createElement('div');
    hz.id = 'loc-horszone-block'; hz.className = 'loc-horszone';
    hz.innerHTML = `
      <div class="loc-horszone-ico">🚫</div>
      <div class="loc-horszone-body">
        <div class="loc-horszone-title">Commande hors zone</div>
        <div class="loc-horszone-msg">
          Votre position est trop éloignée.<br/>
          Distance calculée : <strong>${km.toFixed(1)} km</strong> — frais <strong>${fmtMoney(fare)}</strong>, au-delà du seuil de <strong>${fmtMoney(RESTAURANT_MAX_FARE)}</strong>.
        </div>
        <div class="loc-horszone-detail">📍 Zone desservie : jusqu'à ${fmtMoney(RESTAURANT_MAX_FARE)} de frais</div>
        <div class="loc-horszone-tip">💡 <strong>Que faire ?</strong><br/>• Choisissez un lieu plus proche de Lomé Centre<br/>• Contactez-nous pour une livraison spéciale</div>
      </div>`;
    if (fc?.parentNode) fc.parentNode.insertBefore(hz, fc.nextSibling);
    if (window.showToast) window.showToast('🚫 Hors zone — livraison non disponible', '#C62828');
  } else {
    if (fc) fc.style.background = 'linear-gradient(135deg,#1E6FBE,#155A9C)';
    if (fpEl) fpEl.textContent = fmtMoney(fare);
    if (fdEl) fdEl.textContent = detail;
    if (subBtn) { subBtn.disabled = false; subBtn.style.opacity = '1'; }
  }
}

window._catPay = function(svcId) {
  if (!window._currentUser) { if (window.openAuthModal) window.openAuthModal('login'); return; }
  if (!CAT.lat) { if (window.showToast) window.showToast('⚠️ Détectez votre position GPS ou recherchez un lieu', '#F5820A'); return; }
  if (svcId === 'restaurant' && CAT.fare >= RESTAURANT_MAX_FARE) {
    if (window.showToast) window.showToast('🚫 Hors zone — trop éloigné pour la livraison', '#C62828');
    return;
  }

  CAT.desc = ov('cg-desc')?.value.trim() || '';
  window._catGpsSnapshot = {
    lat: CAT.lat, lng: CAT.lng, fare: CAT.fare, km: CAT.km,
    mode: CAT.mode, zone: CAT.zone, address: CAT.address, placeId: CAT.placeId, desc: CAT.desc
  };

  const items = Object.values(window.cart || {});
  const sub   = items.reduce((s, a) => s + a.price * a.qty, 0);
  const total = sub + CAT.fare;

  let rhtml = items.map(a => `
    <div class="recap-item">
      <div><span class="recap-name">${a.name}</span><span class="recap-qty">x${a.qty}</span></div>
      <div class="recap-price">${fmtMoney(a.price * a.qty)}</div>
    </div>`).join('');
  rhtml += `<div class="recap-frais-row">
    <span class="recap-frais-lbl">🛵 Frais de livraison (${CAT.km.toFixed(1)} km)</span>
    <span class="recap-frais-val">${fmtMoney(CAT.fare)}</span>
  </div>`;

  const ri = ov('recap-items'); if (ri) ri.innerHTML = rhtml;
  const tv = ov('recap-total-val'); if (tv) tv.textContent = fmtMoney(total);
  window._catTotalWithFrais = total;

  const locLabel = CAT.mode === 'place'
    ? `📍 ${CAT.zone} <span style="color:#9999BB;font-size:10px">(${CAT.address})</span>`
    : `📡 GPS : ${CAT.lat.toFixed(4)}° N, ${CAT.lng.toFixed(4)}° E`;
  let lb = ov('recap-loc-info');
  if (!lb) {
    lb = document.createElement('div'); lb.id = 'recap-loc-info'; lb.className = 'recap-loc-box';
    const oc = document.querySelector('#view-payment .order-card');
    if (oc) oc.appendChild(lb);
  }
  lb.innerHTML = `<strong style="font-size:12px;display:block;margin-bottom:4px">📍 Livraison à</strong>${locLabel}${CAT.desc ? `<br/><span style="color:#4A4A6A">${CAT.desc}</span>` : ''}`;

  if (window.showView) window.showView('payment');
  const bkPay = document.querySelector('#view-payment .back-btn');
  if (bkPay) bkPay.onclick = function() { if (window.showView) window.showView('delivery'); };
};

function setCatCard(active, t, c, s) {
  const card = ov('cg-card'); if (!card) return;
  card.classList.remove('on', 'off'); if (active) card.classList.add('on');
  ov('cg-t') && (ov('cg-t').textContent = t);
  ov('cg-c') && (ov('cg-c').textContent = c);
  ov('cg-s') && (ov('cg-s').textContent = s);
}

// Intercept openService — INCHANGÉ
const _os1 = window.openService;
window.openService = function(id) {
  if (CATALOGUE_GPS_SERVICES.includes(id)) {
    window._cartBarFn = () => {
      if (!Object.keys(window.cart || {}).length) return;
      buildCatDelivery(id);
      if (window.showView) window.showView('delivery');
    };
    _os1(id);
    setTimeout(() => { buildCatDelivery(id); }, 100);
    return;
  }
  if (id !== 'kits') window._cartBarFn = null;
  _os1(id);
};

// Intercept openRestaurant — INCHANGÉ
const _or = window.openRestaurant;
if (typeof _or === 'function') {
  window.openRestaurant = async function(rid, rnom, remo) {
    await _or(rid, rnom, remo);
    buildCatDelivery('restaurant');
    window._cartBarFn = () => {
      if (!Object.keys(window.cart || {}).length) return;
      buildCatDelivery('restaurant');
      if (window.showView) window.showView('delivery');
    };
  };
}

// ════════════════════════════════════════════════════════
// MODULE 2 — LIVRAISON & COURSE
// ════════════════════════════════════════════════════════
const LIV = {
  A: { lat: null, lng: null, label: '', address: '', placeId: '', mode: null },
  B: { lat: null, lng: null, label: '', address: '', placeId: '', mode: null },
  fare: 0, km: 0, colis: null
};

function openColis() {
  const el = makeOv('ov-colis');
  el.innerHTML = `<div class="loc-sh">
    <div class="loc-handle"></div>
    <div class="loc-hdr">
      <div class="loc-hico" style="background:linear-gradient(135deg,#FF7043,#E64A19)">📦</div>
      <div><div class="loc-htitle">Informations sur le colis</div><div class="loc-hsub">Quelques détails avant la localisation</div></div>
      <button class="loc-hclose" onclick="removeOv('ov-colis')">✕</button>
    </div>
    <div class="loc-body">
      <div class="loc-sl">Type de service *</div>
      <select id="liv-type" class="loc-sel">
        <option value="">— Choisir —</option>
        <option>🚀 Livraison express</option>
        <option>🛒 Courses personnalisées</option>
        <option>🏢 Livraison entreprise</option>
        <option>🍽️ Livraison de plats</option>
        <option>📦 Transport de colis</option>
        <option>🏃 Courses diverses</option>
      </select>
      <div class="loc-sl" style="margin-top:14px">Description du colis / de la course *</div>
      <textarea id="liv-cdesc" class="loc-ta" rows="3" placeholder="Ex : Colis fragile ~2 kg, documents urgents, courses marché…"></textarea>
      <div class="loc-sl" style="margin-top:14px">Contact destinataire <span style="font-weight:400;color:#9999BB;text-transform:none">(optionnel)</span></div>
      <input id="liv-contact" class="loc-inp" type="text" placeholder="Nom et numéro du destinataire"/>
      <button class="loc-btn" onclick="window._okColis()">Continuer → Localisation 📍</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
}

window._okColis = function() {
  const desc = ov('liv-cdesc')?.value.trim();
  if (!desc) { ov('liv-cdesc').style.borderColor = '#F5820A'; if (window.showToast) window.showToast('⚠️ Décrivez le colis ou la course', '#F5820A'); return; }
  LIV.colis = { type: ov('liv-type')?.value || '', desc, contact: ov('liv-contact')?.value.trim() || '' };
  removeOv('ov-colis');
  openLivSheet();
};

function openLivSheet() {
  LIV.A = { lat: null, lng: null, label: '', address: '', placeId: '', mode: null };
  LIV.B = { lat: null, lng: null, label: '', address: '', placeId: '', mode: null };
  LIV.fare = 0; LIV.km = 0;

  const el   = makeOv('ov-liv');
  const ctag = LIV.colis ? `<div style="background:#FFF3E0;border-radius:12px;padding:10px 14px;margin-bottom:6px;border:1px solid #FFE082;display:flex;align-items:flex-start;gap:10px">
    <span style="font-size:18px">📦</span>
    <div style="flex:1;font-size:11px;color:#E65100;line-height:1.5"><strong>${LIV.colis.type || 'Livraison'}</strong>${LIV.colis.desc ? ' · ' + LIV.colis.desc : ''}${LIV.colis.contact ? '<br/>👤 ' + LIV.colis.contact : ''}</div>
    <button onclick="removeOv('ov-liv');openColis()" style="background:none;border:1.5px solid #F5820A;color:#F5820A;border-radius:8px;padding:3px 9px;font-size:10px;font-weight:700;cursor:pointer;font-family:'Poppins',sans-serif;flex-shrink:0">Modifier</button>
  </div>` : '';

  function ptHTML(pt, color, title, sub) {
    const dotCls = color === 'green' ? 'loc-dg' : 'loc-dr';
    return `<div class="loc-pc" style="margin-top:8px">
      <div class="loc-ph"><div class="loc-dot ${dotCls}"></div><div><div class="loc-ptit">${title}</div><div class="loc-psub">${sub}</div></div></div>
      <div class="loc-gc" id="gc-${pt}">
        <div style="font-size:22px">📡</div>
        <div class="loc-gi"><div class="loc-gt" id="gt-${pt}">Localisation GPS</div><div class="loc-gc2" id="gc2-${pt}">Non détectée</div><div class="loc-gs" id="gs-${pt}">Appuyez pour détecter</div></div>
        <button class="loc-gbtn" id="gb-${pt}" onclick="window._livGPS('${pt}')">📍 Détecter</button>
      </div>
      <div class="loc-or">ou rechercher un lieu</div>
      ${makeSearchWidget(`lv-sf-wrap-${pt}`, `lv-sf-inp-${pt}`, `lv-sf-dd-${pt}`, 'Hôtel, carrefour, rue, quartier…')}
      <div id="lv-farecard-${pt}"></div>
      <div style="margin-top:10px">
        <label style="font-size:11px;font-weight:700;color:#4A4A6A;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:5px">Complément <span style="font-weight:400;color:#9999BB;text-transform:none">(optionnel)</span></label>
        <textarea id="gd-${pt}" class="loc-ta" rows="2" placeholder="Ex : Devant la pharmacie, portail rouge…"></textarea>
      </div>
    </div>`;
  }

  el.innerHTML = `<div class="loc-sh">
    <div class="loc-handle"></div>
    <div class="loc-hdr">
      <div class="loc-hico" style="background:linear-gradient(135deg,#FF7043,#E64A19)">🛵</div>
      <div><div class="loc-htitle">Livraison & Course</div><div class="loc-hsub">Définissez vos deux points</div></div>
      <button class="loc-hclose" onclick="removeOv('ov-liv')">✕</button>
    </div>
    <div class="loc-body">
      ${ctag}
      ${ptHTML('A', 'green', 'Point de collecte (départ)', "D'où doit-on récupérer ?")}
      <div style="text-align:center;font-size:22px;color:#C5C5D8;margin:4px 0">↕</div>
      ${ptHTML('B', 'red', 'Point de livraison (arrivée)', "Où doit-on déposer ?")}
      <div class="loc-fare" id="lv-fare" style="display:none">
        <div style="font-size:26px">📏</div>
        <div style="flex:1">
          <div style="font-size:10px;color:rgba(255,255,255,.65);text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">Distance & tarif</div>
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
            <span class="loc-fkm" id="lv-fkm">— km</span>
            <span class="loc-fp" id="lv-fp">— FCFA</span>
          </div>
          <div class="loc-fd" id="lv-fd"></div>
        </div>
      </div>
      <button class="loc-btn" id="lv-next" style="display:none" onclick="window._livNext()">Continuer → Paiement 💳</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
}

function _livSelectPlace(pt, lat, lng, name, address, placeId) {
  const btn  = ov('gb-' + pt); if (btn) { btn.innerHTML = '📍 Détecter'; btn.disabled = false; }
  const card = ov('gc-' + pt); if (card) { card.classList.remove('on'); card.classList.add('off'); }
  ov('gt-' + pt)  && (ov('gt-' + pt).textContent  = 'GPS non utilisé');
  ov('gc2-' + pt) && (ov('gc2-' + pt).textContent = '—');
  ov('gs-' + pt)  && (ov('gs-' + pt).textContent  = 'Lieu sélectionné via recherche');

  LIV[pt].lat = lat; LIV[pt].lng = lng; LIV[pt].label = name;
  LIV[pt].address = address; LIV[pt].placeId = placeId; LIV[pt].mode = 'place';

  const fcWrap = ov(`lv-farecard-${pt}`);
  if (fcWrap) fcWrap.innerHTML = `
    <div class="lsf-fare-card" style="margin-top:10px;font-size:12px">
      <div style="font-size:20px">📍</div>
      <div><div style="font-weight:700">${name}</div><div style="font-size:10px;opacity:.7">${address}</div></div>
    </div>`;

  calcLiv();
}

window._livGPS = function(pt) {
  window._lsfClear(`lv-sf-inp-${pt}`, `lv-sf-dd-${pt}`);
  const fcWrap = ov(`lv-farecard-${pt}`); if (fcWrap) fcWrap.innerHTML = '';
  LIV[pt].mode = 'gps';
  detectGPS(ov('gb-' + pt),
    async (la, lo) => {
      LIV[pt].lat = la; LIV[pt].lng = lo; LIV[pt].label = 'Position GPS'; LIV[pt].address = ''; LIV[pt].placeId = '';
      setPtCard(pt, true, 'Position détectée ✅', `${la.toFixed(5)}° N, ${lo.toFixed(5)}° E`, 'Calcul de la distance en cours…');
      if (LIV.A.lat && LIV.B.lat) {
        await calcLiv();
      } else {
        setPtCard(pt, true, 'Position détectée ✅', `${la.toFixed(5)}° N, ${lo.toFixed(5)}° E`, 'Position actuelle ✅');
      }
    },
    (e, la, lo) => {
      if (la === null) { if (window.showToast) window.showToast('⚠️ GPS refusé — recherchez un lieu', '#F5820A'); LIV[pt].mode = null; return; }
      if (window.showToast) window.showToast('⚠️ Accès GPS refusé — recherchez votre lieu dans la liste', '#F5820A');
      LIV[pt].mode = null;
    }
  );
};

function setPtCard(pt, active, t, c, s) {
  const card = ov('gc-' + pt); if (!card) return;
  card.classList.remove('on', 'off'); if (active) card.classList.add('on');
  ov('gt-' + pt).textContent = t; ov('gc2-' + pt).textContent = c; ov('gs-' + pt).textContent = s;
}

async function calcLiv() {
  if (!LIV.A.lat || !LIV.B.lat) return;
  const { km, durationText } = await roadDistance(LIV.A.lat, LIV.A.lng, LIV.B.lat, LIV.B.lng);
  const { fare, detail } = fmtFare(km);
  LIV.fare = fare; LIV.km = km;
  ov('lv-fkm').textContent = km.toFixed(1) + ' km';
  ov('lv-fp').textContent  = fmtMoney(fare);
  const durStr  = durationText ? ` · ~${durationText}` : '';
  const labelA  = LIV.A.address ? `${LIV.A.label} (${LIV.A.address})` : LIV.A.label;
  const labelB  = LIV.B.address ? `${LIV.B.label} (${LIV.B.address})` : LIV.B.label;
  ov('lv-fd').textContent = `${labelA} → ${labelB} · ${detail}${durStr}`;
  ov('lv-fare').style.display = 'flex';
  ov('lv-next').style.display = 'block';
  if (LIV.A.lat && LIV.A.mode === 'place') setPtCard('A', true, LIV.A.label, LIV.A.address, 'Lieu sélectionné ✅');
  if (LIV.B.lat && LIV.B.mode === 'place') setPtCard('B', true, LIV.B.label, LIV.B.address, 'Lieu sélectionné ✅');
}

window._livNext = async function() {
  if (!window._currentUser) { if (window.openAuthModal) window.openAuthModal('login'); return; }
  if (!LIV.A.lat || !LIV.B.lat) { if (window.showToast) window.showToast('⚠️ Définissez les deux points', '#F5820A'); return; }

  const descA = ov('gd-A')?.value.trim() || '';
  const descB = ov('gd-B')?.value.trim() || '';
  const btn   = ov('lv-next');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loc-spin"></span>Enregistrement…'; }

  try {
    const db = window._firestoreDb;
    const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const cu = window._currentUser;
    const ref = await addDoc(collection(db, 'commandes'), {
      service: 'livraison', serviceName: 'Livraison & Course', statut: 'En attente',
      colis: LIV.colis || null,
      pointA: {
        positionType: LIV.A.mode, lat: LIV.A.lat, lng: LIV.A.lng,
        placeName: LIV.A.label, placeAddress: LIV.A.address, placeId: LIV.A.placeId,
        desc: descA
      },
      pointB: {
        positionType: LIV.B.mode, lat: LIV.B.lat, lng: LIV.B.lng,
        placeName: LIV.B.label, placeAddress: LIV.B.address, placeId: LIV.B.placeId,
        desc: descB
      },
      distanceKm: parseFloat(LIV.km.toFixed(2)), fraisLivraison: LIV.fare,
      modePaiement: 'livraison', paygateStatus: 'non_configure',
      uid: cu.uid, clientNom: cu.nom || '', clientPrenom: cu.prenom || '',
      clientGenre: cu.genre || '', phone: cu.phone || '', clientVille: cu.ville || '',
      createdAt: serverTimestamp(),
    });
    const sm = ov('succ-msg');
    if (sm) sm.innerHTML = `Commande de livraison confirmée !<br/>Référence : <strong>#${ref.id.slice(0,8).toUpperCase()}</strong><br/>🛵 Frais : ${fmtMoney(LIV.fare)} · ${LIV.km.toFixed(1)} km<br/>💵 Paiement à la livraison — notre agent vous contacte bientôt.<br/><small style="color:var(--light)">Contact : ${cu.phone || ''}</small>`;
    removeOv('ov-liv');
    if (window.showSuccessView) window.showSuccessView();
  } catch (e) {
    console.error('[Livraison]', e);
    if (window.showToast) window.showToast('❌ Erreur : ' + e.message, '#C62828');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Continuer → Paiement 💳'; }
  }
};

// ════════════════════════════════════════════════════════
// MODULE 3 — MAINTENANCE / DÉPANNAGE
// ════════════════════════════════════════════════════════
const MT = [
  { id: 'plomberie',     emoji: '🔧', label: 'Plomberie' },
  { id: 'electricite',   emoji: '⚡', label: 'Électricité' },
  { id: 'menuiserie',    emoji: '🪚', label: 'Menuiserie' },
  { id: 'peinture',      emoji: '🎨', label: 'Peinture' },
  { id: 'climatisation', emoji: '❄️', label: 'Climatisation' },
  { id: 'informatique',  emoji: '💻', label: 'Informatique' },
  { id: 'autre',         emoji: '🛠️', label: 'Autre dépannage' },
];

function openMaintModal() {
  window._mGps = null;
  const el = makeOv('ov-maint');
  el.innerHTML = `<div class="loc-sh">
    <div class="loc-handle"></div>
    <div class="loc-hdr">
      <div class="loc-hico" style="background:linear-gradient(135deg,#EF5350,#C62828)">🔧</div>
      <div><div class="loc-htitle">Dépannage</div><div class="loc-hsub">Type + votre position</div></div>
      <button class="loc-hclose" onclick="removeOv('ov-maint')">✕</button>
    </div>
    <div class="loc-body">
      <div class="loc-sl">Type d'intervention *</div>
      <select id="mt-type" class="loc-sel">
        <option value="">— Choisir —</option>
        ${MT.map(t => `<option value="${t.id}">${t.emoji} ${t.label}</option>`).join('')}
      </select>
      <div class="loc-sl" style="margin-top:14px">Description du problème *</div>
      <textarea id="mt-desc" class="loc-ta" rows="4" placeholder="Décrivez le problème : panne, fuite, bruit suspect…"></textarea>
      <div class="loc-sl" style="margin-top:14px">Votre position (lieu d'intervention)</div>
      <div class="loc-gc" id="mg-card">
        <div style="font-size:22px">📡</div>
        <div class="loc-gi">
          <div class="loc-gt" id="mg-t">Localisation GPS</div>
          <div class="loc-gc2" id="mg-c">Non détectée</div>
          <div class="loc-gs" id="mg-s">Appuyez pour détecter votre position</div>
        </div>
        <button class="loc-gbtn" id="mg-btn" onclick="window._mGPS()">📍 Détecter</button>
      </div>
      <div class="loc-or">ou rechercher un lieu</div>
      ${makeSearchWidget('mg-sf-wrap', 'mg-sf-inp', 'mg-sf-dd', 'Quartier, hôtel, carrefour…')}
      <div id="mg-farecard-wrap"></div>
      <div class="loc-fare" id="mg-fare" style="display:none;margin-top:14px">
        <div style="font-size:26px">📏</div>
        <div style="flex:1">
          <div style="font-size:10px;color:rgba(255,255,255,.65);text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">Frais de déplacement estimés</div>
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
            <span class="loc-fkm" id="mg-fkm">— km</span>
            <span class="loc-fp" id="mg-fp">— FCFA</span>
          </div>
          <div class="loc-fd" id="mg-fd"></div>
        </div>
      </div>
      <button class="loc-btn" id="mt-sub" onclick="window._mSubmit()">📨 Envoyer ma demande de dépannage</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
}

function _maintSelectPlace(lat, lng, name, address, placeId) {
  const btn  = ov('mg-btn'); if (btn) { btn.innerHTML = '📍 Détecter'; btn.disabled = false; }
  const card = ov('mg-card'); if (card) { card.classList.remove('on'); card.classList.add('off'); }
  ov('mg-t') && (ov('mg-t').textContent = 'GPS non utilisé');
  ov('mg-c') && (ov('mg-c').textContent = '—');
  ov('mg-s') && (ov('mg-s').textContent = 'Lieu sélectionné');

  const fcWrap = ov('mg-farecard-wrap');
  if (fcWrap) fcWrap.innerHTML = `
    <div class="lsf-fare-card" style="margin-top:10px">
      <div style="font-size:20px">📍</div>
      <div><div style="font-weight:700">${name}</div><div style="font-size:10px;opacity:.7">${address}</div>
      <div style="font-size:10px;opacity:.6;margin-top:4px">⏳ Calcul des frais de déplacement…</div></div>
    </div>`;

  roadDistance(lat, lng, OMNI_DEPOT.lat, OMNI_DEPOT.lng).then(({ km, durationText }) => {
    const { fare, detail } = fmtFare(km);
    window._mGps = { lat, lng, km, fare, label: name, address, placeId };
    showMF(km, fare, detail);
    if (fcWrap) fcWrap.innerHTML = `
      <div class="lsf-fare-card">
        <div style="font-size:20px">🔧</div>
        <div class="lsf-fare-zone">
          <div class="lsf-fare-qname">${name}</div>
          <div class="lsf-fare-commune">${address}</div>
          <div class="lsf-fare-price">${fmtMoney(fare)}</div>
          <div class="lsf-fare-detail">${detail}</div>
        </div>
      </div>`;
  });
}

window._mGPS = function() {
  window._lsfClear('mg-sf-inp', 'mg-sf-dd');
  const fcWrap = ov('mg-farecard-wrap'); if (fcWrap) fcWrap.innerHTML = '';
  detectGPS(ov('mg-btn'),
    async (la, lo) => {
      const card = ov('mg-card'); if (card) { card.classList.remove('off'); card.classList.add('on'); }
      ov('mg-t').textContent = 'Position détectée ✅';
      ov('mg-c').textContent = `${la.toFixed(5)}° N, ${lo.toFixed(5)}° E`;
      ov('mg-s').textContent = 'Calcul de la distance en cours…';
      const { km, durationText } = await roadDistance(la, lo, OMNI_DEPOT.lat, OMNI_DEPOT.lng);
      const { fare, detail } = fmtFare(km);
      window._mGps = { lat: la, lng: lo, km, fare };
      const sub = durationText ? `Votre position · ~${durationText} de notre base` : "Votre position d'intervention";
      ov('mg-s').textContent = sub;
      showMF(km, fare, detail);
    },
    (e, la, lo) => {
      if (la === null) { if (window.showToast) window.showToast('⚠️ GPS refusé — recherchez un lieu', '#F5820A'); return; }
      if (window.showToast) window.showToast('⚠️ Accès GPS refusé — recherchez votre lieu', '#F5820A');
    }
  );
};

function showMF(km, fare, detail) {
  ov('mg-fkm').textContent = km.toFixed(1) + ' km';
  ov('mg-fp').textContent  = fmtMoney(fare);
  ov('mg-fd').textContent  = 'Frais déplacement · ' + detail;
  ov('mg-fare').style.display = 'flex';
}

window._mSubmit = async function() {
  const cu = window._currentUser;
  if (!cu) { if (window.openAuthModal) window.openAuthModal('login'); return; }
  const tid  = ov('mt-type')?.value;
  const desc = ov('mt-desc')?.value.trim();
  if (!tid)  { ov('mt-type').style.borderColor = '#F5820A'; if (window.showToast) window.showToast('⚠️ Choisissez le type', '#F5820A'); return; }
  if (!desc) { ov('mt-desc').style.borderColor = '#F5820A'; if (window.showToast) window.showToast('⚠️ Décrivez le problème', '#F5820A'); return; }
  const found = MT.find(t => t.id === tid);
  const tl = found?.label || tid, te = found?.emoji || '🔧', g = window._mGps;
  const btn = ov('mt-sub'); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loc-spin"></span>Envoi…'; }
  try {
    const db = window._firestoreDb;
    const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const ref = await addDoc(collection(db, 'commandes'), {
      service: 'maintenance', serviceName: `Dépannage — ${tl}`, statut: 'En attente',
      typeIntervention: tl, typeEmoji: te, besoin: desc,
      modePaiement: 'livraison', paygateStatus: 'non_configure',
      positionType: g ? (g.placeId ? 'place' : 'GPS') : 'non_definie',
      clientLat: g?.lat || null, clientLng: g?.lng || null,
      placeName: g?.label || '', placeAddress: g?.address || '', placeId: g?.placeId || '',
      distanceKm: g ? parseFloat(g.km.toFixed(2)) : null, fraisDeplacement: g?.fare || 0,
      refLat: OMNI_DEPOT.lat, refLng: OMNI_DEPOT.lng, refLabel: 'Point de référence OmniService',
      uid: cu.uid, clientNom: cu.nom || '', clientPrenom: cu.prenom || '',
      clientGenre: cu.genre || '', phone: cu.phone || '', clientVille: cu.ville || '',
      createdAt: serverTimestamp(),
    });
    const sm = ov('succ-msg');
    if (sm) sm.innerHTML = `Demande <strong style="color:var(--blue)">${te} ${tl}</strong> envoyée !<br/>Référence : <strong>#${ref.id.slice(0,8).toUpperCase()}</strong><br/>${g ? `📍 Distance depuis notre base : ${g.km.toFixed(1)} km<br/>🚗 Frais estimés : ${fmtMoney(g.fare)}<br/>` : ''}Notre équipe vous contactera très bientôt.<br/><small style="color:var(--light)">Contact : ${cu.phone || ''}</small>`;
    window._mGps = null; removeOv('ov-maint');
    if (window.showSuccessView) window.showSuccessView();
  } catch (e) {
    console.error('[Maintenance]', e);
    if (window.showToast) window.showToast('❌ Erreur : ' + e.message, '#C62828');
    if (btn) { btn.disabled = false; btn.innerHTML = '📨 Envoyer ma demande de dépannage'; }
  }
};

// Intercept openService maintenance — INCHANGÉ
const _os3 = window.openService;
window.openService = function(id) {
  if (id === 'maintenance') {
    if (!window._currentUser) { if (window.openAuthModal) window.openAuthModal('login'); if (window.showToast) window.showToast('⚠️ Connectez-vous', '#F5820A'); return; }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
    document.getElementById('p-services')?.classList.add('on');
    document.querySelectorAll('.btab').forEach(b => b.classList.remove('on'));
    document.getElementById('t-services')?.classList.add('on');
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('on'));
    document.getElementById('nl-services')?.classList.add('on');
    openMaintModal(); return;
  }
  _os3(id);
};

// ════════════════════════════════════════════════════════
// MODULE 4 — KITS & PACKS
// ════════════════════════════════════════════════════════
function openKitLocModal() {
  const cu = window._currentUser;
  if (!cu) { if (window.openAuthModal) window.openAuthModal('login'); return; }
  const kit = window.currentKit;
  if (!kit) { if (window.showToast) window.showToast('⚠️ Kit non sélectionné', '#F5820A'); return; }

  window._kitGps = null;
  removeOv('ov-kit-loc');
  const el = makeOv('ov-kit-loc');

  el.innerHTML = `<div class="loc-sh">
    <div class="loc-handle"></div>
    <div class="loc-hdr">
      <div class="loc-hico" style="background:linear-gradient(135deg,#26A69A,#00796B)">🛒</div>
      <div>
        <div class="loc-htitle">Livraison — ${kit.nom}</div>
        <div class="loc-hsub">Confirmer votre position</div>
      </div>
      <button class="loc-hclose" onclick="removeOv('ov-kit-loc')">✕</button>
    </div>
    <div class="loc-body">
      <div class="loc-gc" id="kl-card">
        <div style="font-size:22px">📡</div>
        <div class="loc-gi">
          <div class="loc-gt" id="kl-t">Localisation GPS</div>
          <div class="loc-gc2" id="kl-c">Non détectée</div>
          <div class="loc-gs" id="kl-s">Appuyez pour détecter votre position</div>
        </div>
        <button class="loc-gbtn" id="kl-btn" onclick="window._kitGPS()">📍 Détecter</button>
      </div>
      <div class="loc-fare" id="kl-fare" style="display:none;margin-top:14px">
        <div style="font-size:24px">🛵</div>
        <div style="flex:1">
          <div style="font-size:10px;color:rgba(255,255,255,.65);text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">Frais de livraison estimés</div>
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
            <span class="loc-fkm" id="kl-fkm">— km</span>
            <span class="loc-fp" id="kl-fp">— FCFA</span>
          </div>
          <div class="loc-fd" id="kl-fd"></div>
        </div>
      </div>
      <div class="loc-or">ou rechercher un lieu</div>
      ${makeSearchWidget('kl-sf-wrap', 'kl-sf-inp', 'kl-sf-dd', 'Hôtel, carrefour, quartier…')}
      <div id="kl-farecard-wrap"></div>
      <div class="loc-precision-box" style="margin-top:14px">
        <div class="loc-precision-title">
          📌 Adresse précise
          <span class="loc-precision-sub">(optionnel)</span>
        </div>
        <textarea id="kl-desc" class="loc-ta" rows="2"
          placeholder="Ex : Derrière le marché, portail bleu, 2ème maison…"></textarea>
      </div>
      <div style="margin-top:12px">
        <label style="font-size:11px;font-weight:700;color:#4A4A6A;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px">
          Notes supplémentaires <span style="font-weight:400;color:#9999BB;text-transform:none">(optionnel)</span>
        </label>
        <textarea id="kl-notes" class="loc-ta" rows="2"
          placeholder="Informations complémentaires pour la livraison…"></textarea>
      </div>
      <button class="loc-btn" id="kl-sub" onclick="window._kitConfirm()">🛒 Confirmer la commande</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
}
window.openKitLocModal = openKitLocModal;

function _kitSelectPlace(lat, lng, name, address, placeId) {
  const card = ov('kl-card'); if (card) { card.classList.remove('on'); card.classList.add('off'); }
  ov('kl-t') && (ov('kl-t').textContent = 'GPS non utilisé');
  ov('kl-c') && (ov('kl-c').textContent = '—');
  ov('kl-s') && (ov('kl-s').textContent = 'Lieu sélectionné via recherche');
  ov('kl-fare') && (ov('kl-fare').style.display = 'none');

  const fcWrap = ov('kl-farecard-wrap');
  if (fcWrap) fcWrap.innerHTML = `
    <div class="lsf-fare-card" style="margin-top:10px">
      <div style="font-size:20px">📍</div>
      <div><div style="font-weight:700">${name}</div><div style="font-size:10px;opacity:.7">${address}</div>
      <div style="font-size:10px;opacity:.6;margin-top:4px">⏳ Calcul des frais…</div></div>
    </div>`;

  roadDistance(lat, lng, OMNI_DEPOT.lat, OMNI_DEPOT.lng).then(({ km, durationText }) => {
    const { fare, detail } = fmtFare(km);
    window._kitGps = { lat, lng, km, fare, label: name, address, placeId };
    ov('kl-fkm') && (ov('kl-fkm').textContent = km.toFixed(1) + ' km');
    ov('kl-fp')  && (ov('kl-fp').textContent  = fmtMoney(fare));
    ov('kl-fd')  && (ov('kl-fd').textContent  = detail);
    if (fcWrap) fcWrap.innerHTML = `
      <div class="lsf-fare-card">
        <div style="font-size:26px">🛵</div>
        <div class="lsf-fare-zone">
          <div class="lsf-fare-qname">${name}</div>
          <div class="lsf-fare-commune">${address}</div>
          <div class="lsf-fare-price">${fmtMoney(fare)}</div>
          <div class="lsf-fare-detail">${detail}</div>
        </div>
        <span class="lsf-selected-badge">✅ Sélectionné</span>
      </div>`;
  });
}

window._kitGPS = function() {
  window._lsfClear('kl-sf-inp', 'kl-sf-dd');
  const fcWrap = ov('kl-farecard-wrap'); if (fcWrap) fcWrap.innerHTML = '';
  detectGPS(ov('kl-btn'),
    async (la, lo) => {
      window._kitGps = { lat: la, lng: lo };
      const card = ov('kl-card');
      if (card) { card.classList.remove('off'); card.classList.add('on'); }
      ov('kl-t').textContent = 'Position détectée ✅';
      ov('kl-c').textContent = `${la.toFixed(5)}° N, ${lo.toFixed(5)}° E`;
      ov('kl-s').textContent = 'Calcul de la distance en cours…';
      const { km, durationText } = await roadDistance(la, lo, OMNI_DEPOT.lat, OMNI_DEPOT.lng);
      const { fare, detail } = fmtFare(km);
      window._kitGps.km = km; window._kitGps.fare = fare;
      const sub = durationText ? `~${durationText} de notre dépôt` : 'Votre position actuelle';
      ov('kl-s').textContent = sub;
      ov('kl-fkm').textContent = km.toFixed(1) + ' km';
      ov('kl-fp').textContent  = fmtMoney(fare);
      ov('kl-fd').textContent  = detail;
      const fc = ov('kl-fare'); if (fc) fc.style.display = 'flex';
    },
    (e, la, lo) => {
      if (la === null) { if (window.showToast) window.showToast('⚠️ GPS refusé — recherchez votre lieu', '#F5820A'); return; }
      if (window.showToast) window.showToast('⚠️ Accès GPS refusé — recherchez votre lieu dans la liste', '#F5820A');
    }
  );
};

window._kitConfirm = async function() {
  const cu  = window._currentUser;
  if (!cu)  { if (window.openAuthModal) window.openAuthModal('login'); return; }
  const kit = window.currentKit;
  if (!kit) { if (window.showToast) window.showToast('⚠️ Kit non trouvé', '#F5820A'); return; }

  const desc  = ov('kl-desc')?.value.trim()  || '';
  const notes = ov('kl-notes')?.value.trim() || '';
  const g = window._kitGps;

  const btn = ov('kl-sub');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loc-spin"></span>Enregistrement…'; }

  try {
    const db = window._firestoreDb;
    const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

    const cartItems = Object.values(window.cart || {});
    const subTotal  = cartItems.reduce((s, a) => s + a.price * a.qty, 0);
    const frais     = g ? g.fare : 0;
    const total     = subTotal + frais;
    const items     = cartItems.map(a => ({ id: a.id, name: a.name, price: a.price, qty: a.qty }));

    // Payload enrichi : placeName + placeAddress + placeId
    const posData = g
      ? {
          positionType   : g.placeId ? 'place' : 'GPS',
          clientLat      : g.lat,
          clientLng      : g.lng,
          placeName      : g.label    || '',
          placeAddress   : g.address  || '',
          placeId        : g.placeId  || '',
          distanceKm     : parseFloat(g.km.toFixed(2)),
          fraisLivraison : g.fare,
          positionDesc   : desc,
        }
      : { positionType: 'description', positionDesc: desc };

    const ref = await addDoc(collection(db, 'commandes'), {
      service: 'kits', serviceName: `Kits/PACKS — ${kit.nom}`,
      statut: 'En attente', kitId: kit.id, kitNom: kit.nom,
      articles: items, total, adresse: desc, notes,
      modePaiement: 'livraison', paygateStatus: 'non_configure',
      uid: cu.uid, clientNom: cu.nom || '', clientPrenom: cu.prenom || '',
      clientGenre: cu.genre || '', phone: cu.phone || '', clientVille: cu.ville || '',
      createdAt: serverTimestamp(), ...posData,
    });

    const sm = ov('succ-msg');
    if (sm) sm.innerHTML =
      `Commande <strong style="color:var(--blue)">${kit.nom}</strong> confirmée !<br/>
       Référence : <strong>#${ref.id.slice(0,8).toUpperCase()}</strong><br/>
       ${g ? `🛵 Frais de livraison : ${fmtMoney(g.fare)}<br/>` : ''}
       💵 Paiement à la livraison — notre agent vous contacte bientôt.<br/>
       <small style="color:var(--light)">Contact : ${cu.phone || ''}</small>`;

    window._kitGps = null;
    window.cart = {};
    if (window.updateCartBar) window.updateCartBar();
    removeOv('ov-kit-loc');
    if (window.showSuccessView) window.showSuccessView();

  } catch (e) {
    console.error('[KitLoc]', e);
    if (window.showToast) window.showToast('❌ Erreur : ' + e.message, '#C62828');
    if (btn) { btn.disabled = false; btn.innerHTML = '🛒 Confirmer la commande'; }
  }
};

// ════════════════════════════════════════
// EXPOSER GLOBALS — INCHANGÉ
// ════════════════════════════════════════
window.removeOv     = removeOv;
window.openColis    = openColis;
window.openLivSheet = openLivSheet;

console.log('[OmniService] localisation-module.js v5 ✅ — Full Places Autocomplete Google Maps · Lomé TG');
} // fin initLocalisationModule
