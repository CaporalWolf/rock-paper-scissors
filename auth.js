const Auth = (() => {
  const TOKEN_KEY = "rps_auth_token";

  let currentUser = null;
  let authReady = false;
  let authReadyCallbacks = [];

  const authOverlay = document.getElementById("authOverlay");
  const authDialog = document.getElementById("authDialog");
  const authUsername = document.getElementById("authUsername");
  const authPassword = document.getElementById("authPassword");
  const authError = document.getElementById("authError");
  const btnAuthSubmit = document.getElementById("btnAuthSubmit");
  const authTabButtons = document.querySelectorAll(".auth-tab-btn");
  const accountBar = document.getElementById("accountBar");
  const accountUsername = document.getElementById("accountUsername");
  const accountRank = document.getElementById("accountRank");
  const btnLogout = document.getElementById("btnLogout");
  const adminBadge = document.getElementById("adminBadge");

  let authMode = "register";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function getAuthHeaders() {
    const token = getToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  function isLoggedIn() {
    return !!currentUser;
  }

  function isAdmin() {
    return !!currentUser?.isAdmin;
  }

  function getUsername() {
    return currentUser?.username || "";
  }

  function getPlayerId() {
    return currentUser?.playerId || Leaderboard.getPlayerId();
  }

  function onReady(callback) {
    if (authReady) callback(currentUser);
    else authReadyCallbacks.push(callback);
  }

  function fireReady() {
    authReady = true;
    authReadyCallbacks.forEach((cb) => cb(currentUser));
    authReadyCallbacks = [];
  }

  function showError(msg) {
    if (!authError) return;
    authError.textContent = msg || "";
    authError.classList.toggle("hidden", !msg);
  }

  function updateAccountBar() {
    if (!accountBar) return;
    if (currentUser) {
      accountBar.classList.remove("hidden");
      if (accountUsername) accountUsername.textContent = currentUser.username;
      if (adminBadge) adminBadge.classList.toggle("hidden", !currentUser.isAdmin);
      const nameInput = document.getElementById("playerName");
      if (nameInput) nameInput.value = currentUser.username;
      Leaderboard.setPlayerName(currentUser.username);
      Leaderboard.setPlayerId(currentUser.playerId);
    } else {
      accountBar.classList.add("hidden");
    }
  }

  function showAuthOverlay(show) {
    if (show) {
      authOverlay?.classList.remove("hidden");
      if (authDialog && !authDialog.open) authDialog.showModal();
    } else {
      authOverlay?.classList.add("hidden");
      if (authDialog?.open) authDialog.close();
    }
  }

  function setAuthMode(mode) {
    authMode = mode;
    authTabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.authTab === mode);
    });
    if (btnAuthSubmit) {
      btnAuthSubmit.textContent = mode === "register" ? "Créer mon compte" : "Se connecter";
    }
    showError("");
  }

  async function fetchMe() {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch("/api/auth/me", { headers: getAuthHeaders() });
      if (!res.ok) {
        setToken("");
        return null;
      }
      return res.json();
    } catch {
      return null;
    }
  }

  async function loadRankProfile() {
    if (!currentUser || !accountRank) return;
    try {
      const socket = typeof Online !== "undefined" ? Online.ensureSocket?.() : null;
      if (socket) {
        socket.emit("get-ranked-profile", { playerId: getPlayerId() }, (profile) => {
          if (profile?.error) {
            accountRank.textContent = "Non classé · 0 pts";
            return;
          }
          accountRank.textContent = `${profile.rankName} · ${profile.rating} pts`;
        });
      } else {
        accountRank.textContent = "Non classé · 0 pts";
      }
    } catch {
      accountRank.textContent = "";
    }
  }

  async function submitAuth() {
    const username = authUsername?.value.trim();
    const password = authPassword?.value;
    if (!username || !password) {
      showError("Identifiant et mot de passe requis");
      return;
    }

    const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || "Erreur d'authentification");
        return;
      }

      setToken(data.token);
      currentUser = {
        username: data.username,
        playerId: data.playerId,
        isAdmin: !!data.isAdmin,
      };
      showAuthOverlay(false);
      updateAccountBar();
      loadRankProfile();
      fireReady();
      if (authPassword) authPassword.value = "";
    } catch {
      showError("Serveur inaccessible — lancez npm start");
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: getAuthHeaders(),
      });
    } catch {
      /* ignore */
    }
    setToken("");
    currentUser = null;
    authReady = false;
    updateAccountBar();
    showAuthOverlay(true);
    setAuthMode("login");
    if (typeof Competition !== "undefined") Competition.reset?.();
    if (typeof Online !== "undefined") Online.leaveMatch?.();
  }

  function showLogin() {
    setAuthMode("login");
    showAuthOverlay(true);
  }

  async function init() {
    setAuthMode("register");

    authDialog?.addEventListener("cancel", (e) => e.preventDefault());

    authTabButtons.forEach((btn) => {
      btn.addEventListener("click", () => setAuthMode(btn.dataset.authTab));
    });

    btnAuthSubmit?.addEventListener("click", submitAuth);
    authPassword?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitAuth();
    });
    btnLogout?.addEventListener("click", logout);

    const me = await fetchMe();
    if (me) {
      currentUser = me;
      updateAccountBar();
      showAuthOverlay(false);
      loadRankProfile();
      fireReady();
    } else {
      showAuthOverlay(true);
      fireReady();
    }
  }

  return {
    init,
    onReady,
    isLoggedIn,
    isAdmin,
    getUsername,
    getPlayerId,
    getToken,
    getAuthHeaders,
    loadRankProfile,
    logout,
    showLogin,
  };
})();
