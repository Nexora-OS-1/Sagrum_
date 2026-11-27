const config = window.SAGRUM_SUPABASE_CONFIG || {};
const statusElement = document.getElementById('paymentStatus');
const paymentApi = config.url ? config.url + '/functions/v1/payment-api' : '';

function setStatus(message, isError = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle('is-error', isError);
}

async function paymentRequest(path, body) {
  if (!paymentApi || !config.publishableKey || config.publishableKey.startsWith('PASTE_')) {
    throw new Error('Platobná služba ešte nie je pripojená k Supabase.');
  }
  const response = await fetch(paymentApi + '/' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.publishableKey,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.detail || 'Platbu sa nepodarilo spustiť.');
  return result;
}

async function startPayment(provider) {
  const button = document.getElementById(provider === 'stripe' ? 'cardPayment' : 'paypalPayment');
  if (button) button.disabled = true;
  setStatus('Pripravujem bezpečný testovací checkout…');
  try {
    const result = await paymentRequest('api/' + provider + '/create', { service_id: 'test_service' });
    const approvalUrl = provider === 'stripe' ? result.url : result.approval_url;
    if (!approvalUrl || !/^https:\/\//i.test(approvalUrl)) {
      throw new Error('Platobná brána neposkytla bezpečný odkaz.');
    }
    window.location.assign(approvalUrl);
  } catch (error) {
    setStatus(error.message || 'Platbu sa nepodarilo spustiť.', true);
    if (button) button.disabled = false;
  }
}

async function handleReturn() {
  const query = new URLSearchParams(window.location.search);
  if (query.get('payment') === 'cancelled') {
    setStatus('Platba bola zrušená. Nebola zaúčtovaná.');
    return;
  }
  if (query.get('payment') === 'success') {
    const sessionId = query.get('session_id');
    if (!sessionId) {
      setStatus('Stripe nevrátil číslo objednávky.', true);
      return;
    }
    setStatus('Overujem výsledok testovacej platby…');
    try {
      const response = await fetch(
        paymentApi + '/api/stripe/status/' + encodeURIComponent(sessionId),
        { headers: { apikey: config.publishableKey } },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'Stav platby sa nepodarilo overiť.');
      setStatus(result.paid ? 'Testovacia platba bola úspešná.' : 'Platba ešte nie je potvrdená.');
    } catch (error) {
      setStatus(error.message || 'Stav platby sa nepodarilo overiť.', true);
    }
    return;
  }

  const paypalOrderId = query.get('token');
  if (query.get('provider') === 'paypal' && paypalOrderId) {
    setStatus('Dokončujem testovaciu PayPal platbu…');
    try {
      const result = await paymentRequest('api/paypal/capture', { order_id: paypalOrderId });
      setStatus(result.paid ? 'Testovacia platba cez PayPal bola úspešná.' : 'Platba nebola potvrdená.');
    } catch (error) {
      setStatus(error.message || 'PayPal platbu sa nepodarilo dokončiť.', true);
    }
  }
}

document.getElementById('cardPayment')?.addEventListener('click', () => startPayment('stripe'));
document.getElementById('paypalPayment')?.addEventListener('click', () => startPayment('paypal'));
handleReturn();
