(() => {
  const config = window.ZUUTRANS_CONFIG;

  // Shipment tracking
  const trackingForm = document.getElementById('trackingForm');
  const trackingInput = document.getElementById('trackingNumber');
  const trackingMessage = document.getElementById('trackingMessage');
  const trackingResult = document.getElementById('trackingResult');

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '—';
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };

  const getProgressIndex = (status) => {
    const value = String(status || '').trim().toLowerCase();
    if (value.includes('deliver')) return 3;
    if (value.includes('transit') || value.includes('depart') || value.includes('shipped')) return 2;
    if (value.includes('process') || value.includes('pickup') || value.includes('pick up') || value.includes('assigned') || value.includes('custom')) return 1;
    if (value.includes('book') || value.includes('received') || value.includes('created') || value.includes('pending')) return 0;
    return 1;
  };

  const renderTrackingProgress = (status) => {
    const steps = [...document.querySelectorAll('#trackingTimeline .timeline-step')];
    const lines = [...document.querySelectorAll('#trackingTimeline .timeline-line')];
    const index = getProgressIndex(status);
    steps.forEach((step, stepIndex) => {
      step.classList.toggle('complete', stepIndex < index);
      step.classList.toggle('current', stepIndex === index);
      step.classList.toggle('upcoming', stepIndex > index);
    });
    lines.forEach((line, lineIndex) => line.classList.toggle('complete', lineIndex < index));

    const title = document.getElementById('resultProgressTitle');
    const hint = document.getElementById('resultProgressHint');
    if (title) title.textContent = status || 'Current status';
    if (hint) hint.textContent = index === 3 ? 'Shipment delivered' : 'Shipment is moving through the delivery process';
  };

  if (trackingForm && trackingInput && trackingMessage && trackingResult) {
    trackingForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const trackingNumber = trackingInput.value.trim().toUpperCase();
      trackingResult.classList.add('hidden');

      if (!trackingNumber) {
        trackingMessage.textContent = 'Please enter a tracking number.';
        return;
      }

      if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
        trackingMessage.textContent = 'Supabase configuration is missing.';
        return;
      }

      trackingMessage.textContent = 'Checking shipment status…';

      try {
        const response = await fetch(
          `${config.supabaseUrl}/rest/v1/rpc/get_shipment_by_tracking_number`,
          {
            method: 'POST',
            headers: {
              apikey: config.supabasePublishableKey,
              Authorization: `Bearer ${config.supabasePublishableKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tracking_number_input: trackingNumber })
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `Request failed (${response.status})`);
        }

        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length === 0) {
          trackingMessage.textContent = `No shipment was found for ${trackingNumber}. Please check the tracking number and try again.`;
          return;
        }

        const shipment = rows[0];
        setText('resultTrackingNumber', shipment.tracking_number);
        setText('resultOrigin', shipment.origin);
        setText('resultDestination', shipment.destination);
        setText('resultMethod', shipment.shipping_method);
        setText('resultCargo', shipment.cargo_description);
        setText('resultUpdated', formatDate(shipment.last_update));
        setText('resultStatus', shipment.status);
        const statusBadge = document.getElementById('resultStatus');
        if (statusBadge) {
          statusBadge.className = 'status-badge';
          const statusClass = String(shipment.status || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
          if (statusClass) statusBadge.classList.add(`status-${statusClass}`);
        }
        renderTrackingProgress(shipment.status);
        trackingMessage.textContent = '';
        trackingResult.classList.remove('hidden');
        trackingResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (error) {
        console.error(error);
        trackingMessage.textContent = 'We could not check the shipment right now. Please try again.';
      }
    });
  }

  // Netlify Forms: submit the quote request with AJAX so there is no 404 redirect.
  const quoteForm = document.getElementById('quoteForm');
  const quoteMessage = document.getElementById('quoteMessage');
  const quoteSubmit = document.getElementById('quoteSubmit');

  if (quoteForm && quoteMessage) {
    quoteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      quoteMessage.textContent = 'Sending your quote request…';
      quoteMessage.classList.remove('success', 'error');
      if (quoteSubmit) quoteSubmit.disabled = true;

      try {
        // When opened directly from the computer (file://), Netlify Forms cannot
        // receive the POST. Treat this as a local readiness test instead of
        // showing a misleading error. The real submission runs on Netlify.
        if (window.location.protocol === 'file:') {
          quoteForm.reset();
          quoteMessage.textContent = 'Local test successful. This quote form is ready for Netlify. Once the website is live, submissions will be sent through Netlify Forms.';
          quoteMessage.classList.add('success');
          return;
        }

        const formData = new FormData(quoteForm);
        const body = new URLSearchParams(formData).toString();
        const response = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        });

        if (!response.ok) {
          throw new Error(`Form submission failed (${response.status})`);
        }

        quoteForm.reset();
        quoteMessage.textContent = 'Thank you. Your quote request has been sent to ZuuTrans Shipping. We will get back to you soon.';
        quoteMessage.classList.add('success');
      } catch (error) {
        console.error(error);
        quoteMessage.textContent = 'We could not send your request right now. Please try again or contact us on WhatsApp.';
        quoteMessage.classList.add('error');
      } finally {
        if (quoteSubmit) quoteSubmit.disabled = false;
      }
    });
  }


  // Customs planning calculator
  const customsForm = document.getElementById('customsForm');
  const customsResult = document.getElementById('customsResult');
  if (customsForm && customsResult) {
    const money = (value) => `GHS ${Number(value).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    customsForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const cif = Number(document.getElementById('customsValue').value) || 0;
      const dutyRate = Number(document.getElementById('dutyRate').value) || 0;
      const other = Number(document.getElementById('otherLevies').value) || 0;
      const transport = Number(document.getElementById('zuutransCost').value) || 0;
      if (cif <= 0) return;
      const duty = cif * dutyRate / 100;
      const taxBase = cif + duty + other;
      const nhil = taxBase * 0.025;
      const getfund = taxBase * 0.025;
      const vat = taxBase * 0.15;
      const total = cif + duty + other + nhil + getfund + vat + transport;
      const values = { calcCif: cif, calcDuty: duty, calcOther: other, calcTaxBase: taxBase, calcNhil: nhil, calcGetfund: getfund, calcVat: vat, calcTransport: transport, calcTotal: total };
      Object.entries(values).forEach(([id, value]) => setText(id, money(value)));
      setText('customsDutyBadge', `${dutyRate}% duty band`);
      customsResult.classList.remove('hidden');
      customsResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }


  // Mobile navigation menu
  const menuToggle = document.querySelector('.menu-toggle');
  const mobileNav = document.getElementById('mobileNav');
  if (menuToggle && mobileNav) {
    const closeMenu = () => {
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Open navigation menu');
      mobileNav.classList.remove('open');
    };

    menuToggle.addEventListener('click', () => {
      const open = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!open));
      menuToggle.setAttribute('aria-label', open ? 'Open navigation menu' : 'Close navigation menu');
      mobileNav.classList.toggle('open', !open);
    });

    mobileNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
    document.addEventListener('click', (event) => {
      if (!mobileNav.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
    });
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();

/* Paid car duty checker — Paystack-connected front end + Auto.dev VIN decoding */
(function(){
  const balanceEl=document.getElementById('dutyTokenBalance');
  const balanceCard=document.getElementById('dutyTokenBalanceCard');
  const loginStateEl=document.getElementById('dutyLoginState');
  const dutyLookup=document.getElementById('duty-lookup');
  const noticeEl=document.getElementById('tokenPaymentNotice');
  const tabs=document.querySelectorAll('.duty-tab');
  const vinFields=document.getElementById('dutyVinFields');
  const detailFields=document.getElementById('dutyDetailFields');
  const report=document.getElementById('dutyReportPreview');
  const run=document.getElementById('runDutyCheck');
  const emailEl=document.getElementById('dutyCustomerEmail');
  const passwordEl=document.getElementById('dutyCustomerPassword');
  const loginBtn=document.getElementById('dutyLogin');
  const showSignupBtn=document.getElementById('dutyShowSignup');
  const createAccountBtn=document.getElementById('dutyCreateAccount');
  const backToLoginBtn=document.getElementById('dutyBackToLogin');
  const showRecoveryBtn=document.getElementById('dutyShowRecovery');
  const recoveryPanel=document.getElementById('dutyRecoveryPanel');
  const recoveryEmailEl=document.getElementById('dutyRecoveryEmail');
  const sendRecoveryBtn=document.getElementById('dutySendRecovery');
  const recoveryBackBtn=document.getElementById('dutyRecoveryBackToLogin');
  const resetPanel=document.getElementById('dutyResetPanel');
  const resetPasswordEl=document.getElementById('dutyResetPassword');
  const resetConfirmEl=document.getElementById('dutyResetConfirm');
  const resetPasswordBtn=document.getElementById('dutyResetPasswordBtn');
  const loginPanel=document.getElementById('dutyLoginPanel');
  const signupPanel=document.getElementById('dutySignupPanel');
  const signupNameEl=document.getElementById('dutySignupName');
  const signupEmailEl=document.getElementById('dutySignupEmail');
  const signupPhoneEl=document.getElementById('dutySignupPhone');
  const signupPasswordEl=document.getElementById('dutySignupPassword');
  const signupConfirmEl=document.getElementById('dutySignupConfirm');
  const logoutBtn=document.getElementById('dutyLogout');
  const accountStatus=document.getElementById('dutyAccountStatus');
  const accountNotice=document.getElementById('dutyAccountNotice');
  if(!balanceEl) return;

  const config=window.ZUUTRANS_CONFIG||{};
  const INITIALIZE_URL=config.paystackInitializeUrl||'https://amkmzuefeihawfvlmrra.supabase.co/functions/v1/paystack-initialize';
  const STATUS_URL=config.paystackStatusUrl||'https://amkmzuefeihawfvlmrra.supabase.co/functions/v1/paystack-status';
  const VIN_DECODE_URL=config.vinDecodeUrl||'https://amkmzuefeihawfvlmrra.supabase.co/functions/v1/vin-decode';
  const BALANCE_URL=config.dutyBalanceUrl||'https://amkmzuefeihawfvlmrra.supabase.co/functions/v1/duty-balance';
  const ACCOUNT_URL=config.dutyAccountUrl||'https://amkmzuefeihawfvlmrra.supabase.co/functions/v1/duty-account';
  const SIGNUP_URL=config.dutySignupUrl||'https://amkmzuefeihawfvlmrra.supabase.co/functions/v1/duty-signup';
  const SUPABASE_URL=config.supabaseUrl||'';
  const SUPABASE_KEY=config.supabasePublishableKey||'';

  const showNotice=(message,type='info')=>{
    if(!noticeEl) return;
    noticeEl.textContent=message||'';
    noticeEl.classList.remove('hidden','success','error','info');
    noticeEl.classList.add(type);
  };
  const setBusy=(busy)=>{
    [loginBtn,showSignupBtn,createAccountBtn,backToLoginBtn,logoutBtn,showRecoveryBtn,sendRecoveryBtn,recoveryBackBtn,resetPasswordBtn,...document.querySelectorAll('.token-buy')].forEach(btn=>{ if(btn) btn.disabled=!!busy; });
  };

  const walletKey='zuutransDutyTokens';
  let currentEmail=sessionStorage.getItem('zuutransDutyEmail')||'';
  let currentPhone=sessionStorage.getItem('zuutransDutyPhone')||'';
  let accessToken=sessionStorage.getItem('zuutransDutyAccessToken')||'';
  let tokens=0;
  let authenticated=!!accessToken;

  const render=()=>{
    balanceEl.textContent=authenticated ? String(tokens) : '—';
    if(loginStateEl) loginStateEl.textContent=authenticated ? 'LOGGED IN' : 'LOGIN REQUIRED';
    if(accountStatus) accountStatus.textContent=authenticated ? 'LOGGED IN' : 'LOGGED OUT';
    balanceCard?.classList.toggle('authenticated',authenticated);
    dutyLookup?.classList.toggle('duty-locked',!authenticated);
    document.querySelectorAll('.duty-protected-content, #duty-lookup').forEach(el=>el.classList.toggle('duty-content-hidden',!authenticated));
    if(loginBtn) loginBtn.classList.toggle('hidden',authenticated);
    if(showSignupBtn) showSignupBtn.classList.toggle('hidden',authenticated);
    if(loginPanel) loginPanel.classList.toggle('hidden',authenticated ? true : false);
    if(signupPanel && authenticated) signupPanel.classList.add('hidden');
    if(recoveryPanel && authenticated) recoveryPanel.classList.add('hidden');
    if(resetPanel && authenticated) resetPanel.classList.add('hidden');
    if(logoutBtn) logoutBtn.classList.toggle('hidden',!authenticated);
    if(emailEl) emailEl.disabled=authenticated;
    if(passwordEl) passwordEl.disabled=authenticated;
    [signupNameEl,signupEmailEl,signupPhoneEl,signupPasswordEl,signupConfirmEl].forEach(el=>{ if(el) el.disabled=authenticated; });
    document.querySelectorAll('.token-buy').forEach(btn=>btn.disabled=!authenticated);
  };

  const saveTokens=(value)=>{
    tokens=Math.max(0,Number(value)||0);
    sessionStorage.setItem(walletKey,String(tokens));
    if(currentEmail) sessionStorage.setItem(`zuutransDutyTokens:${currentEmail.trim().toLowerCase()}`,String(tokens));
    render();
  };

  async function consumeToken(){
    const res=await fetch(`${SUPABASE_URL}/functions/v1/duty-consume-token`,{
      method:'POST',headers:authHeaders(),body:JSON.stringify({email:currentEmail})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok || !data.success) throw new Error(data.error||'Unable to use a duty-check token.');
    saveTokens(data.token_balance);
    return data;
  }

  const showAccountNotice=(message,type='info')=>{
    if(accountNotice){ accountNotice.textContent=message||''; accountNotice.dataset.type=type; }
  };

  const authHeaders=(token=accessToken)=>({
    'Content-Type':'application/json',
    apikey:SUPABASE_KEY,
    ...(token?{Authorization:`Bearer ${token}`}:{})
  });

  async function authRequest(path,body){
    // Use Supabase Auth directly. This works on the live site and when the
    // website is opened from a local web server. Only fall back to the Netlify
    // proxy when the direct request cannot be reached from an HTTP(S) site.
    const directEndpoint=`${SUPABASE_URL}${path}`;
    const request=async(endpoint,headers={})=>{
      const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),cache:'no-store'});
      const data=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data.error_description||data.msg||data.error||'Account request failed.');
      return data;
    };

    try{
      return await request(directEndpoint,{apikey:SUPABASE_KEY});
    }catch(directError){
      const origin=String(window.location?.origin||'');
      const canUseProxy=/^https?:$/i.test(window.location?.protocol||'') && origin!=='null';
      if(path==='/auth/v1/token?grant_type=password' && canUseProxy){
        try{
          return await request('/.netlify/functions/duty-login');
        }catch(proxyError){
          throw new Error(proxyError?.message||directError?.message||'Unable to connect to the login service.');
        }
      }
      throw new Error(directError?.message||'Unable to connect to the login service.');
    }
  }

  async function openDutyAccount(email,phone,token){
    const res=await fetch(ACCOUNT_URL,{method:'POST',headers:authHeaders(token),body:JSON.stringify({email,phone:phone||''})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok || !data.success) throw new Error(data.error||'Unable to open your ZuuTrans account.');
    return data;
  }

  async function loadBalance(email,phone,token){
    const res=await fetch(BALANCE_URL,{method:'POST',headers:authHeaders(token),body:JSON.stringify({email,phone})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok || !data.success) throw new Error(data.error||'Unable to load your token balance.');
    saveTokens(data.token_balance);
    return data;
  }

  async function completeLogin(data,email,phone){
    if(!data.access_token) throw new Error('Login succeeded but no secure session was returned.');
    accessToken=data.access_token;
    currentEmail=email;
    currentPhone=phone || data?.user?.user_metadata?.phone || currentPhone || '';
    sessionStorage.setItem('zuutransDutyAccessToken',accessToken);
    sessionStorage.setItem('zuutransDutyEmail',email);

    // Resolve the existing ZuuTrans customer record securely by email.
    // The login form intentionally stays email + password only.
    const account=await openDutyAccount(email,currentPhone,accessToken);
    currentPhone=account.phone || currentPhone || data?.user?.user_metadata?.phone || '';
    sessionStorage.setItem('zuutransDutyPhone',currentPhone);

    const balance=await loadBalance(email,currentPhone,accessToken);
    authenticated=true;
    render();
    showAccountNotice(`Welcome back. Your balance is ${Number(balance.token_balance)||0} token${Number(balance.token_balance)===1?'':'s'}.`,'success');
    showNotice('You are logged in. Your duty checker is now unlocked.','success');
  }

  async function doLogin(){
    const email=(emailEl?.value||'').trim().toLowerCase();
    const password=passwordEl?.value||'';
    if(!email||!email.includes('@')){ showAccountNotice('Enter your email address.','error'); emailEl?.focus(); return; }
    if(password.length<6){ showAccountNotice('Password must be at least 6 characters.','error'); passwordEl?.focus(); return; }
    setBusy(true); showAccountNotice('Logging you in securely…','info');
    try{
      const data=await authRequest('/auth/v1/token?grant_type=password',{email,password});
      await completeLogin(data,email,'');
      if(passwordEl) passwordEl.value='';
    }catch(err){
      const msg=String(err.message||'');
      if(/email not confirmed/i.test(msg)){
        showAccountNotice('Your email has not been confirmed yet. Check your inbox for the ZuuTrans confirmation email, then log in again.','error');
      }else if(/invalid login credentials|invalid credentials/i.test(msg)){
        showAccountNotice('The email or password is incorrect. Use the exact email and password used when the account was created.','error');
      }else{
        showAccountNotice(msg||'Unable to log in.','error');
      }
    }
    finally{ setBusy(false); }
  }

  async function doSignup(){
    const name=(signupNameEl?.value||'').trim();
    const email=(signupEmailEl?.value||'').trim().toLowerCase();
    const phone=(signupPhoneEl?.value||'').trim();
    const password=signupPasswordEl?.value||'';
    const confirm=signupConfirmEl?.value||'';
    if(!name){ showAccountNotice('Enter your full name.','error'); signupNameEl?.focus(); return; }
    if(!email||!email.includes('@')){ showAccountNotice('Enter your email address.','error'); signupEmailEl?.focus(); return; }
    if(!phone||phone.replace(/\D/g,'').length<8){ showAccountNotice('Enter your phone number.','error'); signupPhoneEl?.focus(); return; }
    if(password.length<6){ showAccountNotice('Password must be at least 6 characters.','error'); signupPasswordEl?.focus(); return; }
    if(password!==confirm){ showAccountNotice('Passwords do not match.','error'); signupConfirmEl?.focus(); return; }
    setBusy(true); showAccountNotice('Creating your ZuuTrans account…','info');
    try{
      const res=await fetch(SIGNUP_URL,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY},body:JSON.stringify({email,password,full_name:name,phone})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok || !data.success) throw new Error(data.error||'Unable to create your ZuuTrans account.');
      const loginData=await authRequest('/auth/v1/token?grant_type=password',{email,password});
      await completeLogin(loginData,email,phone);
      if(signupPasswordEl) signupPasswordEl.value='';
      if(signupConfirmEl) signupConfirmEl.value='';
    }catch(err){ showAccountNotice(err.message||'Unable to create the account.','error'); }
    finally{ setBusy(false); }
  }

  function showSignup(){
    loginPanel?.classList.add('hidden');
    recoveryPanel?.classList.add('hidden');
    resetPanel?.classList.add('hidden');
    signupPanel?.classList.remove('hidden');
    showAccountNotice('','info');
    signupNameEl?.focus();
  }

  function showLogin(){
    signupPanel?.classList.add('hidden');
    recoveryPanel?.classList.add('hidden');
    resetPanel?.classList.add('hidden');
    loginPanel?.classList.remove('hidden');
    showAccountNotice('','info');
    emailEl?.focus();
  }

  function showRecovery(){
    loginPanel?.classList.add('hidden');
    signupPanel?.classList.add('hidden');
    resetPanel?.classList.add('hidden');
    recoveryPanel?.classList.remove('hidden');
    if(recoveryEmailEl) recoveryEmailEl.value=emailEl?.value||'';
    showAccountNotice('','info');
    recoveryEmailEl?.focus();
  }

  async function sendRecovery(){
    const email=(recoveryEmailEl?.value||'').trim().toLowerCase();
    if(!email||!email.includes('@')){ showAccountNotice('Enter your email address.','error'); recoveryEmailEl?.focus(); return; }
    setBusy(true); showAccountNotice('Sending your secure reset link…','info');
    try{
      const redirectTo=window.location.href.split('#')[0];
      await authRequest('/auth/v1/recover',{email,redirect_to:redirectTo});
      showAccountNotice('If that email belongs to a ZuuTrans account, a password-reset link has been sent. Check your inbox.','success');
    }catch(err){ showAccountNotice(err.message||'Unable to send the reset link.','error'); }
    finally{ setBusy(false); }
  }

  async function resetPassword(){
    const password=resetPasswordEl?.value||'';
    const confirm=resetConfirmEl?.value||'';
    const hash=new URLSearchParams((window.location.hash||'').replace(/^#/,'&'));
    const recoveryToken=hash.get('access_token');
    if(!recoveryToken){ showAccountNotice('This reset link is no longer valid. Request a new one.','error'); return; }
    if(password.length<6){ showAccountNotice('Password must be at least 6 characters.','error'); resetPasswordEl?.focus(); return; }
    if(password!==confirm){ showAccountNotice('Passwords do not match.','error'); resetConfirmEl?.focus(); return; }
    setBusy(true); showAccountNotice('Updating your password securely…','info');
    try{
      const res=await fetch(`${SUPABASE_URL}/auth/v1/user`,{method:'PUT',headers:authHeaders(recoveryToken),body:JSON.stringify({password})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data.msg||data.error_description||data.error||'Unable to update your password.');
      window.history.replaceState({},document.title,window.location.href.split('#')[0]);
      if(resetPasswordEl) resetPasswordEl.value='';
      if(resetConfirmEl) resetConfirmEl.value='';
      showLogin();
      showAccountNotice('Password updated successfully. You can now log in.','success');
    }catch(err){ showAccountNotice(err.message||'Unable to update your password.','error'); }
    finally{ setBusy(false); }
  }

  function checkRecoveryLink(){
    const hashText=(window.location.hash||'').replace(/^#/,'');
    const hash=new URLSearchParams(hashText);
    const type=hash.get('type');
    const token=hash.get('access_token');
    const errorCode=hash.get('error_code');
    const errorDescription=hash.get('error_description');

    if(errorCode==='otp_expired' || errorCode==='access_denied'){
      loginPanel?.classList.remove('hidden');
      signupPanel?.classList.add('hidden');
      recoveryPanel?.classList.add('hidden');
      resetPanel?.classList.add('hidden');
      showAccountNotice('This password-reset link has expired or is no longer valid. Request a new reset link.','error');
      return;
    }

    if(type==='recovery' && token){
      loginPanel?.classList.add('hidden');
      signupPanel?.classList.add('hidden');
      recoveryPanel?.classList.add('hidden');
      resetPanel?.classList.remove('hidden');
      showAccountNotice('Enter and confirm your new password below.','info');
      resetPasswordEl?.focus();
    }
  }

  window.addEventListener('hashchange',checkRecoveryLink);

  function doLogout(){
    accessToken=''; authenticated=false; tokens=0; currentEmail=''; currentPhone='';
    sessionStorage.removeItem('zuutransDutyAccessToken');
    sessionStorage.removeItem('zuutransDutyEmail');
    sessionStorage.removeItem('zuutransDutyPhone');
    sessionStorage.removeItem(walletKey);
    if(emailEl) emailEl.disabled=false;
    if(passwordEl){ passwordEl.disabled=false; passwordEl.value=''; }
    showAccountNotice('You are logged out. Log in to view your balance or check a vehicle.','info');
    showNotice('Logged out. Your token balance is hidden.','info');
    render();
  }

  loginBtn?.addEventListener('click',doLogin);
  showSignupBtn?.addEventListener('click',showSignup);
  createAccountBtn?.addEventListener('click',doSignup);
  backToLoginBtn?.addEventListener('click',showLogin);
  showRecoveryBtn?.addEventListener('click',showRecovery);
  sendRecoveryBtn?.addEventListener('click',sendRecovery);
  recoveryBackBtn?.addEventListener('click',showLogin);
  resetPasswordBtn?.addEventListener('click',resetPassword);
  logoutBtn?.addEventListener('click',doLogout);

  if(emailEl) emailEl.value=currentEmail;
  render();
  // Handle Supabase password-recovery redirects as soon as the page loads.
  // The previous build defined checkRecoveryLink() but never called it, so
  // valid reset links incorrectly landed customers on the normal login form.
  checkRecoveryLink();

  async function refreshPaymentStatus(reference, attempts=8){
    if(!reference || !SUPABASE_KEY) return false;
    showNotice('Confirming your payment and updating your account…','info');
    for(let attempt=0; attempt<attempts; attempt++){
      try{
        const res=await fetch(STATUS_URL,{method:'POST',headers:authHeaders(),body:JSON.stringify({reference})});
        const data=await res.json().catch(()=>({}));
        if(res.ok && data.success){
          saveTokens(data.token_balance);
          localStorage.removeItem('zuutransDutyPaymentReference');
          sessionStorage.removeItem('zuutransDutyPaymentReference');
          showNotice(`Payment confirmed. Your ZuuTrans wallet now has ${tokens} duty-check token${tokens===1?'':'s'}.`,'success');
          const cleanUrl=window.location.origin+window.location.pathname+'#car-duty';
          window.history.replaceState({},document.title,cleanUrl);
          return true;
        }
        const message=data.error||'Payment confirmation is still pending.';
        if(attempt===attempts-1) throw new Error(message);
      }catch(err){
        if(attempt===attempts-1){ showNotice(err.message||'Payment confirmation is still pending. Please refresh after a short while.','info'); return false; }
      }
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    return false;
  }

  const savedPaymentReference=()=>localStorage.getItem('zuutransDutyPaymentReference')||sessionStorage.getItem('zuutransDutyPaymentReference')||'';
  const params=new URLSearchParams(window.location.search);
  const returnedReference=params.get('reference')||params.get('trxref')||savedPaymentReference();
  if(returnedReference && authenticated) refreshPaymentStatus(returnedReference);

  document.querySelectorAll('.token-buy').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!authenticated){ showNotice('Please create an account or log in before buying tokens.','error'); document.getElementById('duty-token-shop')?.scrollIntoView({behavior:'smooth',block:'center'}); return; }
    const packageMap={1:'starter',5:'standard',10:'business'};
    const count=Number(btn.dataset.tokens||0);
    const price=Number(btn.dataset.price||0);
    const email=currentEmail;
    const phone=currentPhone;
    const packageId=packageMap[count];
    if(!packageId){ showNotice('Invalid duty-check package.','error'); return; }
    setBusy(true);
    showNotice(`Starting secure Paystack checkout for ${count} token${count===1?'':'s'} — GHS ${price}…`,'info');
    try{
      const res=await fetch(INITIALIZE_URL,{method:'POST',headers:authHeaders(),body:JSON.stringify({email,phone,package:packageId})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok || !data.success) throw new Error(data.error||'Unable to start payment.');
      if(!data.authorization_url) throw new Error('Paystack checkout URL was not returned.');
      showNotice('Paystack checkout is ready. Opening secure payment…','success');
      if(data.reference){ localStorage.setItem('zuutransDutyPaymentReference',String(data.reference)); sessionStorage.setItem('zuutransDutyPaymentReference',String(data.reference)); }
      window.location.href=data.authorization_url;
    }catch(err){ showNotice(err.message||'Unable to start payment. Please try again.','error'); setBusy(false); }
  }));

  tabs.forEach(tab=>tab.addEventListener('click',()=>{
    tabs.forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    const type=tab.dataset.dutyTab;
    vinFields.classList.toggle('hidden',type!=='vin');
    detailFields.classList.toggle('hidden',type!=='details');
    report.classList.add('hidden');
  }));

  function setReport(id,value){
    const el=document.getElementById(id);
    if(el) el.textContent=value || 'Not available';
  }

  function money(value){
    return `GHS ${Number(value||0).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  }

  function inferEngineCc(engine){
    const text=String(engine||'');
    const cc=text.match(/(\d{3,4})\s*cc/i);
    if(cc) return Number(cc[1]);
    const liters=text.match(/(\d(?:\.\d)?)\s*L/i);
    if(liters) return Math.round(Number(liters[1])*1000);
    return 0;
  }

  function inferDutyRate(fuel, engineCc){
    const f=String(fuel||'').toLowerCase();
    if(!engineCc) return null;
    if(f.includes('diesel')){
      if(engineCc<=1500) return 5;
      if(engineCc<=2500) return 10;
      return 20;
    }
    if(f.includes('petrol') || f.includes('gasoline') || f.includes('gas')){
      if(engineCc<=1000) return 5;
      if(engineCc<=3000) return 10;
      return 20;
    }
    return null;
  }

  function calculateEstimate({cif, year, fuel, engine}){
    const engineCc=inferEngineCc(engine);
    const rate=inferDutyRate(fuel,engineCc);
    if(!cif || !rate) return null;
    const duty=cif*rate/100;
    const nhil=cif*0.025;
    const getfund=cif*0.025;
    const vat=cif*0.15;
    const other=cif*(0.002+0.005+0.0075+0.02+0.01);
    const currentYear=new Date().getFullYear();
    const age=Math.max(0,currentYear-(Number(year)||currentYear));
    let overageRate=0;
    if(age>10 && age<=12) overageRate=5;
    else if(age>12 && age<=15) overageRate=20;
    else if(age>15 && age<=25) overageRate=50;
    else if(age>25 && age<=35) overageRate=70;
    else if(age>35) overageRate=100;
    const overage=cif*overageRate/100;
    return {rate,engineCc,duty,nhil,getfund,vat,other,overage,overageRate,total:duty+nhil+getfund+vat+other+overage};
  }

  function resetEstimate(){
    ['reportDutyRate','reportDuty','reportNhil','reportGetfund','reportVat','reportOtherLevies','reportOverage','reportTotal'].forEach((id,i)=>setReport(id,i===0?'—':'GHS 0.00'));
  }

  function cleanAutoDevPayload(data){
    // The deployed debug function currently returns autoDevResponse as JSON text.
    let raw=data;
    if(typeof raw==='string'){
      try{ raw=JSON.parse(raw); }catch(_){ raw={}; }
    }
    if(raw && raw.autoDevResponse){
      try{ raw=JSON.parse(raw.autoDevResponse); }catch(_){ raw={}; }
    }
    return raw || {};
  }

  async function decodeVin(vin){
    const res=await fetch(VIN_DECODE_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY},
      body:JSON.stringify({vin})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Unable to decode this VIN.');
    const vehicle=cleanAutoDevPayload(data);
    if(vehicle.error) throw new Error(vehicle.error);
    return vehicle;
  }

  run?.addEventListener('click',async()=>{
    if(!authenticated){
      showNotice('Please login with your email and phone number before checking a vehicle.','error');
      document.getElementById('duty-token-shop')?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    if(tokens<1){
      showNotice('You need at least 1 duty-check token before generating a report. Choose a package above.','error');
      document.getElementById('duty-token-shop')?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }

    const active=document.querySelector('.duty-tab.active')?.dataset.dutyTab||'vin';
    let vehicle='Vehicle details';
    let vin='—';

    if(active==='vin'){
      vin=(document.getElementById('dutyVin')?.value||'').trim().toUpperCase();
      if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)){
        showNotice('Please enter a valid 17-character VIN.','error'); return;
      }

      run.disabled=true;
      run.innerHTML='Decoding VIN…';
      showNotice('Checking the VIN and retrieving vehicle details…','info');

      try{
        const data=await decodeVin(vin);
        const year=data?.vehicle?.year || data?.year || '—';
        const make=data?.vehicle?.make || data?.make || '—';
        const model=data?.vehicle?.model || data?.model || '—';
        const trim=data?.trim || '—';
        const engine=data?.engine || '—';
        const fuel=data?.fuelType || data?.fuel || '—';
        const body=data?.body || data?.style || '—';
        const transmission=data?.transmission || '—';
        const drive=data?.drive || data?.drivetrain || data?.drivenWheels || '—';
        const origin=data?.origin || '—';

        vehicle=`${year} ${make} ${model}`.replace(/\s+/g,' ').trim();
        setReport('reportVehicle',vehicle);
        setReport('reportVin',vin);
        setReport('reportYear',year);
        setReport('reportTrim',trim);
        setReport('reportEngine',engine);
        setReport('reportFuel',fuel);
        setReport('reportBody',body);
        setReport('reportTransmission',transmission);
        setReport('reportDrive',drive);
        setReport('reportOrigin',origin);
        const cif=Number(document.getElementById('dutyCif')?.value||0);
        const estimate=calculateEstimate({cif,year,fuel,engine});
        if(estimate){
          setReport('reportDutyRate',`${estimate.rate}%`);
          setReport('reportDuty',money(estimate.duty));
          setReport('reportNhil',money(estimate.nhil));
          setReport('reportGetfund',money(estimate.getfund));
          setReport('reportVat',money(estimate.vat));
          setReport('reportOtherLevies',money(estimate.other));
          setReport('reportOverage',money(estimate.overage));
          setReport('reportTotal',money(estimate.total));
          setReport('reportMessage','Estimate based on the entered CIF value and published Ghana vehicle-duty rates. Final Customs assessment may differ.');
        } else {
          resetEstimate();
          setReport('reportMessage','Vehicle check completed successfully. Add a CIF value only if you want the tax estimate.');
        }
        report.classList.remove('hidden');
        await consumeToken();
        showNotice(`VIN decoded successfully. 1 token used. You have ${tokens} token${tokens===1?'':'s'} remaining.`,'success');
        report.scrollIntoView({behavior:'smooth',block:'center'});
      }catch(err){
        showNotice(err.message||'VIN decoding failed. Please check the VIN and try again.','error');
      }finally{
        run.disabled=false;
        run.innerHTML='Check My Duty <span>→</span>';
      }
      return;
    }

    const make=(document.getElementById('dutyMake')?.value||'').trim();
    const model=(document.getElementById('dutyModel')?.value||'').trim();
    const year=(document.getElementById('dutyYear')?.value||'').trim();
    if(!make||!model||!year){
      showNotice('Please complete the make, model and year fields.','error'); return;
    }
    vehicle=`${make} ${model} (${year})`;
    setReport('reportVehicle',vehicle);
    setReport('reportVin','Not provided');
    setReport('reportYear',year);
    setReport('reportTrim','Not provided');
    setReport('reportEngine','Not provided');
    setReport('reportFuel','Not provided');
    setReport('reportBody','Not provided');
    setReport('reportTransmission','Not provided');
    setReport('reportDrive','Not provided');
    setReport('reportOrigin','Not provided');
    resetEstimate();
    setReport('reportMessage','Vehicle details saved. CIF value is optional; add it only if you want the tax estimate.');
    report.classList.remove('hidden');
    try{
      await consumeToken();
    }catch(err){
      showNotice(err.message||'Unable to use a duty-check token.','error');
      return;
    }
    showNotice(`Vehicle details are ready. 1 token used. You have ${tokens} token${tokens===1?'':'s'} remaining.`,'success');
    report.scrollIntoView({behavior:'smooth',block:'center'});
  });
})();
