// netlify/functions/paygate.js
// Proxy sécurisé entre OmniService TG et paygateglobal.com
// Evite le blocage CORS navigateur + masque le token côté serveur

const PAYGATE_TOKEN = process.env.PAYGATE_TOKEN || 'b8217d22-5b2f-4a6b-a231-fc7dc086326f';
const PAYGATE_BASE  = 'https://paygateglobal.com/api/v1';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  'https://omniservice.tg',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { action, ...params } = JSON.parse(event.body || '{}');

    // ── Initier un paiement ──
    if (action === 'pay') {
      const { phone, amount, description, network } = params;
      if (!phone || !amount || !network) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Paramètres manquants' }) };
      }

      const res = await fetch(`${PAYGATE_BASE}/pay`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token:       PAYGATE_TOKEN,
          phone:       phone.replace(/\D/g, ''),
          amount:      Math.round(amount),
          description: description || 'Commande OmniService TG',
          network:     network, // 1 = T-Money, 2 = Flooz
        }),
      });

      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // ── Vérifier le statut ──
    if (action === 'status') {
      const { transaction_id } = params;
      if (!transaction_id) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'transaction_id manquant' }) };
      }

      const res = await fetch(
        `${PAYGATE_BASE}/status?token=${encodeURIComponent(PAYGATE_TOKEN)}&transaction_id=${encodeURIComponent(transaction_id)}`
      );
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Action inconnue' }) };

  } catch (err) {
    console.error('[paygate proxy]', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erreur serveur : ' + err.message }),
    };
  }
};
