// netlify/functions/paygate.js
// Proxy PayGate Global — basé sur le guide officiel paygateglobal.com/guide
// ══════════════════════════════════════════════════════════════════════════
// MÉTHODE 1 — POST https://paygateglobal.com/api/v1/pay
//   Params : auth_token, phone_number, amount, description, identifier, network
//   network : "FLOOZ" ou "TMONEY" (valeurs exactes du guide)
//   Réponse : { tx_reference, status }
//   status init : 0=enregistré, 2=auth_token invalide, 4=params invalides, 6=doublon
//
// VÉRIF STATUT — POST https://paygateglobal.com/api/v1/status
//   Params : auth_token, tx_reference
//   Réponse : { tx_reference, identifier, payment_reference, status, datetime, payment_method }
//   status paiement : 0=succès, 2=en cours, 4=expiré, 6=annulé

const PAYGATE_TOKEN = process.env.PAYGATE_TOKEN || 'b8217d22-5b2f-4a6b-a231-fc7dc086326f';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { action, ...params } = JSON.parse(event.body || '{}');

    // ── Initier un paiement (Méthode 1) ──
    if (action === 'pay') {
      const { phone, amount, description, network } = params;
      if (!phone || !amount || !network) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Paramètres manquants: phone, amount, network requis' }),
        };
      }

      // network: 1 = TMONEY, 2 = FLOOZ  →  valeurs API : "TMONEY" ou "FLOOZ"
      const networkStr = network === 1 ? 'TMONEY' : 'FLOOZ';

      // Nettoyer le numéro : garder les 8 derniers chiffres (retirer +228 ou 228)
      const phoneClean = phone.replace(/\D/g, '');
      const phoneFinal = phoneClean.length > 8 ? phoneClean.slice(-8) : phoneClean;

      // Identifiant unique pour cette transaction
      const identifier = 'OMN-' + Date.now();

      const payload = {
        auth_token:   PAYGATE_TOKEN,   // ← auth_token (pas "token")
        phone_number: phoneFinal,
        amount:       Math.round(amount),
        description:  description || 'Commande OmniService TG',
        identifier:   identifier,
        network:      networkStr,      // ← "TMONEY" ou "FLOOZ"
      };

      console.log('[PayGate] POST /api/v1/pay :', JSON.stringify(payload));

      const res = await fetch('https://paygateglobal.com/api/v1/pay', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const rawText = await res.text();
      console.log('[PayGate] Réponse brute:', rawText);

      let data;
      try { data = JSON.parse(rawText); }
      catch(e) { data = { raw: rawText, status: -1 }; }

      // Renvoyer + conserver l'identifier pour suivi de statut
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ...data, _identifier: identifier }),
      };
    }

    // ── Vérifier le statut d'une transaction ──
    if (action === 'status') {
      const { tx_reference } = params;
      if (!tx_reference) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'tx_reference requis' }),
        };
      }

      const payload = {
        auth_token:   PAYGATE_TOKEN,
        tx_reference: tx_reference,
      };

      console.log('[PayGate] POST /api/v1/status :', JSON.stringify(payload));

      const res  = await fetch('https://paygateglobal.com/api/v1/status', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Action inconnue. Utilisez: pay | status' }),
    };

  } catch (err) {
    console.error('[paygate proxy] Erreur:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erreur serveur : ' + err.message }),
    };
  }
};
