(function () {
  const $ = s => document.querySelector(s);
  const el = {
    whoami: $('#whoami'), logout: $('#logout'), banner: $('#banner'),
    loggedOut: $('#loggedOut'), loggedIn: $('#loggedIn'),
    tabSignup: $('#tabSignup'), tabLogin: $('#tabLogin'),
    email: $('#email'), password: $('#password'), authBtn: $('#authBtn'), authErr: $('#authErr'),
    planName: $('#planName'), planDetail: $('#planDetail'), upgradeBox: $('#upgradeBox'), cancelBtn: $('#cancelBtn')
  };
  let token = localStorage.getItem('hb_user_token') || null;
  let mode = 'signup';

  async function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    return (await fetch('/api' + path, opts)).json();
  }

  function banner(text, kind) {
    el.banner.hidden = false;
    el.banner.className = 'banner ' + (kind || 'info');
    el.banner.textContent = text;
  }

  function setMode(m) {
    mode = m;
    el.tabSignup.classList.toggle('on', m === 'signup');
    el.tabLogin.classList.toggle('on', m === 'login');
    el.authBtn.textContent = m === 'signup' ? 'Create account' : 'Sign in';
  }
  el.tabSignup.addEventListener('click', () => setMode('signup'));
  el.tabLogin.addEventListener('click', () => setMode('login'));

  el.authBtn.addEventListener('click', async () => {
    el.authErr.textContent = '';
    const path = mode === 'signup' ? '/auth/user/signup' : '/auth/user/login';
    const res = await api(path, { method: 'POST', body: JSON.stringify({ email: el.email.value.trim(), password: el.password.value }) });
    if (!res.ok) { el.authErr.textContent = res.error || 'Failed'; return; }
    token = res.token; localStorage.setItem('hb_user_token', token);
    el.email.value = ''; el.password.value = '';
    showAccount();
  });

  el.logout.addEventListener('click', () => {
    token = null; localStorage.removeItem('hb_user_token');
    el.loggedIn.hidden = true; el.loggedOut.hidden = false;
    el.logout.hidden = true; el.whoami.textContent = '';
  });

  document.querySelectorAll('[data-plan]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    const res = await api('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan: b.dataset.plan }) });
    if (res.ok && res.url) location.href = res.url;
    else { banner(res.error || 'Checkout failed', 'info'); b.disabled = false; }
  }));

  el.cancelBtn.addEventListener('click', async () => {
    await api('/billing/cancel', { method: 'POST' });
    showAccount();
  });

  async function showAccount() {
    const res = await api('/billing/status');
    if (!res.ok) { token = null; localStorage.removeItem('hb_user_token'); el.loggedOut.hidden = false; el.loggedIn.hidden = true; return; }
    el.loggedOut.hidden = true; el.loggedIn.hidden = false; el.logout.hidden = false;
    const pro = res.plan === 'pro';
    el.planName.textContent = pro ? (res.lifetime ? 'Pro (Lifetime)' : 'Pro') : 'Free';
    el.planName.style.color = pro ? 'var(--clear)' : 'var(--bone)';
    el.planDetail.textContent = pro
      ? (res.lifetime ? 'Yours forever. No subscription.' : (res.proUntil ? 'Renews ' + new Date(res.proUntil).toLocaleDateString() : 'Active.'))
      : 'Free tier — up to 5 blocked sites.';
    el.upgradeBox.style.display = pro ? 'none' : 'block';
    el.cancelBtn.hidden = !(pro && !res.lifetime);
  }

  (async () => {
    const q = new URLSearchParams(location.search);
    if (q.get('paid')) banner('Payment complete — you\'re Pro. Your extension will unlock on next check.', 'ok');
    else if (q.get('free')) banner('You\'re on the Free plan.', 'info');
    else if (q.get('canceled')) banner('Checkout canceled.', 'info');
    setMode('signup');
    if (token) await showAccount();
  })();
})();
