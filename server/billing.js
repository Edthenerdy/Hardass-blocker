'use strict';
// Billing: works in SIMULATED mode out of the box (no account needed), and in
// REAL Stripe mode when STRIPE_SECRET_KEY is set — implemented via Stripe's REST
// API over fetch, so the server stays dependency-free.
const crypto = require('node:crypto');
const db = require('./db');
const { newId } = require('./auth');

const MONTH = 30 * 24 * 3600 * 1000;

const PLANS = {
  consumer: {
    free: { id: 'free', label: 'Free', amount: 0, interval: null },
    pro_monthly: { id: 'pro_monthly', label: 'Holdfast Pro (monthly)', amount: 799, interval: 'month' }
  },
  team: {
    team_monthly: { id: 'team_monthly', label: 'Holdfast for Teams (per seat)', unitAmount: 400, interval: 'month', minSeats: 3 }
  }
};

function useStripe() { return !!process.env.STRIPE_SECRET_KEY; }
function planCfg(kind, plan) { return (PLANS[kind] || {})[plan]; }
function normSeats(kind, cfg, seats) {
  if (kind !== 'team') return 1;
  return Math.max(cfg.minSeats || 1, parseInt(seats, 10) || cfg.minSeats || 1);
}

// The one place entitlement is granted — used by both the simulated checkout and
// the real Stripe webhook, so the two paths can never drift.
function applyEntitlement(kind, refId, plan, seats) {
  const data = db.get();
  if (kind === 'consumer') {
    const u = data.users.find(x => x.id === refId);
    if (!u) return;
    if (plan === 'pro_monthly') { u.plan = 'pro'; u.lifetime = false; u.proUntil = Date.now() + MONTH; }
    else { u.plan = 'free'; u.lifetime = false; u.proUntil = null; }
  } else if (kind === 'team') {
    const o = (data.orgs || []).find(x => x.id === refId);
    if (!o) return;
    o.plan = plan;
    o.seats = Math.max(1, seats || o.seats);
    o.subscriptionStatus = 'active';
    o.currentPeriodEnd = Date.now() + MONTH;
  }
  db.save();
}

async function createCheckout({ kind, refId, plan, seats, origin }) {
  const cfg = planCfg(kind, plan);
  if (!cfg) throw new Error('unknown plan');
  seats = normSeats(kind, cfg, seats);
  const amount = kind === 'team' ? cfg.unitAmount * seats : cfg.amount;

  if (kind === 'consumer' && plan === 'free') {
    applyEntitlement('consumer', refId, 'free', 1);
    return { url: origin + '/account?free=1', simulated: true, free: true };
  }
  if (useStripe()) return stripeCheckout({ kind, refId, plan, seats, cfg, origin });

  const data = db.get();
  const id = newId('cs');
  data.checkouts.push({ id, kind, refId, plan, seats, amount, label: cfg.label, status: 'open', createdAt: Date.now() });
  db.save();
  return { url: origin + '/pay/' + id, id, simulated: true, amount, seats, label: cfg.label };
}

function completeSimCheckout(id) {
  const data = db.get();
  const cs = data.checkouts.find(c => c.id === id);
  if (!cs) return { ok: false, error: 'not found' };
  if (cs.status !== 'paid') {
    cs.status = 'paid';
    cs.paidAt = Date.now();
    applyEntitlement(cs.kind, cs.refId, cs.plan, cs.seats);
    db.save();
  }
  return { ok: true, checkout: cs };
}

function getSimCheckout(id) { return db.get().checkouts.find(c => c.id === id) || null; }

async function stripeCheckout({ kind, refId, plan, seats, cfg, origin }) {
  const p = new URLSearchParams();
  const mode = cfg.interval ? 'subscription' : 'payment';
  p.set('mode', mode);
  p.set('success_url', origin + '/account?paid=1');
  p.set('cancel_url', origin + '/account?canceled=1');
  p.set('line_items[0][quantity]', String(seats));
  p.set('line_items[0][price_data][currency]', 'usd');
  p.set('line_items[0][price_data][product_data][name]', cfg.label);
  p.set('line_items[0][price_data][unit_amount]', String(kind === 'team' ? cfg.unitAmount : cfg.amount));
  if (cfg.interval) p.set('line_items[0][price_data][recurring][interval]', cfg.interval);
  p.set('metadata[kind]', kind);
  p.set('metadata[refId]', refId);
  p.set('metadata[plan]', plan);
  p.set('metadata[seats]', String(seats));
  const j = await stripeReq('POST', '/v1/checkout/sessions', p, crypto.randomUUID());
  if (j.error) throw new Error(j.error.message);
  return { url: j.url, id: j.id, simulated: false };
}

// Minimal Stripe REST helper (no SDK). idempotencyKey guards against duplicate
// creates on retry; Stripe's own libraries do exactly this per request.
async function stripeReq(method, pathName, params, idempotencyKey) {
  const headers = { 'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY };
  if (params) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch('https://api.stripe.com' + pathName, { method, headers, body: params || undefined });
  return res.json();
}

function findOrgBySub(subId) { return (db.get().orgs || []).find(o => o.stripeSubscriptionId === subId); }
function findUserBySub(subId) { return (db.get().users || []).find(u => u.stripeSubscriptionId === subId); }

function persistStripeIds(kind, refId, customer, subscription) {
  const data = db.get();
  const rec = kind === 'team' ? (data.orgs || []).find(o => o.id === refId) : (data.users || []).find(u => u.id === refId);
  if (!rec) return;
  if (customer) rec.stripeCustomerId = customer;
  if (subscription) rec.stripeSubscriptionId = subscription;
  db.save();
}

// Change seat count on an active team subscription: live Stripe updates the
// subscription item quantity (auto-prorated); simulated just updates locally.
async function updateSeats(refId, seats) {
  const cfg = PLANS.team.team_monthly;
  seats = normSeats('team', cfg, seats);
  const o = (db.get().orgs || []).find(x => x.id === refId);
  if (!o) return { ok: false, error: 'no org' };
  if (useStripe() && o.stripeSubscriptionId) {
    const sub = await stripeReq('GET', '/v1/subscriptions/' + o.stripeSubscriptionId);
    if (sub.error) return { ok: false, error: sub.error.message };
    const itemId = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].id;
    if (!itemId) return { ok: false, error: 'no subscription item' };
    const p = new URLSearchParams();
    p.set('items[0][id]', itemId);
    p.set('items[0][quantity]', String(seats));
    p.set('proration_behavior', 'create_prorations');
    const upd = await stripeReq('POST', '/v1/subscriptions/' + o.stripeSubscriptionId, p);
    if (upd.error) return { ok: false, error: upd.error.message };
  }
  o.seats = seats;
  db.save();
  return { ok: true, seats };
}

// Verify + handle a real Stripe webhook. Returns {ok}. Signature check runs when
// STRIPE_WEBHOOK_SECRET is set.
function handleStripeWebhook(rawBody, sigHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (secret) {
    const parts = Object.fromEntries(String(sigHeader || '').split(',').map(kv => kv.split('=')));
    // Replay protection: reject signatures whose timestamp is outside a 5-min window.
    const ts = parseInt(parts.t, 10);
    if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return { ok: false, error: 'timestamp outside tolerance' };
    const signed = crypto.createHmac('sha256', secret).update(parts.t + '.' + rawBody).digest('hex');
    if (!parts.v1 || parts.v1.length !== signed.length || !crypto.timingSafeEqual(Buffer.from(signed), Buffer.from(parts.v1))) {
      return { ok: false, error: 'bad signature' };
    }
  }
  let event;
  try { event = JSON.parse(rawBody); } catch { return { ok: false, error: 'bad json' }; }
  const obj = (event.data && event.data.object) || {};

  if (event.type === 'checkout.session.completed') {
    const m = obj.metadata || {};
    applyEntitlement(m.kind, m.refId, m.plan, parseInt(m.seats, 10) || 1);
    persistStripeIds(m.kind, m.refId, obj.customer, obj.subscription);
  } else if (event.type === 'invoice.paid') {
    // Renewal — find the record by its subscription id and keep it active.
    const subId = obj.subscription;
    const o = findOrgBySub(subId); const u = findUserBySub(subId);
    if (o) { o.subscriptionStatus = 'active'; o.currentPeriodEnd = Date.now() + 30 * 24 * 3600 * 1000; db.save(); }
    else if (u) applyEntitlement('consumer', u.id, 'pro_monthly', 1);
  } else if (event.type === 'customer.subscription.deleted') {
    const subId = obj.id;
    const o = findOrgBySub(subId); const u = findUserBySub(subId);
    if (o) { o.subscriptionStatus = 'canceled'; db.save(); }
    else if (u) applyEntitlement('consumer', u.id, 'free', 1);
  }
  return { ok: true };
}

function consumerStatus(user) {
  const active = user.plan === 'pro' && (user.lifetime || !user.proUntil || user.proUntil > Date.now());
  return { plan: active ? 'pro' : 'free', lifetime: !!user.lifetime, proUntil: user.proUntil || null };
}
function orgActive(org) {
  return org.subscriptionStatus === 'active' && (!org.currentPeriodEnd || org.currentPeriodEnd > Date.now());
}

module.exports = {
  PLANS, useStripe, createCheckout, completeSimCheckout, getSimCheckout,
  handleStripeWebhook, applyEntitlement, consumerStatus, orgActive, updateSeats
};
