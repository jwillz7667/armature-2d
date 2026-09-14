// Static, same-origin account UI. No tokens, customer IDs or prices are accepted from the browser.
export const billingHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Armature | Your subscription</title><link rel="stylesheet" href="/billing/style.css">
<script src="/billing/app.js" defer></script></head><body>
<header><a class="brand" href="/billing" aria-label="Armature billing home"><span class="mark">A</span> ARMATURE <span class="tag">2D</span></a><span class="secure">Secure billing with Stripe</span></header>
<main><div class="eyebrow">MADE FOR YOUR NEXT GREAT CHARACTER</div><h1>Bring your ideas<br>to life.</h1><p class="intro">One Armature subscription. Choose how you pay.</p>
<div id="notice" class="notice" role="status" aria-live="polite">Loading your account...</div>
<section id="account" class="account" hidden><div><span class="eyebrow">YOUR SUBSCRIPTION</span><h2 id="status">Checking status</h2><p id="renewal"></p></div><div class="account-actions"><button id="manage" class="secondary" hidden>Manage billing</button><button id="refresh" class="secondary">Refresh status</button><button id="logout" class="text-button">Sign out</button></div></section>
<section class="plans" aria-label="Subscription plans"><article class="plan"><div class="plan-top"><h2>Monthly</h2><span>FLEXIBLE BILLING</span></div><p class="price">$30<span> / month</span></p><p class="terms">3 days free, then $30 USD every month.</p><button data-plan="monthly" disabled>Start 3-day trial</button><p class="fine">Payment method required. Cancel before your trial ends to avoid the first charge.</p></article>
<article class="plan annual"><div class="plan-top"><h2>Yearly</h2><span>ONE ANNUAL PAYMENT</span></div><p class="price">$360<span> / year</span></p><p class="terms">3 days free, then $360 USD every year.</p><button data-plan="yearly" disabled>Start 3-day trial</button><p class="fine">The same $30 monthly rate, paid annually. No annual discount is applied.</p></article></section>
<div class="details"><p><strong>You stay in control.</strong> View invoices, update your payment method, or cancel in Stripe's customer portal. Cancellation stops the next renewal; access continues until your trial or paid period ends.</p><p>One trial per Armature account. Returning subscribers are charged when they subscribe again. Any applicable taxes are shown at checkout. Your project files are not deleted when your subscription ends.</p></div>
<a id="login" class="login" href="/billing/login" hidden>Sign in to Armature to continue</a>
<p class="footnote">Access is linked to the Armature account you sign in with.</p>
</main><footer>ARMATURE 2D <span>Card details are handled by Stripe.</span></footer></body></html>`;

export const billingCss = `:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;background:#0e1118;color:#f4f6fb}*{box-sizing:border-box}body{margin:0}header,footer{max-width:1120px;margin:auto;padding:30px 32px;display:flex;justify-content:space-between;align-items:center}header{border-bottom:1px solid #242a36}.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit;font-size:16px;font-weight:800;letter-spacing:2px}.mark{background:#c1f477;color:#142208;border-radius:9px;padding:7px 10px;letter-spacing:0}.tag{font-size:10px;color:#a5b0c2;border:1px solid #495166;padding:3px 5px;border-radius:4px}.secure{font-size:12px;color:#9fa9bc}main{max-width:960px;margin:66px auto;padding:0 32px}.eyebrow{font-size:10px;font-weight:700;letter-spacing:2px;color:#b3df7b}h1{font-size:clamp(42px,7vw,68px);line-height:1.06;letter-spacing:-3px;margin:20px 0}h2{font-size:21px;letter-spacing:-.5px;margin:0}.intro{font-size:18px;color:#abb4c6;margin-bottom:28px}.notice{border-left:3px solid #c1f477;padding:12px 16px;background:#171e27;border-radius:0 8px 8px 0;font-size:14px;line-height:1.5;margin:20px 0}.notice.error{border-color:#ffa59c;color:#ffc9c3}.account{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:24px;background:#151b25;border:1px solid #313b4d;border-radius:14px;margin:24px 0}.account h2{margin-top:8px}.account p{color:#aeb8ca;font-size:13px}.account-actions{display:flex;flex-wrap:wrap;gap:8px}.plans{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:26px}.plan{background:linear-gradient(140deg,#1b222e,#141a24);border:1px solid #323d50;border-radius:18px;padding:30px}.annual{border-color:#658842}.plan-top{display:flex;justify-content:space-between;gap:10px;align-items:center}.plan-top span{font-size:8px;letter-spacing:1px;color:#9dabbd}.price{font-size:54px;font-weight:650;letter-spacing:-2px;margin:30px 0 10px}.price span{font-size:14px;letter-spacing:0;font-weight:400;color:#a3aec1}.terms{font-size:14px;line-height:1.5;color:#d1d8e5;min-height:42px}button,.login{font:inherit;font-size:14px;font-weight:650;padding:14px 18px;border:0;border-radius:9px;background:#c1f477;color:#17220e;cursor:pointer;text-decoration:none;display:inline-block}button[data-plan]{width:100%;margin:16px 0 4px}button:disabled{opacity:.5;cursor:default}button:hover:not(:disabled),.login:hover{filter:brightness(1.08)}button:focus-visible,a:focus-visible{outline:3px solid #fff;outline-offset:4px}.secondary{background:#283348;color:#e3eaf4;font-size:12px;padding:11px 13px}.text-button{background:transparent;color:#aab7cc;font-size:12px}.fine,.details,.footnote{color:#a1acc0;font-size:12px;line-height:1.7}.fine{min-height:54px}.details{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin:26px 0}.details strong{color:#dbe4f3}.login{margin:8px 0 24px}.footnote{font-size:11px;max-width:660px}footer{border-top:1px solid #242a36;color:#8692a7;font-size:10px;letter-spacing:1px}footer span{letter-spacing:0}[hidden]{display:none!important}@media(max-width:660px){header,footer{padding:24px 20px}.secure{font-size:10px;max-width:85px;text-align:right}main{margin:42px auto;padding:0 20px}h1{letter-spacing:-2px}.plans,.details{grid-template-columns:1fr}.details{gap:0}.account{align-items:flex-start;flex-direction:column}.plan{padding:25px}.price{font-size:48px}.fine{min-height:0}}`;

export const billingJs = `(() => {
  const notice = document.getElementById('notice');
  const account = document.getElementById('account');
  const login = document.getElementById('login');
  const buttons = [...document.querySelectorAll('[data-plan]')];
  let csrf = null;
  let signedIn = false;
  let busy = false;
  let canSubscribe = false;
  function message(text, error = false) {
    notice.textContent = text;
    notice.classList.toggle('error', error);
  }
  async function api(path, body) {
    const response = await fetch('/billing/' + path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf || '' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Billing is temporarily unavailable. Please retry.');
    return data;
  }
  async function load() {
    try {
      const data = await api('account');
      signedIn = data.signedIn;
      csrf = data.csrf || null;
      account.hidden = !signedIn;
      login.hidden = signedIn || !data.enabled;
      const usedTrial = signedIn && !data.billing.trialEligible;
      buttons.forEach(button => {
        const yearly = button.dataset.plan === 'yearly';
        const amount = yearly ? '$360 USD every year' : '$30 USD every month';
        button.textContent = usedTrial ? 'Subscribe ' + (yearly ? 'yearly' : 'monthly') : 'Start 3-day trial';
        const card = button.closest('.plan');
        card.querySelector('.terms').textContent = usedTrial ? amount + ', starting today.' : '3 days free, then ' + amount + '.';
        card.querySelector('.fine').textContent = usedTrial
          ? 'Your trial has already been used. Your subscription renews automatically until canceled.'
          : 'Payment method required. Cancel before your trial ends to avoid the first charge.';
      });
      canSubscribe = !!data.enabled;
      if (signedIn) {
        const s = data.billing;
        document.getElementById('manage').hidden = !s.canManage;
        document.getElementById('status').textContent = s.status === 'none' ? 'Choose your plan' : s.status.replaceAll('_', ' ');
        document.getElementById('renewal').textContent = s.accessUntil
          ? (s.cancelAtPeriodEnd ? 'Access ends ' : 'Current access through ') + new Date(s.accessUntil * 1000).toLocaleString()
          : 'No active subscription';
        canSubscribe = canSubscribe && !s.active && !['past_due', 'unpaid', 'incomplete', 'paused', 'conflict', 'customer_deleted', 'active', 'trialing'].includes(s.status);
        message(s.mode === 'test' ? 'TEST MODE: use Stripe test payment details. No real charges.'
          : s.active ? 'Your subscription access is verified.'
          : s.trialEligible ? 'Your first 3 days are free. Stripe shows the first billing date before you confirm.'
          : 'Your trial has already been used. A new subscription starts billing immediately.');
      } else {
        message(data.enabled ? 'Sign in to your Armature account to start your trial.'
          : 'Subscriptions are not open yet. Checkout is disabled until billing setup is verified.');
      }
      buttons.forEach(button => button.disabled = busy || !canSubscribe);
    } catch (error) {
      canSubscribe = false;
      buttons.forEach(button => button.disabled = true);
      message(error.message, true);
    }
  }
  buttons.forEach(button => button.addEventListener('click', async () => {
    if (busy || !canSubscribe) return;
    if (!signedIn) { window.location.assign('/billing/login'); return; }
    busy = true;
    buttons.forEach(item => item.disabled = true);
    try {
      const data = await api('checkout', { plan: button.dataset.plan });
      window.location.assign(data.url);
    } catch (error) {
      busy = false;
      await load();
      message(error.message, true);
    }
  }));
  document.getElementById('manage').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    try { window.location.assign((await api('portal', {})).url); }
    catch (error) { busy = false; message(error.message, true); }
  });
  document.getElementById('logout').addEventListener('click', async () => {
    try { await api('logout', {}); await load(); }
    catch (error) { message(error.message, true); }
  });
  document.getElementById('refresh').addEventListener('click', () => load());
  // Query parameters cannot grant access. Always load the authenticated server status.
  load();
})();`;
