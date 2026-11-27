import { createClient } from "npm:@supabase/supabase-js@2";

const SERVICE = {
  id: "test_service",
  name: "Sagrum_ - Testovacia objednávka",
  amountCents: 100,
  currency: "EUR",
} as const;

class PaymentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function siteUrl(): URL {
  const value = Deno.env.get("SITE_URL")?.trim();
  if (!value) throw new PaymentError("Platobná stránka ešte nie je nakonfigurovaná.", 503);
  let url: URL;
  try {
    url = new URL(value.endsWith("/") ? value : value + "/");
  } catch {
    throw new PaymentError("SITE_URL nie je platná adresa.", 503);
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new PaymentError("SITE_URL musí používať HTTPS.", 503);
  }
  return url;
}

function corsHeaders(origin: string | null): HeadersInit {
  const configured = Deno.env.get("SITE_URL")?.trim();
  let allowedOrigin = "*";
  if (configured) {
    try {
      allowedOrigin = new URL(configured).origin;
    } catch {
      allowedOrigin = "null";
    }
  }
  return {
    "Access-Control-Allow-Origin": origin && origin === allowedOrigin ? origin : allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request.headers.get("origin")),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const keyMap = Deno.env.get("SUPABASE_SECRET_KEYS");
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (keyMap) {
    try {
      const secrets = JSON.parse(keyMap);
      key = secrets.default ?? key;
    } catch {
      throw new PaymentError("Supabase server credentials are unavailable.", 503);
    }
  }
  if (!url || !key) throw new PaymentError("Supabase server credentials are unavailable.", 503);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getService(id: unknown) {
  if (id !== SERVICE.id) throw new PaymentError("Testovacia služba neexistuje.", 404);
  return SERVICE;
}

async function saveOrder(
  id: string,
  provider: "stripe" | "paypal",
  status: "pending" | "paid" | "failed" | "expired",
) {
  const { error } = await adminClient().from("payment_orders").upsert({
    id,
    provider,
    service_id: SERVICE.id,
    amount_cents: SERVICE.amountCents,
    currency: SERVICE.currency,
    status,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Payment order persistence failed:", error.message);
    throw new PaymentError("Platbu sa nepodarilo bezpečne uložiť.", 503);
  }
}

async function findOrder(id: string, provider: "stripe" | "paypal") {
  const { data, error } = await adminClient()
    .from("payment_orders")
    .select("id, provider, service_id, amount_cents, currency, status")
    .eq("id", id)
    .eq("provider", provider)
    .maybeSingle();
  if (error) {
    console.error("Payment order lookup failed:", error.message);
    throw new PaymentError("Stav objednávky sa nepodarilo načítať.", 503);
  }
  return data;
}

function stripeSecret() {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key.startsWith("sk_test_")) {
    throw new PaymentError("Stripe Sandbox kľúč ešte nie je nastavený.", 503);
  }
  return key;
}

async function stripeRequest(path: string, body?: URLSearchParams) {
  const key = stripeSecret();
  const response = await fetch("https://api.stripe.com/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + key,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(body ? { body } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Stripe API returned status:", response.status);
    throw new PaymentError("Stripe Sandbox momentálne nedokázal spracovať požiadavku.", 502);
  }
  return data;
}

async function createStripeSession() {
  const site = siteUrl();
  const success = new URL("payments/", site);
  success.searchParams.set("payment", "success");
  const cancel = new URL("payments/", site);
  cancel.searchParams.set("payment", "cancelled");
  const body = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][product_data][name]": SERVICE.name,
    "line_items[0][price_data][unit_amount]": String(SERVICE.amountCents),
    "line_items[0][quantity]": "1",
    success_url: success.toString() + "&session_id={CHECKOUT_SESSION_ID}",
    cancel_url: cancel.toString(),
    "metadata[service_id]": SERVICE.id,
  });
  const session = await stripeRequest("checkout/sessions", body);
  if (!session.id || !session.url) throw new PaymentError("Stripe neposkytol platobný odkaz.", 502);
  await saveOrder(session.id, "stripe", "pending");
  return { url: session.url, session_id: session.id };
}

async function stripeStatus(sessionId: string) {
  if (!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId)) {
    throw new PaymentError("Neplatné číslo testovacej objednávky.", 400);
  }
  const order = await findOrder(sessionId, "stripe");
  if (!order) throw new PaymentError("Objednávka nebola nájdená.", 404);
  if (order.status === "paid") return { payment_status: "paid", paid: true };
  const session = await stripeRequest("checkout/sessions/" + encodeURIComponent(sessionId));
  const paid = session.payment_status === "paid";
  const status = paid ? "paid" : session.status === "expired" ? "expired" : "pending";
  if (status !== order.status) await saveOrder(sessionId, "stripe", status);
  return { payment_status: session.payment_status ?? status, paid };
}

async function paypalAccessToken() {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET") ?? "";
  if (!clientId || !clientSecret) {
    throw new PaymentError("PayPal Sandbox ešte nie je nakonfigurovaný.", 503);
  }
  const response = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(clientId + ":" + clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    console.error("PayPal Sandbox authentication returned status:", response.status);
    throw new PaymentError("PayPal Sandbox momentálne neodpovedá.", 502);
  }
  return data.access_token as string;
}

async function paypalRequest(path: string, method: "GET" | "POST", body?: unknown) {
  const token = await paypalAccessToken();
  const response = await fetch("https://api-m.sandbox.paypal.com" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("PayPal Sandbox returned status:", response.status);
    throw new PaymentError("PayPal Sandbox požiadavka zlyhala.", 502);
  }
  return data;
}

async function createPaypalOrder() {
  const site = siteUrl();
  const returnUrl = new URL("payments/", site);
  returnUrl.searchParams.set("provider", "paypal");
  const cancelUrl = new URL("payments/", site);
  cancelUrl.searchParams.set("payment", "cancelled");
  const amount = (SERVICE.amountCents / 100).toFixed(2);
  const order = await paypalRequest("/v2/checkout/orders", "POST", {
    intent: "CAPTURE",
    purchase_units: [{
      reference_id: SERVICE.id,
      custom_id: SERVICE.id,
      description: SERVICE.name,
      amount: { currency_code: SERVICE.currency, value: amount },
    }],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Sagrum_",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: returnUrl.toString(),
          cancel_url: cancelUrl.toString(),
        },
      },
    },
  });
  const approvalUrl = (order.links ?? []).find((link: { rel?: string }) =>
    link.rel === "payer-action" || link.rel === "approve"
  )?.href;
  if (!order.id || !approvalUrl) throw new PaymentError("PayPal neposkytol platobný odkaz.", 502);
  const approval = new URL(approvalUrl);
  if (approval.protocol !== "https:" || !approval.hostname.endsWith("paypal.com")) {
    throw new PaymentError("PayPal poskytol neplatný odkaz.", 502);
  }
  await saveOrder(order.id, "paypal", "pending");
  return { order_id: order.id, approval_url: approval.toString() };
}

async function capturePaypalOrder(orderId: string) {
  if (!/^[A-Z0-9-]{8,80}$/.test(orderId)) {
    throw new PaymentError("Neplatné číslo PayPal objednávky.", 400);
  }
  const orderRow = await findOrder(orderId, "paypal");
  if (!orderRow) throw new PaymentError("PayPal objednávka nebola nájdená.", 404);
  if (orderRow.status === "paid") return { status: "COMPLETED", paid: true };
  const order = await paypalRequest(
    "/v2/checkout/orders/" + encodeURIComponent(orderId),
    "GET",
  );
  if (order.status !== "APPROVED") {
    throw new PaymentError("PayPal objednávka ešte nebola schválená.", 400);
  }
  const unit = order.purchase_units?.[0];
  const amount = unit?.amount;
  const expectedAmount = (SERVICE.amountCents / 100).toFixed(2);
  if (
    unit?.reference_id !== SERVICE.id ||
    unit?.custom_id !== SERVICE.id ||
    amount?.currency_code !== SERVICE.currency ||
    amount?.value !== expectedAmount
  ) {
    throw new PaymentError("Údaje PayPal objednávky nesúhlasia.", 400);
  }
  const result = await paypalRequest(
    "/v2/checkout/orders/" + encodeURIComponent(orderId) + "/capture",
    "POST",
    {},
  );
  if (result.status !== "COMPLETED") {
    throw new PaymentError("PayPal platbu sa nepodarilo dokončiť.", 400);
  }
  await saveOrder(orderId, "paypal", "paid");
  return { status: "COMPLETED", paid: true };
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function verifyStripeWebhook(payload: string, header: string | null) {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!secret.startsWith("whsec_") || !header) {
    throw new PaymentError("Stripe webhook ešte nie je nakonfigurovaný.", 503);
  }
  const parts = header.split(",");
  const timestamp = Number(parts.find((part) => part.startsWith("t="))?.slice(2));
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(Date.now() / 1000 - timestamp) > 300 ||
    signatures.length === 0
  ) {
    throw new PaymentError("Neplatný podpis Stripe webhooku.", 400);
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = timestamp + "." + payload;
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed)),
  );
  const expected = bytesToHex(signature);
  if (!signatures.some((candidate) => safeEqual(candidate, expected))) {
    throw new PaymentError("Neplatný podpis Stripe webhooku.", 400);
  }
}

async function stripeWebhook(request: Request) {
  const payload = await request.text();
  await verifyStripeWebhook(payload, request.headers.get("stripe-signature"));
  const event = JSON.parse(payload);
  if (event.type === "checkout.session.completed") {
    const session = event.data?.object;
    if (session?.payment_status === "paid" && typeof session.id === "string") {
      const order = await findOrder(session.id, "stripe");
      if (order) await saveOrder(session.id, "stripe", "paid");
    }
  }
  return { received: true };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return json(request, { ok: true });
  try {
    const origin = request.headers.get("origin");
    const configured = Deno.env.get("SITE_URL")?.trim();
    if (configured && origin && new URL(configured).origin !== origin) {
      throw new PaymentError("Táto stránka nemá povolený prístup k platbám.", 403);
    }
    const url = new URL(request.url);
    const marker = "/payment-api";
    const markerIndex = url.pathname.lastIndexOf(marker);
    const route = markerIndex >= 0
      ? url.pathname.slice(markerIndex + marker.length).replace(/^\/+/, "")
      : "";

    if (request.method === "POST" && route === "api/stripe/create") {
      const body = await request.json().catch(() => ({}));
      getService(body.service_id);
      return json(request, await createStripeSession());
    }
    if (request.method === "GET" && route.startsWith("api/stripe/status/")) {
      return json(
        request,
        await stripeStatus(decodeURIComponent(route.slice("api/stripe/status/".length))),
      );
    }
    if (request.method === "POST" && route === "api/stripe/webhook") {
      return json(request, await stripeWebhook(request));
    }
    if (request.method === "POST" && route === "api/paypal/create") {
      const body = await request.json().catch(() => ({}));
      getService(body.service_id);
      return json(request, await createPaypalOrder());
    }
    if (request.method === "POST" && route === "api/paypal/capture") {
      const body = await request.json().catch(() => ({}));
      if (typeof body.order_id !== "string") {
        throw new PaymentError("Chýba číslo PayPal objednávky.", 400);
      }
      return json(request, await capturePaypalOrder(body.order_id));
    }
    throw new PaymentError("Platobný endpoint neexistuje.", 404);
  } catch (error) {
    const status = error instanceof PaymentError ? error.status : 500;
    const message = error instanceof PaymentError
      ? error.message
      : "Platobnú požiadavku sa nepodarilo spracovať.";
    if (!(error instanceof PaymentError)) console.error("Unhandled payment API error:", error);
    return json(request, { detail: message }, status);
  }
});
