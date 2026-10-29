﻿/* global io */
(function () {
  "use strict";

  // ---------------- state ----------------
  let accessToken = null;
  let currentUser = null; // { id, name, role, ... }
  let socket = null;

  const app = document.getElementById("app");
  const navRight = document.getElementById("navRight");

  // Frontend preferences (independent of backend authentication)
  let language = localStorage.getItem("fc_language") || "en";
  let theme = localStorage.getItem("fc_theme") || "dark";
  const translations = {
    en: {hero:"Sell direct. Price smart. Grow with confidence.", subtitle:"One trusted digital home for farmers and buyers — intelligent crop insights, transparent markets and reliable agricultural information.", start:"Get started", login:"I already have an account", explore:"Explore the platform"},
    hi: {hero:"सीधे बेचें। सही दाम जानें। विश्वास के साथ आगे बढ़ें।",subtitle:"किसानों और खरीदारों के लिए एक डिजिटल मंच — फसल की जानकारी, पारदर्शी बाजार और भरोसेमंद कृषि समाचार।",start:"शुरू करें",login:"मेरा पहले से अकाउंट है",explore:"प्लेटफ़ॉर्म देखें"}
  };
  function applyPreferences() {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;
    document.getElementById("languageToggle").textContent = language === "en" ? "हिंदी" : "English";
    document.getElementById("themeToggle").textContent = theme === "dark" ? "☀ Light" : "☾ Dark";
  }
  document.getElementById("languageToggle").onclick = () => { language = language === "en" ? "hi" : "en"; localStorage.setItem("fc_language",language); applyPreferences(); render(); };
  document.getElementById("themeToggle").onclick = () => { theme = theme === "dark" ? "light" : "dark"; localStorage.setItem("fc_theme",theme); applyPreferences(); };
  applyPreferences();

  // ---------------- API helper ----------------
  async function api(path, { method = "GET", body, isForm = false } = {}, retry = true) {
    const headers = {};
    if (!isForm) headers["Content-Type"] = "application/json";
    if (accessToken) headers["Authorization"] = "Bearer " + accessToken;

    const res = await fetch("/api" + path, {
      method,
      headers,
      credentials: "include", // send the httpOnly refresh cookie
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });

    if (res.status === 401 && retry && path !== "/auth/refresh") {
      const refreshed = await tryRefresh();
      if (refreshed) return api(path, { method, body, isForm }, false);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: res.status, data });
    return data;
  }

  async function tryRefresh() {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
      if (!res.ok) return false;
      const data = await res.json();
      accessToken = data.accessToken;
      currentUser = data.user;
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------------- routing ----------------
  function navigate(hash) {
    window.location.hash = hash;
  }
  window.addEventListener("hashchange", render);

  async function render() {
    const hash = window.location.hash || "#/";
    renderNav();

    if (hash.startsWith("#/module/")) {
      if (!currentUser) return navigate("#/auth");
      return renderModule(hash.split("/")[2]);
    }
    if (hash.startsWith("#/profile")) {
      if (!currentUser) return navigate("#/auth");
      return renderProfile();
    }
    if (hash.startsWith("#/dashboard")) {
      if (!currentUser) return navigate("#/auth");
      return renderDashboard();
    }
    if (hash.startsWith("#/auth")) {
      if (currentUser) return navigate("#/dashboard");
      return renderAuth();
    }
    return renderLanding();
  }

  function renderNav() {
    if (currentUser) {
      navRight.innerHTML = `
        <span class="pill">${esc(currentUser.name)} · ${esc(currentUser.role)}</span>
        <button class="btn ghost small-btn" id="navDashBtn">Dashboard</button>
        <button class="btn ghost small-btn" id="navProfileBtn">My Profile</button>
        <button class="btn danger small-btn" id="navLogoutBtn">Logout</button>`;
      document.getElementById("navDashBtn").onclick = () => navigate("#/dashboard");
      document.getElementById("navProfileBtn").onclick = () => navigate("#/profile");
      document.getElementById("navLogoutBtn").onclick = doLogout;
    } else {
      navRight.innerHTML = `<button class="btn small-btn" id="navAuthBtn">Sign up / Log in</button>`;
      document.getElementById("navAuthBtn").onclick = () => navigate("#/auth");
    }
  }

  // ---------------- landing ----------------
  function renderLanding() {
    const t = translations[language];
    app.innerHTML = `
      <div class="wrap landing-v2">
        <section class="hero hero-v2">
          <div class="eyebrow"><span class="status-dot"></span> FARMCONNECT · SMART AGRICULTURE PLATFORM</div>
          <h1>${t.hero}</h1>
          <p>${t.subtitle}</p>
          <div class="cta-row"><button class="btn" id="ctaStart">${t.start} →</button><button class="btn ghost" id="ctaLogin">${t.login}</button></div>
          <div class="hero-proof"><span>✓ Farmer & Buyer Accounts</span><span>✓ Transparent Marketplace</span><span>✓ AI Modules in Development</span></div>
        </section>
        <section class="section-intro"><div><span class="section-kicker">THE PLATFORM</span><h2>${t.explore}</h2><p>All the tools planned for your agricultural journey, together in one place.</p></div></section>
        <div class="feature-grid" id="tiltGrid">
          ${feature("🔐", "Farmer & Buyer Login", "Secure accounts, role-based access and verification workflow.")}
          ${feature("🌾", "AI Yield Analysis", "Planned image-assisted crop yield estimation with supporting farm data.")}
          ${feature("📈", "Mandi Price Intelligence", "Market-rate tables, dated historical trends and AI forecasting.")}
          ${feature("🩺", "Disease Detection", "A separate crop-leaf image diagnosis module; CNN integration planned.")}
          ${feature("🛒", "Direct Marketplace", "List produce, discover buyers and manage bids and transactions.")}
          ${feature("📰", "Agriculture News", "Approved-source articles with publication dates and source links.")}
          ${feature("🏛️", "Government Schemes", "Scheme eligibility, required documents and official application links.")}
          ${feature("🛡️", "Trust & Reviews", "Verified transactions, reputation, reviews and audit history.")}
          ${feature("🎥", "Farmer Learning Hub", "Hindi and English farming and application tutorials.")}
        </div>
        <section class="bottom-cta"><span class="section-kicker">JOIN FARMCONNECT</span><h2>Better decisions begin with better information.</h2><p>Create a farmer or buyer account to access the existing marketplace.</p><button class="btn" id="bottomStart">Create an account →</button></section>
        <footer class="site-footer"><strong>🌾 FarmConnect</strong><span>Built for transparent, connected agriculture.</span><span>© 2026 FarmConnect</span></footer>
      </div>`;
    document.getElementById("ctaStart").onclick = () => { authMode = "signup"; navigate("#/auth"); };
    document.getElementById("bottomStart").onclick = () => { authMode = "signup"; navigate("#/auth"); };
    document.getElementById("ctaLogin").onclick = () => { authMode = "login"; navigate("#/auth"); };
    initTilt();
  }
  function feature(icon, title, desc) {
    return `<div class="tilt-card"><span class="icon">${icon}</span><h3>${title}</h3><p>${desc}</p></div>`;
  }
  function initTilt() {
    document.querySelectorAll(".tilt-card").forEach((card) => {
      card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateZ(0)`;
      });
      card.addEventListener("mouseleave", () => {
        card.style.transform = "rotateY(0) rotateX(0)";
      });
    });
  }

  // ---------------- auth ----------------
  let authMode = "login"; // or "signup"
  let selectedRole = "farmer";

  function renderAuth() {
    app.innerHTML = `
      <div class="auth-shell">
        <div class="auth-flip">
          <div class="auth-card" id="authCard"></div>
        </div>
      </div>`;
    drawAuthCard();
  }

  function drawAuthCard() {
    const card = document.getElementById("authCard");
    if (authMode === "login") {
      card.innerHTML = `
        <h2>Welcome back</h2>
        <div class="sub">Log in to your FarmConnect account.</div>
        <div id="authError"></div>
        <div class="field"><label>Phone number</label><input id="loginPhone" type="tel" placeholder="10-digit mobile number" /></div>
        <div class="field"><label>Password</label><input id="loginPassword" type="password" placeholder="••••••••" /></div>
        <button class="btn" id="loginBtn" style="width:100%;">Log in</button>
        <div class="switch-auth">New here? <button id="toSignup">Create an account</button></div>`;
      document.getElementById("loginBtn").onclick = doLogin;
      document.getElementById("toSignup").onclick = () => { authMode = "signup"; drawAuthCard(); };
      document.getElementById("loginPassword").addEventListener("keydown", (e) => e.key === "Enter" && doLogin());
    } else {
      card.innerHTML = `
        <h2>Create your account</h2>
        <div class="sub">Takes under a minute.</div>
        <div id="authError"></div>
        <div class="role-toggle">
          <button data-role="farmer" class="${selectedRole === "farmer" ? "sel" : ""}">I'm a Farmer</button>
          <button data-role="buyer" class="${selectedRole === "buyer" ? "sel" : ""}">I'm a Buyer</button>
        </div>
        <div class="field"><label>Full name</label><input id="suName" type="text" placeholder="e.g. Sunita Devi" /></div>
        <div class="field"><label>Phone number</label><input id="suPhone" type="tel" placeholder="10-digit mobile number" /></div>
        <div class="field"><label>Password</label><input id="suPassword" type="password" placeholder="At least 8 characters, with a number" /></div>
        <div class="row2">
          <div class="field"><label>Village/district</label><input id="suVillage" type="text" placeholder="Optional" /></div>
          <div class="field"><label>State</label><input id="suState" type="text" placeholder="Optional" /></div>
        </div>
        <button class="btn" id="signupBtn" style="width:100%;">Create account</button>
        <div class="switch-auth">Already have an account? <button id="toLogin">Log in</button></div>`;
      card.querySelectorAll(".role-toggle button").forEach((b) => {
        b.onclick = () => { selectedRole = b.dataset.role; drawAuthCard(); };
      });
      document.getElementById("signupBtn").onclick = doSignup;
      document.getElementById("toLogin").onclick = () => { authMode = "login"; drawAuthCard(); };
    }
  }

  function showAuthError(msg) {
    document.getElementById("authError").innerHTML = `<div class="error-msg">${esc(msg)}</div>`;
  }

  async function doLogin() {
    const phone = document.getElementById("loginPhone").value.trim();
    const password = document.getElementById("loginPassword").value;
    try {
      const data = await api("/auth/login", { method: "POST", body: { phone, password } });
      accessToken = data.accessToken;
      currentUser = data.user;
      connectSocket();
      navigate("#/dashboard");
    } catch (e) {
      showAuthError(e.data?.details?.[0]?.msg || e.message);
    }
  }

  async function doSignup() {
    const body = {
      name: document.getElementById("suName").value.trim(),
      phone: document.getElementById("suPhone").value.trim(),
      password: document.getElementById("suPassword").value,
      role: selectedRole,
      village: document.getElementById("suVillage").value.trim(),
      state: document.getElementById("suState").value.trim(),
    };
    try {
      const data = await api("/auth/register", { method: "POST", body });
      accessToken = data.accessToken;
      currentUser = data.user;
      connectSocket();
      navigate("#/dashboard");
    } catch (e) {
      showAuthError(e.data?.details?.[0]?.msg || e.message);
    }
  }

  async function doLogout() {
    try { await api("/auth/logout", { method: "POST" }); } catch (e) {}
    accessToken = null;
    currentUser = null;
    if (socket) { socket.disconnect(); socket = null; }
    navigate("#/");
  }

  // ---------------- real-time ----------------
  function connectSocket() {
    if (socket) return;
    socket = io();
    socket.on("activity:pulse", (d) => showToast(d.text));
    socket.on("listing:new", () => { if (location.hash.startsWith("#/dashboard")) renderDashboard(); });
    socket.on("bid:new", () => { if (location.hash.startsWith("#/dashboard")) renderDashboard(); });
  }
  function showToast(text) {
    const feed = document.getElementById("toastFeed");
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<b style="color:var(--grain);">Live</b> — ${esc(text)}`;
    feed.appendChild(t);
    setTimeout(() => t.remove(), 5000);
    while (feed.children.length > 4) feed.removeChild(feed.firstChild);
  }

  // ---------------- persistent profile & honest verification status ----------------
  async function renderProfile() {
    const u = currentUser;
    const farmer = u.role === "farmer";
    const initials = (u.name || "FC").split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();
    const avatar = localStorage.getItem("fc_avatar_" + u.id);
    app.innerHTML = `<div class="wrap profile-page">
      <div class="profile-hero"><button type="button" class="profile-avatar avatar-button" id="avatarPick" aria-label="Change local profile picture">${avatar ? `<img src="${avatar}" alt="Profile picture" />` : esc(initials)}<span class="avatar-edit">✎</span></button><input type="file" id="avatarFile" accept="image/png,image/jpeg,image/webp" hidden />
      <div><span class="section-kicker">FarmConnect · Member Profile</span><h2>${esc(u.name || "Member")}</h2><p>${esc(u.role)} · ${esc([u.village,u.district,u.state].filter(Boolean).join(", ") || "Location not added")}</p><span class="verify-chip pending">Identity verification: provider not connected</span></div></div>
      <div class="profile-grid"><section class="card"><h3>Edit account details</h3><p class="profile-note">These details are saved securely to your existing Firestore user record.</p>
      <form id="profileForm"><div class="field"><label for="pfName">Full name</label><input id="pfName" minlength="2" maxlength="80" required value="${esc(u.name||"")}" /></div>
      <div class="field"><label for="pfVillage">Village / locality</label><input id="pfVillage" maxlength="80" value="${esc(u.village||"")}" /></div>
      <div class="field">
  <label for="pfDistrict">District</label>
  <select id="pfDistrict" required>
    <option value="">Select district</option>
    <option value="__custom">Other district — enter manually</option>
  </select>
  <input id="pfDistrictCustom" maxlength="80"
    placeholder="Enter your district name"
    style="display:none;margin-top:8px" />
</div>
      <div class="field">
  <label for="pfState">State / Union Territory</label>
  <select id="pfState" required>
    <option value="">Select State / UT</option>
    ${[
      "Andaman and Nicobar Islands",
      "Andhra Pradesh",
      "Arunachal Pradesh",
      "Assam",
      "Bihar",
      "Chandigarh",
      "Chhattisgarh",
      "Dadra and Nagar Haveli and Daman and Diu",
      "Delhi",
      "Goa",
      "Gujarat",
      "Haryana",
      "Himachal Pradesh",
      "Jammu and Kashmir",
      "Jharkhand",
      "Karnataka",
      "Kerala",
      "Ladakh",
      "Lakshadweep",
      "Madhya Pradesh",
      "Maharashtra",
      "Manipur",
      "Meghalaya",
      "Mizoram",
      "Nagaland",
      "Odisha",
      "Puducherry",
      "Punjab",
      "Rajasthan",
      "Sikkim",
      "Tamil Nadu",
      "Telangana",
      "Tripura",
      "Uttar Pradesh",
      "Uttarakhand",
      "West Bengal"
    ].map(s => `<option value="${esc(s)}" ${u.state === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
  </select>
</div>
      ${farmer ? `
<div class="field">
  <label for="pfGender">Gender</label>
  <select id="pfGender">
    ${[
      ["", "Select gender"],
      ["male", "Male"],
      ["female", "Female"],
      ["other", "Other"],
      ["prefer_not_to_say", "Prefer not to say"]
    ].map(([v, t]) => `<option value="${v}" ${u.gender === v ? "selected" : ""}>${t}</option>`).join("")}
  </select>
</div>

<div class="field">
  <label for="pfLandHolding">Land Holding Category</label>
  <select id="pfLandHolding">
    ${[
      ["", "Select category"],
      ["marginal", "Marginal"],
      ["small", "Small"],
      ["semi_medium", "Semi-medium"],
      ["medium", "Medium"],
      ["large", "Large"]
    ].map(([v, t]) => `<option value="${v}" ${u.landHolding === v ? "selected" : ""}>${t}</option>`).join("")}
  </select>
</div>

<div class="field">
  <label for="pfLandArea">Land Area</label>
  <input id="pfLandArea" type="number" min="0" max="100000"
    step="any" placeholder="Enter land area"
    value="${u.landArea ?? ""}" />
</div>

<div class="field">
  <label for="pfLandUnit">Land Area Unit</label>
  <select id="pfLandUnit">
    <option value="">Select unit</option>
    <option value="acre" ${u.landUnit === "acre" ? "selected" : ""}>Acre</option>
    <option value="hectare" ${u.landUnit === "hectare" ? "selected" : ""}>Hectare</option>
  </select>
</div>

<div class="field">
  <label for="pfFarmerId">Farmer / Kisan ID (self-declared)</label>
  <input id="pfFarmerId" maxlength="50"
    pattern="[A-Za-z0-9/_-]*"
    autocomplete="off"
    placeholder="Enter Farmer ID, if available"
    value="${esc(u.farmerId || "")}" />
  <small>Do not enter your Aadhaar number here. This field is not government verification.</small>
</div>
` : ""}
<button class="btn" id="pfSave" type="submit">Save profile</button><p id="pfMessage" class="profile-note" role="status"></p></form></section>
      <section class="card"><h3>Verification centre</h3><div id="verificationStatus" aria-live="polite">Checking verification availability…</div><p class="profile-note">Do not upload Aadhaar, land records or bank documents here. Authorized provider integration and consent workflow are required first.</p></section>
      <section class="card"><h3>Profile picture</h3><p class="profile-note">Your photo is stored in this browser only; it is not uploaded to Firestore or verified.</p><button type="button" class="btn ghost" id="profilePhotoButton">Add / Change Profile Photo</button></section>
      <section class="card"><h3>Transactions & invoices</h3><p class="profile-note">Verified payment records and invoices require an order/payment integration. No simulated transaction history is shown.</p><button class="btn ghost" id="backToDash">← Back to dashboard</button></section></div></div>`;
    if (typeof window.initProfileDistricts === "function") {
      window.initProfileDistricts(u.state || "", u.district || "");
    }    document.getElementById("backToDash").onclick = () => navigate("#/dashboard");
    document.getElementById("profileForm").onsubmit = async e => {
      e.preventDefault(); const btn=document.getElementById("pfSave"), msg=document.getElementById("pfMessage"); btn.disabled=true; msg.textContent="Saving…";
      try { const result=await api("/auth/profile", {method:"PATCH",body:{
  name:document.getElementById("pfName").value,
  village:document.getElementById("pfVillage").value,
  district:document.getElementById("pfDistrict").value,
  state:document.getElementById("pfState").value,
  ...(farmer ? {
    gender:document.getElementById("pfGender").value,
    landHolding:document.getElementById("pfLandHolding").value,
    landArea:document.getElementById("pfLandArea").value === "" ? null : Number(document.getElementById("pfLandArea").value),
    landUnit:document.getElementById("pfLandUnit").value,
    farmerId:document.getElementById("pfFarmerId").value.trim()
  } : {})
}}); currentUser=result.user; msg.textContent="Profile saved in Firestore successfully."; renderNav(); }
      catch(err) { msg.textContent=err.message || "Could not save profile"; } finally { btn.disabled=false; }
    };
    document.getElementById("profilePhotoButton").onclick=()=>document.getElementById("avatarFile").click();
    document.getElementById("avatarPick").onclick=()=>document.getElementById("avatarFile").click();
    document.getElementById("avatarFile").onchange=event=>{const file=event.target.files[0];if(!file)return;if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>1024*1024)return showToast("Use JPG/PNG/WebP under 1 MB.");const reader=new FileReader();reader.onload=()=>{localStorage.setItem("fc_avatar_"+u.id,reader.result);renderProfile();showToast("Photo saved in this browser only.");};reader.readAsDataURL(file);};
    try { const s=await api("/auth/verification-status"); const box=document.getElementById("verificationStatus");if(box)box.innerHTML=`<div class="verify-row"><strong>Identity check</strong><span class="verify-chip pending">${esc(s.identityStatus)}</span></div><div class="verify-row"><strong>${farmer?"Landholding / farmer ID":"Business details"}</strong><span class="verify-chip pending">${esc(s.landOrBusinessStatus)}</span></div><p class="profile-note">${esc(s.message)}</p>`; }
    catch(err) {const box=document.getElementById("verificationStatus");if(box)box.textContent="Verification status unavailable: "+err.message;}
  }

  const modules = [
    ["verification","🛡️","Verification","Identity and farmer-status checks"],
    ["yield","🌾","Yield Prediction","Trained national historical baseline"],
    ["disease","🔬","Disease Scanner","Separate image classifier pending"],
    ["prices","📈","Market Rates","Price history and data provenance"],
    ["schemes","🏛️","Government Schemes","Existing matching API"],
    ["news","📰","Agriculture News","Official RSS updates and source links"],
    ["ledger","📋","Trust Ledger","Verified transactions pending"],
    ["tutorials","▶️","Learning Hub","Official learning resources and videos"]
  ];
  function moduleCards() { return modules.map(([id,icon,name,desc])=>`<a class="module-card" href="#/module/${id}"><span class="module-icon">${icon}</span><strong>${name}</strong><small>${desc}</small><span class="module-arrow">Open →</span></a>`).join(""); }
  async function renderModule(id) {
    if (!modules.some(m=>m[0]===id)) return navigate("#/dashboard");
    if (id === "verification") return navigate("#/profile");
    const m = modules.find(x=>x[0]===id);
    app.innerHTML = `<div class="wrap module-page"><a class="profile-link" href="#/dashboard">← Dashboard</a><div class="module-heading"><span class="module-icon">${m[1]}</span><div><h2>${m[2]}</h2><p>${m[3]}</p></div></div><div id="moduleContent" class="card"><p class="hint">Loading…</p></div></div>`;
    const el=document.getElementById("moduleContent");
    if (id === "yield") {
      el.innerHTML=`<h3>National crop-yield estimate</h3><p class="hint">Experimental All-India historical baseline. This is NOT a district-level forecast or image CNN. Supply the actual previous-year yield from a trusted record.</p><div id="yieldStatus" class="hint">Checking local trained model…</div><form id="yieldForm"><div class="field"><label for="yieldCrop">Crop</label><select id="yieldCrop" required><option value="">Loading crops…</option></select></div><div class="field"><label for="yieldSeason">Season</label><select id="yieldSeason" required><option value="">Choose season</option></select></div><div class="field"><label for="yieldYear">Target crop year (start year)</label><input id="yieldYear" type="number" min="2025" max="2030" value="2025" required /></div><div class="field"><label for="yieldPrevious">Previous year's yield (kg/hectare)</label><input id="yieldPrevious" type="number" min="1" max="1000000" step="any" placeholder="e.g. 2800" required /></div><div class="field"><label for="yieldArea">Your cultivated area (hectares)</label><input id="yieldArea" type="number" min="0.001" max="100000" step="any" placeholder="e.g. 1.5" required /></div><div class="field"><label for="yieldPhoto">Field photo (optional · JPEG/PNG/WebP · max 5 MB)</label><input id="yieldPhoto" type="file" accept="image/jpeg,image/png,image/webp"/><small class="hint">Photo is checked for format and dimensions only. It is NOT used by the trained yield model; no CNN has been trained for image-based yield.</small><div id="yieldPhotoPreview" aria-live="polite"></div></div><button class="btn" type="submit" id="yieldSubmit" disabled>Estimate yield</button></form><div id="yieldResult" class="module-results" aria-live="polite"></div>`;
      const crop=document.getElementById('yieldCrop'),season=document.getElementById('yieldSeason'),status=document.getElementById('yieldStatus'),submit=document.getElementById('yieldSubmit');let pairs=[];
      try {const r=await api('/yield/status');if(!r.ready){status.textContent=r.message||'Model unavailable. Copy trained yield_model.joblib to ml/artifacts/ and install Python dependencies.';return;}pairs=r.pairs||[];const crops=[...new Set(pairs.map(p=>p.crop))].sort();crop.innerHTML='<option value="">Select crop</option>'+crops.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');status.textContent='Model found · '+pairs.length+' supported crop-season combinations. Only crop-season pairs in historical dataset are available.';submit.disabled=false;}catch(e){status.textContent='Model status unavailable: '+e.message;return;}
      crop.onchange=()=>{const seasons=[...new Set(pairs.filter(p=>p.crop===crop.value).map(p=>p.season))].sort();season.innerHTML='<option value="">Select season</option>'+seasons.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');};
      const photoInput=document.getElementById('yieldPhoto'),photoPreview=document.getElementById('yieldPhotoPreview');let photoReady=false;
      photoInput.onchange=()=>{photoReady=false;photoPreview.replaceChildren();const file=photoInput.files&&photoInput.files[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024||!file.size){photoPreview.textContent='Choose a JPEG, PNG or WebP photo smaller than 5 MB.';photoInput.value='';return;}const img=new Image();const url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);if(img.naturalWidth<320||img.naturalHeight<320){photoPreview.textContent='Image too small: minimum 320 × 320 pixels.';photoInput.value='';return;}photoReady=true;img.style.cssText='display:block;max-width:320px;max-height:240px;object-fit:contain;border-radius:12px;margin:12px 0';photoPreview.append(img);const msg=document.createElement('p');msg.className='hint';msg.textContent='Photo preview ready ('+img.naturalWidth+' × '+img.naturalHeight+'). This image is not used in the numerical prediction.';photoPreview.append(msg);};img.onerror=()=>{URL.revokeObjectURL(url);photoInput.value='';photoPreview.textContent='Cannot decode this image.';};img.src=url;};
      document.getElementById('yieldForm').onsubmit=async ev=>{ev.preventDefault();const target=document.getElementById('yieldResult');if(photoInput.files.length&&!photoReady){target.textContent='Please select a valid field photo or clear the photo field.';return;}submit.disabled=true;target.textContent='Running trained numerical model…';try{const r=await api('/yield/predict',{method:'POST',body:{crop:crop.value,season:season.value,year:Number(document.getElementById('yieldYear').value),previousYield:Number(document.getElementById('yieldPrevious').value),areaHectares:Number(document.getElementById('yieldArea').value)}});target.innerHTML=`<h3>Estimated yield: ${esc(r.predictedYieldKgHa.toLocaleString('en-IN',{maximumFractionDigits:2}))} kg/hectare</h3><p>Estimated total: <strong>${esc(r.estimatedProductionQuintals.toLocaleString('en-IN',{maximumFractionDigits:2}))} quintals</strong> (${esc(r.areaHectares)} hectares)</p><p class="hint">${esc(r.notice)} Model input: ${esc(r.previousYieldKgHa)} kg/ha in previous year. Prediction is not a guaranteed harvest.</p><p class="hint">${photoReady?"Field photo previewed locally; photo was NOT analyzed or used in this estimate.":"No field photo attached; numerical model only."}</p>`;}catch(e){target.textContent='Prediction unavailable: '+e.message;}finally{submit.disabled=false;}};
    } else if (id === "schemes") {

  el.innerHTML = `
    <section class="scheme-hub">
      <h3>Government Scheme Hub</h3>
      <p class="hint">
        Explore verified government agriculture schemes,
        eligibility, required documents and application tutorials.
      </p>

      <div class="mandi-actions">
        <button class="btn" id="loadSchemes">Explore Schemes</button>
        <button class="btn ghost" id="matchSchemes">
          Check My Eligibility
        </button>
      </div>

      <div id="schemeResults" class="module-results" aria-live="polite"></div>
    </section>
  `;

  const results = document.getElementById("schemeResults");

  const safeUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  };

  const renderList = (items) => {
    if (!Array.isArray(items) || !items.length) {
      return "<p>No verified schemes are published yet. Please check again later.</p>";
    }

    return items.map((s) => {
      const benefits = Array.isArray(s.benefits) ? s.benefits : [];
      const eligibility = Array.isArray(s.eligibility) ? s.eligibility : [];
      const documents = Array.isArray(s.documents) ? s.documents : [];
      const tutorial = Array.isArray(s.tutorial) ? s.tutorial : [];

      const list = (values, ordered = false) => {
        if (!values.length) return "<p>Details not available yet.</p>";

        const tag = ordered ? "ol" : "ul";

        return `<${tag}>${values.map(v =>
          `<li>${esc(typeof v === "string" ? v : JSON.stringify(v))}</li>`
        ).join("")}</${tag}>`;
      };

      const official = safeUrl(s.officialUrl);
      const source = safeUrl(s.sourceUrl);

      return `
        <article class="verify-row" style="display:block;margin:14px 0;padding:18px">
          <h3>${esc(s.name || "Government Scheme")}</h3>
          <p class="hint">${esc(s.authority || "Government authority")}</p>
          <p>${esc(s.description || "")}</p>

          <details>
            <summary>Benefits</summary>
            ${list(benefits)}
          </details>

          <details>
            <summary>Eligibility</summary>
            ${list(eligibility)}
          </details>

          <details>
            <summary>Required Documents</summary>
            ${list(documents)}
          </details>

          <details>
            <summary>How to Apply — Step-by-Step Tutorial</summary>
            ${list(tutorial, true)}
          </details>

          <p class="hint">
            Last verified:
            ${esc(s.lastVerifiedAt
              ? new Date(s.lastVerifiedAt._seconds
                  ? s.lastVerifiedAt._seconds * 1000
                  : s.lastVerifiedAt).toLocaleDateString("en-IN")
              : "Not recorded")}
          </p>

          ${official
            ? `<a class="btn" href="${esc(official)}" target="_blank" rel="noopener noreferrer">Official Apply Portal</a>`
            : `<p class="hint">Official application link unavailable.</p>`}

          ${source
            ? `<p><a href="${esc(source)}" target="_blank" rel="noopener noreferrer">View official source</a></p>`
            : ""}
        </article>
      `;
    }).join("");
  };

  document.getElementById("loadSchemes").onclick = async () => {
    results.textContent = "Loading verified government schemes…";

    try {
      const data = await api("/schemes");
      results.innerHTML = renderList(data.schemes);
    } catch (error) {
      results.textContent = "Unable to load schemes: " + error.message;
    }
  };

  document.getElementById("matchSchemes").onclick = async () => {
    results.textContent = "Checking your saved farmer profile…";

    try {
      const data = await api("/schemes/match", {
        method: "POST",
        body: {}
      });

      const matches = Array.isArray(data.matches) ? data.matches : [];

      results.innerHTML = matches.length
        ? matches.map(s => `
            <div class="verify-row">
              <strong>${esc(s.name || "Scheme")}</strong>
              <p>${esc(s.description || "")}</p>
              <span>${s.eligible ? "Potential match" : "Eligibility conditions not met"}</span>
              <p>${esc((s.reasons || []).join("; "))}</p>
            </div>
          `).join("")
        : "<p>No schemes found for your saved farmer profile.</p>";

    } catch (error) {
      results.textContent = "Eligibility check failed: " + error.message;
    }
  };
} else if(id === "prices") {
      el.innerHTML=`<div class="mandi-shell"><div class="mandi-heading"><span class="mandi-kicker">🇮🇳 BHARAT AGRI INTELLIGENCE</span><h3>Explore mandi prices across India</h3><p>Official published data.gov.in mandi prices · ₹/quintal where reported · not streaming real-time quotes.</p></div><div class="mandi-fields"><div class="field"><label for="priceCrop">Crop / Commodity</label><select id="priceCrop"><option value="">All crops (nationwide)</option><option value="Wheat">Wheat (गेहूँ)</option><option value="Rice">Rice (चावल)</option><option value="Paddy(Dhan)(Common)">Paddy / Dhan (धान)</option><option value="Maize">Maize (मक्का)</option><option value="Bajra(Pearl Millet/Cumbu)">Bajra (बाजरा)</option><option value="Jowar(Sorghum)">Jowar (ज्वार)</option><option value="Barley (Jau)">Barley (जौ)</option><option value="Gram Raw(Chholia)">Gram / Chana (चना)</option><option value="Arhar (Tur/Red Gram)(Whole)">Arhar / Tur (अरहर)</option><option value="Moath Dal">Moath Dal</option><option value="Mustard">Mustard (सरसों)</option><option value="Soyabean">Soyabean (सोयाबीन)</option><option value="Groundnut">Groundnut (मूंगफली)</option><option value="Cotton">Cotton (कपास)</option><option value="Sugarcane">Sugarcane (गन्ना)</option><option value="Potato">Potato (आलू)</option><option value="Onion">Onion (प्याज)</option><option value="Tomato">Tomato (टमाटर)</option><option value="Garlic">Garlic (लहसुन)</option><option value="Ginger(Green)">Ginger (अदरक)</option><option value="Green Chilli">Green Chilli (हरी मिर्च)</option><option value="Banana">Banana (केला)</option><option value="Apple">Apple (सेब)</option><option value="Mango">Mango (आम)</option><option value="__custom">Other crop — enter official name</option></select><input id="priceCropCustom" maxlength="80" placeholder="Official commodity name" style="display:none;margin-top:8px" /></div><div class="field"><label for="priceState">State / UT</label><select id="priceState"><option value="">All India — all states</option><option value="Andaman and Nicobar Islands">Andaman and Nicobar Islands</option><option value="Andhra Pradesh">Andhra Pradesh</option><option value="Arunachal Pradesh">Arunachal Pradesh</option><option value="Assam">Assam</option><option value="Bihar">Bihar</option><option value="Chandigarh">Chandigarh</option><option value="Chhattisgarh">Chhattisgarh</option><option value="Dadra and Nagar Haveli and Daman and Diu">Dadra and Nagar Haveli and Daman and Diu</option><option value="Delhi">Delhi</option><option value="Goa">Goa</option><option value="Gujarat">Gujarat</option><option value="Haryana">Haryana</option><option value="Himachal Pradesh">Himachal Pradesh</option><option value="Jammu and Kashmir">Jammu and Kashmir</option><option value="Jharkhand">Jharkhand</option><option value="Karnataka">Karnataka</option><option value="Kerala">Kerala</option><option value="Ladakh">Ladakh</option><option value="Lakshadweep">Lakshadweep</option><option value="Madhya Pradesh">Madhya Pradesh</option><option value="Maharashtra">Maharashtra</option><option value="Manipur">Manipur</option><option value="Meghalaya">Meghalaya</option><option value="Mizoram">Mizoram</option><option value="Nagaland">Nagaland</option><option value="Odisha">Odisha</option><option value="Puducherry">Puducherry</option><option value="Punjab">Punjab</option><option value="Rajasthan">Rajasthan</option><option value="Sikkim">Sikkim</option><option value="Tamil Nadu">Tamil Nadu</option><option value="Telangana">Telangana</option><option value="Tripura">Tripura</option><option value="Uttar Pradesh">Uttar Pradesh</option><option value="Uttarakhand">Uttarakhand</option><option value="West Bengal">West Bengal</option></select></div><div class="field"><label for="priceDistrict">District</label><select id="priceDistrict"><option value="">All districts</option></select><input id="priceDistrictCustom" maxlength="80" placeholder="Type official district name" style="display:none;margin-top:8px"/><small id="districtHelp">Choose a state, then load available district names.</small></div><div class="field"><label for="priceMarket">Mandi / Market (optional)</label><input id="priceMarket" list="marketSuggestions" placeholder="Any mandi or type exact name" maxlength="80"/><datalist id="marketSuggestions"></datalist></div><div class="field"><label for="priceDateMode">Price Date</label><select id="priceDateMode"><option value="latest">Latest Available</option><option value="exact">Select Date</option></select></div><div class="field" id="priceDateField" style="display:none"><label for="priceDate">Published Date</label><input type="date" id="priceDate"/></div></div><div class="mandi-actions"><button class="btn" id="priceLookup">Fetch official prices</button><button class="btn ghost" id="priceReset">Reset · All India</button></div><div id="priceResult" class="module-results" aria-live="polite"></div></div>`;
      const byId=id=>document.getElementById(id);
      byId("priceDateMode").onchange=()=>{byId("priceDateField").style.display=byId("priceDateMode").value==="exact"?"block":"none";};byId("priceCrop").onchange=()=>{const other=byId("priceCrop").value==="__custom";byId("priceCropCustom").style.display=other?"block":"none";};
      async function getDistricts(){
        const state=byId("priceState").value, district=byId("priceDistrict"), help=byId("districtHelp");
        district.innerHTML='<option value="">All districts</option>';byId("priceMarket").value="";byId("marketSuggestions").innerHTML="";
        if(!state){help.textContent="Choose a state to load its published districts.";return;}
        district.disabled=true;help.textContent="Loading districts for "+state+"…";
        try {
          const r=await api('/mandi/districts?'+new URLSearchParams({state}));
          if(byId("priceState").value!==state)return;
          (r.districts||[]).forEach(x=>district.add(new Option(x,x)));
          district.add(new Option('My district is missing — type it','__custom'));
          help.textContent=(r.districts||[]).length+" district names found in sampled published mandi records"+(r.partial?" (sample, not complete directory).":" .");
        }catch(e){district.add(new Option('Type district manually','__custom'));help.textContent='District suggestions unavailable. You can enter your district manually.';}
        finally{if(byId("priceState").value===state)district.disabled=false;}
      }
      byId("priceDistrict").onchange=()=>{byId("priceDistrictCustom").style.display=byId("priceDistrict").value==="__custom"?"block":"none";};
      byId("priceState").onchange=getDistricts;
      byId("priceReset").onclick=()=>{byId("priceDateMode").value="latest";byId("priceDate").value="";byId("priceDateField").style.display="none";byId("priceCrop").value="";byId("priceCropCustom").style.display="none";byId("priceState").value="";byId("priceDistrict").innerHTML='<option value="">All districts</option>';byId("priceDistrictCustom").style.display="none";byId("priceDistrictCustom").value="";byId("priceMarket").value="";byId("priceResult").textContent="All India selected. Click Fetch official prices.";};
      async function loadPrices(offset=0){const selected=byId("priceCrop").value,crop=(selected==="__custom"?byId("priceCropCustom").value:selected).trim(),target=byId("priceResult");if(selected==="__custom"&&!crop){target.textContent="Enter official crop name.";return;}const q=new URLSearchParams({offset:String(offset)});if(byId("priceDateMode").value==="exact"){const d=byId("priceDate").value;if(!d){target.textContent="Please select a published date.";return;}q.set("date",d);}if(crop)q.set("crop",crop);for(const [field,id] of [["state","priceState"],["district","priceDistrict"],["market","priceMarket"]]){const v=(field==="district" && byId(id).value==="__custom"?byId("priceDistrictCustom").value:byId(id).value).trim();if(v)q.set(field,v);}target.textContent="Loading official records…";try{const r=await api('/mandi?'+q),rows=r.records||[],total=r.total==null?'not supplied':Number(r.total).toLocaleString('en-IN');target.innerHTML=`<p class="hint">Source: ${esc(r.source)} · Fetched ${esc(new Date(r.fetchedAt).toLocaleString('en-IN'))} · Records ${offset+1}–${offset+rows.length} · Total: ${total}. ${r.cached?'Cached (15 min).':''} Published dates vary by row.</p>`+(rows.length?`<div class="mandi-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>State</th><th>District</th><th>Market</th><th>Crop</th><th>Variety</th><th>Min ₹</th><th>Max ₹</th><th>Modal ₹</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.arrivalDate||'—')}</td><td>${esc(x.state)}</td><td>${esc(x.district)}</td><td>${esc(x.market)}</td><td>${esc(x.commodity)}</td><td>${esc(x.variety)}</td><td>${esc(x.minPrice??'—')}</td><td>${esc(x.maxPrice??'—')}</td><td>${esc(x.modalPrice??'—')}</td></tr>`).join('')}</tbody></table></div>`:'No matching records in this page. Try removing filters.')+`<div class="mandi-actions"><button class="btn ghost" id="mandiPrev" ${offset===0?'disabled':''}>← Previous 100</button><button class="btn" id="mandiNext" ${!r.hasMore?'disabled':''}>Next 100 →</button></div>`;byId('mandiPrev').onclick=()=>loadPrices(Math.max(0,offset-100));byId('mandiNext').onclick=()=>loadPrices(offset+100);}catch(e){target.textContent='Mandi API: '+e.message;}}
      byId("priceLookup").onclick=()=>loadPrices(0);
    } else if(id === "disease") {
      el.innerHTML=`<h3>Crop image screening</h3><p class="hint">Existing backend image-analysis endpoint. Without a configured trained model, results are only a colour-based leaf-vigour heuristic — NOT a disease diagnosis.</p><form id="scanForm"><div class="field"><label>Select a leaf image (max 8 MB)</label><input id="scanPhoto" type="file" accept="image/png,image/jpeg,image/webp" required /></div><button class="btn" type="submit">Analyze image</button></form><div id="scanResult" class="module-results" aria-live="polite"></div>`;
      document.getElementById("scanForm").onsubmit = async (e) => {
        e.preventDefault();

        const file = document.getElementById("scanPhoto").files[0];
        const target = document.getElementById("scanResult");

        if (!file || file.size > 10 * 1024 * 1024) {
          target.textContent = "Choose an image under 10 MB.";
          return;
        }

        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          target.textContent = "Only JPG, PNG or WebP images are supported.";
          return;
        }

        const fd = new FormData();
        fd.append("image", file);

        target.textContent = "Analyzing with trained CNN...";

        try {
          const response = await fetch("/api/crop-disease/predict", {
            method: "POST",
            body: fd,
            credentials: "same-origin"
          });

          const r = await response.json();

          if (!response.ok || !r.success) {
            throw new Error(r.error || "Prediction failed");
          }

          target.replaceChildren();

          const heading = document.createElement("h3");
          heading.textContent = "AI Crop Disease Detection";
          target.appendChild(heading);

          const result = document.createElement("p");
          result.textContent =
            "Crop: " + r.prediction.crop +
            " | Condition: " + r.prediction.condition +
            " | Confidence: " + r.prediction.confidence + "%";
          target.appendChild(result);

          const title = document.createElement("h4");
          title.textContent = "Top 3 Predictions";
          target.appendChild(title);

          const list = document.createElement("ol");

          (r.top3 || []).forEach(item => {
            const li = document.createElement("li");
            li.textContent =
              item.crop + " - " + item.condition +
              " (" + item.confidence + "%)";
            list.appendChild(li);
          });

          target.appendChild(list);

          const note = document.createElement("p");
          note.className = "hint";
          note.textContent = r.disclaimer ||
            "Experimental AI screening. Consult an agricultural expert before treatment.";
          target.appendChild(note);

        } catch (err) {
          target.textContent = "CNN scan failed: " + err.message;
        }
      };
    } else if(id === "ledger") {
      el.innerHTML=`<h3>Your account reviews</h3><p class="hint">Existing review and trust records, not payment or invoice verification.</p><div id="reviewResult" aria-live="polite">Loading…</div>`;
      try{const r=await api("/reviews/"+encodeURIComponent(currentUser.id||currentUser._id));const reviews=Array.isArray(r.reviews)?r.reviews:[];document.getElementById("reviewResult").innerHTML=`<p>${reviews.length} review(s)</p>`+(reviews.length?reviews.map(x=>`<div class="verify-row"><strong>${esc(x.rating||"—")}/5 · ${esc(x.author?.name||"User")}</strong><span>${esc(x.comment||"")}</span></div>`).join(""):"No reviews yet. Payment ledger and invoices are not integrated.");}catch(e){document.getElementById("reviewResult").textContent="Unable to load reviews: "+e.message;}
    } else if(id === "news") {
      el.innerHTML=`<div class="news-heading"><div><span class="section-kicker">FARMCONNECT · AGRI UPDATES</span><h3>Latest Agriculture News</h3><p class="hint">Official publisher releases, filtered for agriculture. Dates reflect publisher publication time.</p></div><button class="btn" id="refreshNews">↻ Refresh feed</button></div><div id="newsResults" class="module-results" aria-live="polite">Loading official feed…</div>`;
      const loadNews=async()=>{const target=document.getElementById("newsResults");target.textContent="Loading latest available agriculture articles…";try{const r=await api("/integrations/news");const rows=r.articles||[];target.innerHTML=`<p class="hint">${esc(r.source||"Official source")} · ${esc(r.status||"unknown")}${r.fetchedAt?" · Last checked "+esc(new Date(r.fetchedAt).toLocaleString("en-IN")):""}</p>`+(rows.length?`<div class="news-feed">${rows.map(x=>`<article class="news-story"><span class="news-source">🌾 ${esc(x.source||r.source||"Official publisher")}</span><h3>${esc(x.title)}</h3><p class="news-date">${esc(x.publishedAt?(isNaN(Date.parse(x.publishedAt))?x.publishedAt:new Date(x.publishedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})):"Publication date unavailable")}</p><p>${esc(x.summary||"Open the publisher's original article for full details.")}</p><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Read full article ↗</a></article>`).join("")}</div>`:`<div class="news-story"><h3>No articles available right now</h3><p>${esc(r.message||"The official feed returned no matching agriculture stories. Try Refresh later.")}</p><a href="https://www.pib.gov.in/AllRelease.aspx?MenuId=286&lang=1&reg=6" target="_blank" rel="noopener noreferrer">Browse official Agriculture Ministry releases ↗</a></div>`);}catch(e){target.innerHTML=`<div class="news-story"><h3>Official feed temporarily unavailable</h3><p>${esc(e.message)}</p><a href="https://www.pib.gov.in/AllRelease.aspx?MenuId=286&lang=1&reg=6" target="_blank" rel="noopener noreferrer">Read Agriculture Ministry releases directly ↗</a></div>`;}};
      document.getElementById("refreshNews").onclick=loadNews;loadNews();
    } else if(id === "tutorials") {
      el.innerHTML=`<h3>Farmer Learning Hub</h3><p class="hint">Search videos on official publisher channels. These are YouTube search links, not individually reviewed video endorsements.</p><div class="learning-grid"><div class="verify-row"><strong>ICAR farming tutorials</strong><a href="https://www.youtube.com/results?search_query=ICAR+official+farming+tutorial+hindi" target="_blank" rel="noopener noreferrer">Find Hindi videos ↗</a></div><div class="verify-row"><strong>Krishi Vigyan Kendra training</strong><a href="https://www.youtube.com/results?search_query=Krishi+Vigyan+Kendra+official+training" target="_blank" rel="noopener noreferrer">Find training videos ↗</a></div><div class="verify-row"><strong>Crop disease management</strong><a href="https://www.youtube.com/results?search_query=ICAR+crop+disease+management" target="_blank" rel="noopener noreferrer">Find crop health videos ↗</a></div><div class="verify-row"><strong>Government agriculture portals</strong><a href="https://icar.gov.in/" target="_blank" rel="noopener noreferrer">ICAR ↗</a><a href="https://pmkisan.gov.in/" target="_blank" rel="noopener noreferrer">PM-KISAN ↗</a><a href="https://www.myscheme.gov.in/" target="_blank" rel="noopener noreferrer">myScheme ↗</a></div></div>`;
    } else {
      const descriptions={yield:"A trained CNN plus crop, field area, crop stage and historical yield data are required. No prediction will be simulated.",news:"A publisher-approved news feed and source validation are not connected yet."};
      el.innerHTML=`<h3>Integration pending</h3><p>${descriptions[id]}</p><p class="hint">No live service or trained model is claimed.</p>`;
    }
  }

  // ---------------- dashboard ----------------
  async function renderDashboard() {
    if (currentUser.role === "admin") return renderAdminDashboard();
    if (currentUser.role === "farmer") return renderFarmerDashboard();
    return renderBuyerDashboard();
  }

  async function renderFarmerDashboard() {
    app.innerHTML = `<div class="wrap">
      <section class="dashboard-hero"><div class="hero-copy"><span class="eyebrow"><span class="status-dot"></span> FARMCONNECT · FARMER SPACE</span><h2>Grow smarter.<br><em>Sell with confidence.</em></h2><p>Manage your crops, explore market intelligence and access your agricultural tools in one place.</p><div class="hero-actions"><a class="btn" href="#/profile">My profile & verification ↗</a><a class="btn ghost" href="#/module/prices">Explore mandi prices ↗</a></div></div><div class="hero-art" aria-hidden="true"><div class="sun-orbit"></div><span class="field-symbol">🌾</span><div class="hero-art-label">CROP · MARKET · GROWTH</div></div></section><div class="section-heading"><div><span class="section-kicker">YOUR WORKSPACE</span><h2>Explore FarmConnect</h2></div><span class="section-caption">Select a card to open its section</span></div>
      <div class="module-grid">${moduleCards()}</div>
      <div class="grid2">
        <div class="card">
          <h3>Your listings</h3>
          <div id="myListings" class="empty">Loading…</div><h3 style="margin-top:22px">Incoming offers & deal history</h3><div id="farmerTrades">Loading…</div>
        </div>
        <div class="card">
          <h3>List a new crop</h3>
          <div class="field"><label>Crop</label><input id="lCrop" placeholder="e.g. Wheat" /></div>
          <div class="row2">
            <div class="field"><label>Quantity (quintals)</label><input id="lQty" type="number" /></div>
            <div class="field"><label>Asking price (₹/quintal)</label><input id="lPrice" type="number" /></div>
          </div>
          <button class="btn" style="width:100%;" id="postBtn">Post listing</button>
          <p class="hint" id="postHint"></p>
        </div>
      </div>
    </div>`;
    document.getElementById("postBtn").onclick = postListing;
    loadMyListings();
    loadTrades("farmerTrades");
  }

  async function loadMyListings() {
    try {
      const listings = await api("/listings?status=open");
      const mine = listings.filter((l) => l.farmer?._id === currentUser.id || l.farmer === currentUser.id);
      const el = document.getElementById("myListings");
      el.className = "";
      el.innerHTML = mine.length
        ? mine.map((l) => `<div class="listing-row"><div><b>${esc(l.crop)}</b><div class="hint">${l.quantityQuintals}q · ${esc(l.status)}</div></div><div class="price">₹${l.askingPricePerQuintal}</div></div>`).join("")
        : `<div class="empty">You haven't listed anything yet.</div>`;
    } catch (e) {}
  }

  async function postListing() {
    const crop = document.getElementById("lCrop").value.trim();
    const quantityQuintals = Number(document.getElementById("lQty").value);
    const askingPricePerQuintal = Number(document.getElementById("lPrice").value);
    const hint = document.getElementById("postHint");
    if (!crop || !quantityQuintals || !askingPricePerQuintal) { hint.textContent = "Fill in all fields."; return; }
    try {
      await api("/listings", { method: "POST", body: { crop, quantityQuintals, askingPricePerQuintal } });
      hint.textContent = "Listed! Buyers can see it now.";
      loadMyListings();
    } catch (e) {
      hint.textContent = e.message;
    }
  }

  async function renderBuyerDashboard() {
    app.innerHTML = `<div class="wrap">
      <div class="dash-head"><div><h2>Buyer Dashboard</h2><p>Live listings from farmers — bid directly, no middleman.</p></div></div>
      <div class="card"><h3>Available crops</h3><div id="marketList" class="empty">Loading…</div></div><div class="card" style="margin-top:20px"><h3>My offers & deals</h3><div id="buyerTrades">Loading…</div></div>
    </div>`;
    try {
      const listings = await api("/listings?status=open");
      const el = document.getElementById("marketList");
      el.className = "";
      el.innerHTML = listings.length
        ? listings.map((l) => `
          <div class="listing-row">
            <div><b>${esc(l.crop)}</b><div class="hint">${l.quantityQuintals}q · ${esc(l.farmer?.name || "Farmer")}</div></div>
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="price">₹${l.askingPricePerQuintal}</div>
              <input type="number" placeholder="Bid ₹" style="width:100px;padding:8px;border-radius:7px;border:1px solid var(--border);background:rgba(0,0,0,0.25);color:var(--paper);" id="bid-${l._id}" />
              <button class="btn small-btn" onclick="window.__placeBid('${l._id}')">Bid</button>
            </div>
          </div>`).join("")
        : `<div class="empty">No open listings right now.</div>`;
    } catch (e) { document.getElementById("marketList").textContent = e.message; }
    loadTrades("buyerTrades");
  }
  window.__placeBid = async function (listingId) {
    const input = document.getElementById("bid-" + listingId);
    const amountPerQuintal = Number(input.value);
    if (!amountPerQuintal) return;
    try {
      await api(`/listings/${listingId}/bids`, { method: "POST", body: { amountPerQuintal } });
      input.value = "";
      showToast("Bid placed");
      loadTrades("buyerTrades");
    } catch (e) { showToast(e.message); }
  };

  async function loadTrades(elementId) {
    const el = document.getElementById(elementId); if (!el) return;
    try {
      const trades = await api("/listings/mine/trades");
      el.innerHTML = trades.length ? trades.map(l => `<div class="card" style="margin:12px 0;padding:16px"><b>${esc(l.crop)}</b> · ${Number(l.quantityQuintals)}q · ₹${Number(l.askingPricePerQuintal)}/q <span class="pill">${esc(l.status)}</span>
        <div class="hint">Farmer: ${esc(l.farmer?.name || "—")}${l.status === "sold" ? ` · Accepted deal ₹${Number(l.soldPricePerQuintal)}/q (payment not verified)` : ""}</div>
        ${(l.bids || []).map(b => `<div class="listing-row"><div><b>${esc(b.buyer?.name || "Buyer")}</b> offered ₹${Number(b.amountPerQuintal)}/q <span class="hint">${esc(b.status)}</span></div>
        ${currentUser.role === "farmer" && l.status === "open" && b.status === "pending" ? `<button class="btn small-btn" onclick="window.__acceptBid('${l._id}','${b._id}')">Accept offer</button>` : ""}</div>`).join("")}
        ${l.status === "sold" && ((currentUser.role === "farmer" && l.farmer?._id === currentUser.id) || (currentUser.role === "buyer" && l.soldTo === currentUser.id)) ? `<button class="btn ghost small-btn" onclick="window.__reviewDeal('${l._id}','${currentUser.role === "farmer" ? esc(l.soldTo) : esc(l.farmer?._id)}')">Review counterparty</button>` : ""}
      </div>`).join("") : `<div class="empty">No offers or deals yet.</div>`;
    } catch(e) { el.textContent = e.message; }
  }
  window.__acceptBid = async (listingId,bidId) => {
    if (!confirm("Accept this offer? Other pending offers will be rejected. This does NOT confirm payment.")) return;
    try { await api(`/listings/${listingId}/bids/${bidId}/accept`,{method:"PATCH"}); showToast("Offer accepted — payment not verified"); loadMyListings(); loadTrades("farmerTrades"); }
    catch(e) { showToast(e.message); }
  };
  window.__reviewDeal = async (listingId,targetId) => {
    const rating = Number(prompt("Rate this accepted deal from 1 to 5:"));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return showToast("Enter a whole number from 1 to 5");
    const comment = prompt("Review (optional):") || "";
    try { await api("/reviews",{method:"POST",body:{listingId,targetId,rating,comment}}); showToast("Review saved"); }
    catch(e) { showToast(e.message); }
  };

  async function renderAdminDashboard() {
    app.innerHTML = `<div class="wrap">
      <div class="dash-head"><div><h2>Admin Dashboard</h2><p>Everything stored on the server, in one place.</p></div></div>
      <div class="stat-grid" id="statGrid"></div>
      <div class="tabs2">
        <button data-t="users" class="active">Users</button>
        <button data-t="listings">Listings</button>
        <button data-t="bids">Bids</button>
        <button data-t="audit">Security / Audit Log</button>
      </div>
      <div class="card"><div id="adminTableWrap" class="tbl-wrap"></div></div>
    </div>`;
    initTilt();
    document.querySelectorAll(".stat-card").length; // noop, tilt applies via class below

    loadStats();
    document.querySelectorAll(".tabs2 button").forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll(".tabs2 button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        loadAdminTable(b.dataset.t);
      };
    });
    loadAdminTable("users");
  }

  async function loadStats() {
    try {
      const s = await api("/admin/stats");
      document.getElementById("statGrid").innerHTML = [
        ["Total users", s.userCount], ["Farmers", s.farmerCount], ["Buyers", s.buyerCount],
        ["Open listings", s.openListings], ["Total listings", s.listingCount], ["Bids placed", s.bidCount],
        ["Reviews", s.reviewCount],
      ].map(([label, num]) => `<div class="stat-card"><div class="num">${num}</div><div class="label">${label}</div></div>`).join("");
    } catch (e) {}
  }

  async function loadAdminTable(type) {
    const wrap = document.getElementById("adminTableWrap");
    wrap.innerHTML = `<div class="empty">Loading…</div>`;
    try {
      if (type === "users") {
        const users = await api("/admin/users");
        wrap.innerHTML = `<table><thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Status</th><th>Trust</th><th>Actions</th></tr></thead><tbody>
          ${users.map((u) => `<tr>
            <td>${esc(u.name)}</td><td>${esc(u.phone)}</td><td>${esc(u.role)}</td>
            <td><span class="tag ${u.isActive ? "good" : "bad"}">${u.isActive ? "active" : "suspended"}</span> ${u.isVerified ? '<span class="tag good">verified</span>' : ""}</td>
            <td>${u.trust?.score || 0} (${u.trust?.reviewCount || 0})</td>
            <td>
              <button class="btn ghost small-btn" onclick="window.__adminAction('verify','${u._id}')">Verify</button>
              <button class="btn ${u.isActive ? "danger" : "ghost"} small-btn" onclick="window.__adminAction('${u.isActive ? "suspend" : "unsuspend"}','${u._id}')">${u.isActive ? "Suspend" : "Unsuspend"}</button>
            </td>
          </tr>`).join("")}
        </tbody></table>`;
      } else if (type === "listings") {
        const listings = await api("/admin/listings");
        wrap.innerHTML = `<table><thead><tr><th>Crop</th><th>Farmer</th><th>Qty</th><th>Price</th><th>Status</th></tr></thead><tbody>
          ${listings.map((l) => `<tr><td>${esc(l.crop)}</td><td>${esc(l.farmer?.name || "—")}</td><td>${l.quantityQuintals}</td><td>₹${l.askingPricePerQuintal}</td><td>${esc(l.status)}</td></tr>`).join("")}
        </tbody></table>`;
      } else if (type === "bids") {
        const bids = await api("/admin/bids");
        wrap.innerHTML = `<table><thead><tr><th>Crop</th><th>Buyer</th><th>Amount</th><th>Status</th></tr></thead><tbody>
          ${bids.map((b) => `<tr><td>${esc(b.listing?.crop || "—")}</td><td>${esc(b.buyer?.name || "—")}</td><td>₹${b.amountPerQuintal}</td><td>${esc(b.status)}</td></tr>`).join("")}
        </tbody></table>`;
      } else if (type === "audit") {
        const logs = await api("/admin/audit-log");
        wrap.innerHTML = `<table><thead><tr><th>Event</th><th>Actor</th><th>IP</th><th>When</th></tr></thead><tbody>
          ${logs.map((l) => `<tr><td>${esc(l.event)}</td><td>${esc(l.actor?.name || "—")}</td><td>${esc(l.ip || "—")}</td><td>${new Date(l.createdAt).toLocaleString()}</td></tr>`).join("")}
        </tbody></table>`;
      }
    } catch (e) {
      wrap.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  }
  window.__adminAction = async function (action, userId) {
    try {
      if (action === "verify") await api(`/admin/users/${userId}/verify`, { method: "PATCH" });
      else await api(`/admin/users/${userId}/suspend`, { method: "PATCH", body: { suspend: action === "suspend" } });
      loadAdminTable("users");
    } catch (e) { showToast(e.message); }
  };

  // ---------------- utils ----------------
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  // ---------------- boot ----------------
  (async function boot() {
    await tryRefresh(); // silently restore a session from the httpOnly cookie, if any
    if (currentUser) connectSocket();
    render();
  })();
})();

