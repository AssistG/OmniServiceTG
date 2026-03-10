// ══════════════════════════════════════════════════════
// Cloudflare Pages Function — /api/paygate
// Proxy sécurisé vers paygateglobal.com
// Fichier à placer dans : functions/api/paygate.js
// ══════════════════════════════════════════════════════

const PAYGATE_TOKEN  = 'b8217d22-5b2f-4a6b-a231-fc7dc086326f';
const PAYGATE_BASE   = 'https://paygateglobal.com/api/v1';

// Headers CORS — autorise omniservice.tg et les sous-domaines Cloudflare Pages
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request } = context;

  // ── Preflight CORS ──
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // ── Seules les requêtes POST sont acceptées ──
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps JSON invalide' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const { action } = body;

  try {
    let pgResponse;

    // ════════════════════════════════
    // ACTION : pay — Initier un paiement
    // ════════════════════════════════
    if (action === 'pay') {
      const { phone, amount, description, network } = body;

      if (!phone || !amount || !network) {
        return new Response(JSON.stringify({ error: 'Paramètres manquants : phone, amount, network requis' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // network : 1 = T-Money (Togocel), 2 = Flooz (Moov Africa)
      pgResponse = await fetch(`${PAYGATE_BASE}/pay`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token:       PAYGATE_TOKEN,
          phone_number: phone,
          amount:      Math.round(amount),
          description: description || 'Commande OmniService TG',
          network:     network,      // 1 = TMoney, 2 = Flooz
        }),
      });

    // ════════════════════════════════
    // ACTION : status — Vérifier le statut
    // ════════════════════════════════
    } else if (action === 'status') {
      const { transaction_id } = body;

      if (!transaction_id) {
        return new Response(JSON.stringify({ error: 'transaction_id manquant' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      pgResponse = await fetch(`${PAYGATE_BASE}/status`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token:          PAYGATE_TOKEN,
          transaction_id: transaction_id,
        }),
      });

    } else {
      return new Response(JSON.stringify({ error: 'Action inconnue. Utilisez "pay" ou "status".' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Retourner la réponse PayGate au client ──
    const pgData = await pgResponse.json();
    return new Response(JSON.stringify(pgData), {
      status:  pgResponse.ok ? 200 : pgResponse.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[paygate worker] Erreur:', err.message);
    return new Response(JSON.stringify({ error: 'Erreur serveur : ' + err.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}
