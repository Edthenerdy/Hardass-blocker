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
    pro_monthly: { id: 'pro_monthly', label: 'Hardass Pro (monthly)', amount: 900, interval: 'month' }
  },
  team: {
    team_monthly: { id: 'team_monthly', label: 'Deadbolt for Teams (per seat)', unitAmount: 400, interval: 'month', minSeats: 3 }
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
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return { url: j.url, id: j.id, simulated: false };
}

// Verify + handle a real Stripe webhook. Returns {ok}. Signature check runs when
// STRIPE_WEBHOOK_SECRET is set.
function handleStripeWebhook(rawBody, sigHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (secret) {
    const parts = Object.fromEntries(String(sigHeader || '').split(',').map(kv => kv.split('=')));
    const signed = crypto.createHmac('sha256', secret).update(parts.t + '.' + rawBody).digest('hex');
    if (!parts.v1 || !crypto.timingSafeEqual(Buffer.from(signed), Buffer.from(parts.v1))) {
      return { ok: false, error: 'bad signature' };
    }
  }
  let event;
  try { event = JSON.parse(rawBody); } catch { return { ok: false, error: 'bad json' }; }
  const obj = event.data && event.data.object;
  if ((event.type === 'checkout.session.completed' || event.type === 'invoice.paid') && obj && obj.metadata) {
    const m = obj.metadata;
    applyEntitlement(m.kind, m.refId, m.plan, parseInt(m.seats, 10) || 1);
  } else if (event.type === 'customer.subscription.deleted' && obj && obj.metadata && obj.metadata.kind === 'team') {
    const o = (db.get().orgs || []).find(x => x.id === obj.metadata.refId);
    if (o) { o.subscriptionStatus = 'canceled'; db.save(); }
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
  handleStripeWebhook, applyEntitlement, consumerStatus, orgActive
};
