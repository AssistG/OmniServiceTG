// netlify/functions/paygate.js
// Proxy sécurisé entre OmniService TG et paygateglobal.com
// API v1 — doc officielle : https://pub.dev/packages/flutter_paygateglobal

const PAYGATE_TOKEN = process.env.PAYGATE_TOKEN || 'b8217d22-5b2f-4a6b-a231-fc7dc086326f';
const PAYGATE_BASE  = 'https://paygateglobal.com';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { action, ...params } = JSON.parse(event.body || '{}');

    // ── Initier un paiement ──
    if (action === 'pay') {
      const { phone, amount, description, network } = params;
      if (!phone || !amount || !network) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Paramètres manquants: phone, amount, network requis' }),
        };
      }

      // provider : "T-Money" (Togocom) ou "Moov Money" (Moov Africa)
      const provider   = network === 1 ? 'T-Money' : 'Moov Money';
      const phoneClean = phone.replace(/\D/g, '');
      // Garder les 8 derniers chiffres (retirer indicatif +228 si présent)
      const phoneFinal = phoneClean.length > 8 ? phoneClean.slice(-8) : phoneClean;
      const identifier = 'OMN-' + Date.now();

      const payload = {
        token:        PAYGATE_TOKEN,
        phone_number: phoneFinal,
        amount:       Math.round(amount),
        description:  description || 'Commande OmniService TG',
        provider:     provider,
        identifier:   identifier,
      };

      console.log('[PayGate] Payload:', JSON.stringify(payload));

      const res     = await fetch(`${PAYGATE_BASE}/api/v1/pay`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const rawText = await res.text();
      console.log('[PayGate] Réponse brute:', rawText);

      let data;
      try { data = JSON.parse(rawText); } catch(e) { data = { raw: rawText }; }

      // Renvoyer la réponse + l'identifier pour le suivi de statut
      return { statusCode: 200, headers, body: JSON.stringify({ ...data, _identifier: identifier }) };
    }

    // ── Vérifier le statut ──
    if (action === 'status') {
      const { tx_reference, identifier } = params;

      let url;
      if (tx_reference) {
        url = `${PAYGATE_BASE}/api/v1/status?token=${encodeURIComponent(PAYGATE_TOKEN)}&tx_reference=${encodeURIComponent(tx_reference)}`;
      } else if (identifier) {
        url = `${PAYGATE_BASE}/api/v1/status?token=${encodeURIComponent(PAYGATE_TOKEN)}&identifier=${encodeURIComponent(identifier)}`;
      } else {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'tx_reference ou identifier requis' }) };
      }

      const res  = await fetch(url);
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Action inconnue' }) };

  } catch (err) {
    console.error('[paygate proxy] Erreur:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erreur serveur : ' + err.message }),
    };
  }
};
