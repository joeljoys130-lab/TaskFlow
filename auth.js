/* ============================================================
   TaskFlow – Auth Module with Real Email OTP via EmailJS
   ============================================================ */
"use strict";

// ══════════════════════════════════════════════════════════════
//  FIREBASE CONFIGURATION
// ══════════════════════════════════════════════════════════════
// NOTE: PLEASE PASTE YOUR FIREBASE CONFIGURATION HERE

const firebaseConfig = {
  apiKey: "AIzaSyCBMC9kMWlP1-INUKvFsv_E-hsnGn0LyVQ",
  authDomain: "taskflow-94a05.firebaseapp.com",
  projectId: "taskflow-94a05",
  storageBucket: "taskflow-94a05.firebasestorage.app",
  messagingSenderId: "283914087968",
  appId: "1:283914087968:web:c2ed28af9d66fca4e21645",
  measurementId: "G-F380X4W0V7",
};

firebase.initializeApp(firebaseConfig);

// ══════════════════════════════════════════════════════════════
//  STORAGE KEYS
// ══════════════════════════════════════════════════════════════
const USERS_KEY = "taskflow_users";
const SESSION_KEY = "taskflow_session";
const PENDING_KEY = "taskflow_pending";

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════
const getUsers = () => {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  } catch {
    return [];
  }
};
const saveUsers = (users) =>
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
const getSession = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
};

const EJ_KEY = "taskflow_ej_cfg";
const getEJConfig = () => {
  return {
    publicKey: "K7-GuwzuYcgm65CJc",
    serviceId: "service_44k9q4o",
    templateId: "template_gy7sduk",
  };
};
const saveEJConfig = (cfg) => localStorage.setItem(EJ_KEY, JSON.stringify(cfg));
const isEJConfigured = () => {
  const c = getEJConfig();
  return !!(c && c.publicKey && c.serviceId && c.templateId);
};

function setSession(user, remember) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      color: user.color,
      ts: Date.now(),
    }),
  );
  if (remember) localStorage.setItem("taskflow_remember", "1");
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("taskflow_remember");
}
const hashPass = (p) => btoa(unescape(encodeURIComponent(p + "_tf_salt")));
const genOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const avatarInitials = (n) =>
  n
    .trim()
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
function avatarColor(email) {
  const cols = [
    "#7c3aed",
    "#3b82f6",
    "#06b6d4",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#ec4899",
    "#8b5cf6",
  ];
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return cols[Math.abs(h) % cols.length];
}

function notifyDevice(title, body) {
  if (!("Notification" in window)) return;

  const showNotification = () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => {
          registration.showNotification(title, {
            body: body,
            icon: "icon.svg",
            vibrate: [200, 100, 200],
          });
        })
        .catch(() => {
          new Notification(title, { body, icon: "icon.svg" });
        });
    } else {
      new Notification(title, { body, icon: "icon.svg" });
    }
  };

  if (Notification.permission === "granted") {
    showNotification();
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        showNotification();
      }
    });
  }
}

// ══════════════════════════════════════════════════════════════
//  DOM REFERENCES
// ══════════════════════════════════════════════════════════════
const authOverlay = document.getElementById("authOverlay");
const mainApp = document.getElementById("mainApp");
const screenLogin = document.getElementById("screenLogin");
const screenSignup = document.getElementById("screenSignup");
const screenOtp = document.getElementById("screenOtp");
const screenSetup = document.getElementById("screenSetup");

// Login
const loginEmail = document.getElementById("loginEmail");
const loginPass = document.getElementById("loginPass");
const loginRemember = document.getElementById("loginRemember");
const loginBtn = document.getElementById("loginBtn");
const loginErr = document.getElementById("loginErr");
const loginTogglePass = document.getElementById("loginTogglePass");

// Signup
const signupName = document.getElementById("signupName");
const signupEmail = document.getElementById("signupEmail");
const signupPass = document.getElementById("signupPass");
const signupConfirm = document.getElementById("signupConfirm");
const signupBtn = document.getElementById("signupBtn");
const signupErr = document.getElementById("signupErr");
const signupTogglePass = document.getElementById("signupTogglePass");
const signupToggleConfirm = document.getElementById("signupToggleConfirm");
const strengthBar = document.getElementById("strengthBar");
const strengthText = document.getElementById("strengthText");

// OTP
const otpEmailDisplay = document.getElementById("otpEmailDisplay");
const otpInputs = document.querySelectorAll(".otp-input");
const otpVerifyBtn = document.getElementById("otpVerifyBtn");
const otpErr = document.getElementById("otpErr");
const otpResend = document.getElementById("otpResend");
const otpSendStatus = document.getElementById("otpSendStatus");
const otpBack = document.getElementById("otpBack");
let resendTimer = null;

// Setup wizard
const setupPublicKey = document.getElementById("setupPublicKey");
const setupServiceId = document.getElementById("setupServiceId");
const setupTemplateId = document.getElementById("setupTemplateId");
const setupSaveBtn = document.getElementById("setupSaveBtn");
const setupErr = document.getElementById("setupErr");
const setupTestBtn = document.getElementById("setupTestBtn");
const setupSkipBtn = document.getElementById("setupSkipBtn");
const setupTestEmail = document.getElementById("setupTestEmail");

// Header
const headerUser = document.getElementById("headerUser");
const userAvatar = document.getElementById("userAvatar");
const userName = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");
const settingsBtn = document.getElementById("settingsBtn");

// ══════════════════════════════════════════════════════════════
//  SCREEN SWITCHER
// ══════════════════════════════════════════════════════════════
const ALL_SCREENS = [screenLogin, screenSignup, screenOtp, screenSetup];
function showScreen(screen) {
  ALL_SCREENS.forEach((s) => s && s.classList.remove("active"));
  if (screen) screen.classList.add("active");
}

// ══════════════════════════════════════════════════════════════
//  PASSWORD TOGGLE
// ══════════════════════════════════════════════════════════════
function setupToggle(btn, input) {
  btn.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.innerHTML = show
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  });
}
setupToggle(loginTogglePass, loginPass);
setupToggle(signupTogglePass, signupPass);
setupToggle(signupToggleConfirm, signupConfirm);

// ══════════════════════════════════════════════════════════════
//  PASSWORD STRENGTH
// ══════════════════════════════════════════════════════════════
function measureStrength(pass) {
  let s = 0;
  if (pass.length >= 8) s++;
  if (pass.length >= 12) s++;
  if (/[A-Z]/.test(pass)) s++;
  if (/[0-9]/.test(pass)) s++;
  if (/[^A-Za-z0-9]/.test(pass)) s++;
  return s;
}
signupPass.addEventListener("input", () => {
  const s = measureStrength(signupPass.value);
  const labels = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"];
  const colors = ["", "#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#7c3aed"];
  strengthBar.style.width = (s / 5) * 100 + "%";
  strengthBar.style.background = colors[s] || "#ef4444";
  strengthText.textContent = signupPass.value ? labels[s] || "Too short" : "";
  strengthText.style.color = colors[s] || "#ef4444";
});

// ══════════════════════════════════════════════════════════════
//  OTP INPUT BOXES (auto-advance, paste, backspace)
// ══════════════════════════════════════════════════════════════
otpInputs.forEach((inp, i) => {
  inp.addEventListener("input", () => {
    inp.value = inp.value.replace(/\D/g, "").slice(0, 1);
    if (inp.value && i < otpInputs.length - 1) otpInputs[i + 1].focus();
    checkOtpFilled();
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !inp.value && i > 0) {
      otpInputs[i - 1].focus();
      otpInputs[i - 1].value = "";
    }
    if (e.key === "Enter") verifyOtp();
  });
  inp.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData)
      .getData("text")
      .replace(/\D/g, "");
    [...text].slice(0, 6).forEach((ch, j) => {
      if (otpInputs[j]) otpInputs[j].value = ch;
    });
    otpInputs[Math.min(text.length, 5)].focus();
    checkOtpFilled();
  });
});
function checkOtpFilled() {
  otpVerifyBtn.disabled =
    [...otpInputs].map((i) => i.value).join("").length < 6;
}

// ══════════════════════════════════════════════════════════════
//  RESEND COUNTDOWN
// ══════════════════════════════════════════════════════════════
function startResendCountdown(sec = 60) {
  otpResend.disabled = true;
  let t = sec;
  otpResend.textContent = `Resend in ${t}s`;
  if (resendTimer) clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    t--;
    if (t <= 0) {
      clearInterval(resendTimer);
      otpResend.disabled = false;
      otpResend.textContent = "Resend Code";
    } else otpResend.textContent = `Resend in ${t}s`;
  }, 1000);
}

// ══════════════════════════════════════════════════════════════
//  EMAILJS – SEND REAL EMAIL
// ══════════════════════════════════════════════════════════════
async function sendRealEmail(toEmail, toName, otpCode) {
  const cfg = getEJConfig();
  if (!cfg || !cfg.publicKey || !cfg.serviceId || !cfg.templateId) {
    throw new Error("EmailJS not configured");
  }

  emailjs.init(cfg.publicKey);

  const templateParams = {
    to_email: toEmail,
    to_name: toName,
    passcode: otpCode,
    time: "10 minutes",
  };

  await emailjs.send(cfg.serviceId, cfg.templateId, templateParams);
}

// ══════════════════════════════════════════════════════════════
//  SEND OTP  (real email or fallback demo)
// ══════════════════════════════════════════════════════════════
async function sendOtp(pending, isResend = false) {
  const otp = genOTP();
  pending.otp = otp;
  pending.otpTs = Date.now();
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));

  otpEmailDisplay.textContent = pending.email;
  otpInputs.forEach((i) => {
    i.value = "";
  });
  otpErr.textContent = "";
  setOtpStatus("sending");

  try {
    if (isEJConfigured()) {
      await sendRealEmail(pending.email, pending.name, otp);
      setOtpStatus("sent", pending.email);
      if (isResend) showAuthToast("📧 New code sent!");
    } else {
      // Simulate sending text since there are no EmailJS keys
      setOtpStatus("sent", pending.email);
      setTimeout(() => {
        showAuthToast(`[Demo] Your OTP is: ${otp}`);
        notifyDevice(
          "TaskFlow Security Code",
          `Your verification code is: ${otp}`,
        );
      }, 800);
    }
    startResendCountdown(60);
  } catch (err) {
    console.error("EmailJS error:", err);
    setOtpStatus(
      "failed",
      "",
      err?.text || err?.message || "Unknown configuration error",
    );
    startResendCountdown(30);
  }

  otpInputs[0].focus();
}

function setOtpStatus(state, email = "", errText = "") {
  const el = otpSendStatus;
  el.className = "otp-send-status";
  switch (state) {
    case "sending":
      el.innerHTML = `<span class="otp-spinner"></span> Sending code to your inbox…`;
      el.classList.add("sending");
      break;
    case "sent":
      el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Code sent to <strong>${email}</strong> — check your inbox (&amp; spam).`;
      el.classList.add("sent");
      break;
    case "failed":
      el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Failed to send. <strong>Error:</strong> ${errText}`;
      el.classList.add("failed");
      break;
  }
}

// ══════════════════════════════════════════════════════════════
//  SIGN UP
// ══════════════════════════════════════════════════════════════
signupBtn.addEventListener("click", doSignup);
[signupName, signupEmail, signupPass, signupConfirm].forEach((el) =>
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSignup();
  }),
);

async function doSignup() {
  signupErr.textContent = "";
  const name = signupName.value.trim();
  const email = signupEmail.value.trim().toLowerCase();
  const pass = signupPass.value;
  const confirm = signupConfirm.value;

  if (!name) return showErr(signupErr, "Please enter your name.");
  if (name.length < 2)
    return showErr(signupErr, "Name must be at least 2 characters.");
  if (!email) return showErr(signupErr, "Please enter your email.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return showErr(signupErr, "Please enter a valid email address.");
  if (!pass) return showErr(signupErr, "Please enter a password.");
  if (measureStrength(pass) < 2)
    return showErr(
      signupErr,
      "Password too weak — use 8+ characters with numbers.",
    );
  if (pass !== confirm) return showErr(signupErr, "Passwords do not match.");

  // Firebase Auth Integration + EmailJS
  signupBtn.disabled = true;
  signupBtn.innerHTML = `<span class="btn-spinner"></span> Setting up…`;

  try {
    const pending = { name, email, plainPass: pass };
    showScreen(screenOtp);
    await sendOtp(pending, false);
  } catch (error) {
    showErr(signupErr, error.message);
  } finally {
    signupBtn.disabled = false;
    signupBtn.innerHTML = `<span>Create Account</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
  }
}

// ══════════════════════════════════════════════════════════════
//  VERIFY OTP & RESEND
// ══════════════════════════════════════════════════════════════
otpVerifyBtn.addEventListener("click", verifyOtp);
async function verifyOtp() {
  let pending;
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_KEY));
  } catch {
    pending = null;
  }
  if (!pending)
    return showErr(otpErr, "Session expired. Please sign up again.");

  const entered = [...otpInputs].map((i) => i.value).join("");
  if (entered.length < 6) return showErr(otpErr, "Please enter all 6 digits.");

  const isDemo = !isEJConfigured();
  // Validate
  if (isDemo && entered !== pending.otp) {
    return showErr(otpErr, "Invalid demo code.");
  } else if (!isDemo) {
    if (entered !== pending.otp)
      return showErr(otpErr, "Invalid verification code.");
    if (Date.now() - pending.otpTs > 10 * 60 * 1000)
      return showErr(otpErr, "Code expired. Please resend.");
  }

  // Success! Let's actually create the account in Firebase now.
  otpVerifyBtn.disabled = true;
  otpVerifyBtn.innerHTML = `<span class="btn-spinner"></span> Creating account…`;
  otpErr.textContent = "";

  try {
    // Officially register them using Firebase Authentication!
    const userCredential = await firebase
      .auth()
      .createUserWithEmailAndPassword(pending.email, pending.plainPass);

    const user = {
      id: userCredential.user.uid,
      name: pending.name,
      email: pending.email,
      avatar: avatarInitials(pending.name),
      color: avatarColor(pending.email),
      joined: Date.now(),
    };

    const users = getUsers();
    users.push(user);
    saveUsers(users);

    setSession(user, false);
    localStorage.removeItem(PENDING_KEY);
    clearInterval(resendTimer);
    showMainApp(user);
    showAuthToast(`🎉 Welcome to TaskFlow, ${user.name}!`);

    // Clear forms
    signupName.value = "";
    signupEmail.value = "";
    signupPass.value = "";
    signupConfirm.value = "";
  } catch (error) {
    showErr(otpErr, error.message);
  } finally {
    otpVerifyBtn.disabled = false;
    otpVerifyBtn.innerHTML = `<span>Verify &amp; Continue</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  }
}

otpResend.addEventListener("click", async () => {
  let pending;
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_KEY));
  } catch {
    pending = null;
  }
  if (!pending)
    return showErr(otpErr, "Session expired. Please sign up again.");
  otpErr.textContent = "";
  await sendOtp(pending, true);
});

otpBack.addEventListener("click", () => {
  localStorage.removeItem(PENDING_KEY);
  clearInterval(resendTimer);
  showScreen(screenSignup);
});

// ══════════════════════════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════════════════════════
loginBtn.addEventListener("click", doLogin);
[loginEmail, loginPass].forEach((el) =>
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  }),
);

async function doLogin() {
  loginErr.textContent = "";
  const email = loginEmail.value.trim().toLowerCase();
  const pass = loginPass.value;
  if (!email) return showErr(loginErr, "Please enter your email.");
  if (!pass) return showErr(loginErr, "Please enter your password.");

  loginBtn.disabled = true;
  loginBtn.innerHTML = `<span class="btn-spinner"></span> Signing in…`;

  try {
    const userCredential = await firebase
      .auth()
      .signInWithEmailAndPassword(email, pass);

    // Find existing local profile or create simple one if it somehow doesn't exist locally
    let user = getUsers().find((u) => u.email === email);
    const users = getUsers();

    if (!user) {
      user = {
        id: userCredential.user.uid,
        name: email.split("@")[0],
        email: email,
        avatar: avatarInitials(email.split("@")[0]),
        color: avatarColor(email),
      };
      users.push(user);
    } else {
      // Forcefully update local cache to the correct Firebase ID
      // incase this user was created offline or prior to the Firebase update
      user.id = userCredential.user.uid;
      const idx = users.findIndex((u) => u.email === email);
      users[idx] = user;
    }

    saveUsers(users);

    setSession(user, loginRemember.checked);
    showMainApp(user);
    showAuthToast(`👋 Welcome back, ${user.name}!`);
  } catch (error) {
    showErr(loginErr, error.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = `<span>Sign In</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
  }
}

// ══════════════════════════════════════════════════════════════
//  LOGOUT
// ══════════════════════════════════════════════════════════════
logoutBtn.addEventListener("click", () => {
  clearSession();
  if (typeof clearLocalTasks === "function") clearLocalTasks();
  authOverlay.classList.remove("hidden");
  mainApp.classList.add("hidden");
  showScreen(screenLogin);
  loginEmail.value = "";
  loginPass.value = "";
  loginErr.textContent = "";
  showAuthToast("👋 Logged out successfully");
});

// ══════════════════════════════════════════════════════════════
//  SETTINGS BUTTON (gear icon in header)
// ══════════════════════════════════════════════════════════════
settingsBtn?.addEventListener("click", () => {
  authOverlay.classList.remove("hidden");
  mainApp.classList.add("hidden");
  showScreen(screenSetup);
  loadSetupValues();
  localStorage.setItem("taskflow_setup_return", "1");
  document.getElementById("setupSkipRow").style.display = "";
});

// ══════════════════════════════════════════════════════════════
//  SCREEN NAVIGATION LINKS
// ══════════════════════════════════════════════════════════════
document.getElementById("toSignup").addEventListener("click", () => {
  signupErr.textContent = "";
  showScreen(screenSignup);
  signupName.focus();
});
document.getElementById("toLogin").addEventListener("click", () => {
  loginErr.textContent = "";
  showScreen(screenLogin);
  loginEmail.focus();
});

// ══════════════════════════════════════════════════════════════
//  EMAILJS SETUP WIZARD
// ══════════════════════════════════════════════════════════════
function loadSetupValues() {
  const cfg = getEJConfig() || {};
  setupPublicKey.value = cfg.publicKey || "";
  setupServiceId.value = cfg.serviceId || "";
  setupTemplateId.value = cfg.templateId || "";
  setupErr.textContent = "";
}

setupSaveBtn?.addEventListener("click", () => {
  setupErr.textContent = "";
  const cfg = {
    publicKey: setupPublicKey.value.trim(),
    serviceId: setupServiceId.value.trim(),
    templateId: setupTemplateId.value.trim(),
  };
  if (!cfg.publicKey || !cfg.serviceId || !cfg.templateId)
    return showErr(setupErr, "Please fill in all three fields.");

  saveEJConfig(cfg);
  emailjs.init(cfg.publicKey);
  showAuthToast("✅ Email settings saved!");

  // Return to wherever the user came from
  const ret = localStorage.getItem("taskflow_setup_return");
  localStorage.removeItem("taskflow_setup_return");

  if (ret === "signup") {
    // They came from mid-signup — restore their form data and go back
    try {
      const saved = JSON.parse(
        localStorage.getItem("taskflow_pending_signup") || "{}",
      );
      if (saved.name) signupName.value = saved.name;
      if (saved.email) signupEmail.value = saved.email;
      if (saved.pass) {
        signupPass.value = saved.pass;
        signupConfirm.value = saved.pass;
      }
      localStorage.removeItem("taskflow_pending_signup");
    } catch {}
    showScreen(screenSignup);
    showAuthToast("✅ Email configured! Click Create Account to continue.");
  } else if (ret) {
    const session = getSession();
    if (session) {
      authOverlay.classList.add("hidden");
      mainApp.classList.remove("hidden");
    } else {
      showScreen(screenLogin);
      showAuthToast("✅ Email ready! Now sign up or log in.");
    }
  } else {
    showScreen(screenLogin);
    showAuthToast("✅ Email ready! Now sign up or log in.");
  }
});

setupSkipBtn?.addEventListener("click", () => {
  // Skip is only for users re-accessing settings while logged in
  const session = getSession();
  if (session) {
    authOverlay.classList.add("hidden");
    mainApp.classList.remove("hidden");
  } else showScreen(screenLogin);
  localStorage.removeItem("taskflow_setup_return");
});

// ── Test-send button inside setup wizard ─────────────────────
setupTestBtn?.addEventListener("click", async () => {
  setupErr.textContent = "";
  const cfg = {
    publicKey: setupPublicKey.value.trim(),
    serviceId: setupServiceId.value.trim(),
    templateId: setupTemplateId.value.trim(),
  };
  const testEmail = setupTestEmail?.value.trim();

  if (!cfg.publicKey || !cfg.serviceId || !cfg.templateId)
    return showErr(setupErr, "Please fill in all three fields first.");
  if (!testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail))
    return showErr(setupErr, "Please enter a valid test email address.");

  setupTestBtn.disabled = true;
  setupTestBtn.textContent = "Sending…";

  try {
    emailjs.init(cfg.publicKey);
    await emailjs.send(cfg.serviceId, cfg.templateId, {
      to_email: testEmail,
      to_name: "Test User",
      otp_code: "123456",
      app_name: "TaskFlow",
      expiry: "10 minutes",
    });
    showAuthToast("✅ Test email sent! Check your inbox.");
    showErr(setupErr, ""); // clear errors
    setupErr.style.color = "#6ee7b7";
    setupErr.textContent = "✅ Test email delivered successfully!";
  } catch (err) {
    showErr(
      setupErr,
      `❌ Send failed: ${err?.text || err?.message || "Check your credentials."}`,
    );
  } finally {
    setupTestBtn.disabled = false;
    setupTestBtn.textContent = "✉ Send Test Email";
  }
});

// ══════════════════════════════════════════════════════════════
//  SHOW MAIN APP
// ══════════════════════════════════════════════════════════════
function showMainApp(user) {
  authOverlay.classList.add("hidden");
  mainApp.classList.remove("hidden");
  headerUser.style.display = "flex";
  userAvatar.textContent = user.avatar || "?";
  userAvatar.style.background = user.color || "#7c3aed";
  userName.textContent = user.name.split(" ")[0];

  // Sync tasks on login
  if (typeof syncTasksFromCloud === "function") {
    syncTasksFromCloud();
  }
}

// ══════════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════════
function showAuthToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

// ══════════════════════════════════════════════════════════════
//  ERROR HELPER
// ══════════════════════════════════════════════════════════════
function showErr(el, msg) {
  el.textContent = msg;
  el.style.color = "#fca5a5";
  el.classList.add("shake-err");
  setTimeout(() => el.classList.remove("shake-err"), 500);
}

// ══════════════════════════════════════════════════════════════
//  BOOT  — always open at Login
// ══════════════════════════════════════════════════════════════
window.addEventListener("DOMContentLoaded", () => {
  // Automatically wipe buggy test accounts exactly once
  if (!localStorage.getItem("taskflow_accounts_wiped_v2")) {
    localStorage.removeItem(USERS_KEY);
    localStorage.removeItem(SESSION_KEY);
    localStorage.setItem("taskflow_accounts_wiped_v2", "1");
  }

  const session = getSession();
  if (session) {
    showMainApp(session);
  } else {
    authOverlay.classList.remove("hidden");
    mainApp.classList.add("hidden");
    showScreen(screenLogin);
  }
});
