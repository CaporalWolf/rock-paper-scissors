const Competition = (() => {
  const RANKS = [
    { id: "unranked", name: "Non classé", min: 0 },
    { id: "incompetent", name: "Incompétant", min: 100 },
    { id: "competent", name: "Compétant", min: 250 },
    { id: "connoisseur", name: "Connaisseur", min: 500 },
    { id: "socrates", name: "Socrate", min: 800 },
  ];

  const BANNER_THEMES = [
    { id: "purple", label: "Violet" },
    { id: "gold", label: "Or" },
    { id: "emerald", label: "Émeraude" },
    { id: "rose", label: "Rose" },
    { id: "cyan", label: "Cyan" },
  ];

  let competitions = [];
  let activeCompetitionId = null;
  let matchCode = null;
  let playerRank = { rankId: "unranked", rankName: "Non classé", rating: 0 };

  const competitionPanel = document.getElementById("competitionPanel");
  const competitionList = document.getElementById("competitionList");
  const competitionEmpty = document.getElementById("competitionEmpty");
  const competitionStatus = document.getElementById("competitionStatus");
  const competitionLobby = document.getElementById("competitionLobby");
  const competitionWaiting = document.getElementById("competitionWaiting");
  const competitionMatchCode = document.getElementById("competitionMatchCode");
  const competitionJoinCode = document.getElementById("competitionJoinCode");
  const btnCompetitionCreate = document.getElementById("btnCompetitionCreate");
  const btnCompetitionJoin = document.getElementById("btnCompetitionJoin");
  const btnCompetitionCopy = document.getElementById("btnCompetitionCopy");
  const btnCompetitionBack = document.getElementById("btnCompetitionBack");
  const btnCreateCompetition = document.getElementById("btnCreateCompetition");
  const competitionForm = document.getElementById("competitionForm");
  const compTabButtons = document.querySelectorAll(".comp-tab-btn");
  const compCreateSection = document.getElementById("compCreateSection");
  const compListSection = document.getElementById("compListSection");
  const compOfficialFilter = document.getElementById("compOfficialFilter");

  function formatDateTime(iso) {
    return new Date(iso).toLocaleString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function setStatus(msg, isError = false) {
    if (!competitionStatus) return;
    competitionStatus.textContent = msg;
    competitionStatus.classList.toggle("error", isError);
  }

  function showPanel(visible) {
    competitionPanel?.classList.toggle("hidden", !visible);
    if (visible) {
      loadCompetitions();
      loadPlayerRank();
    } else {
      reset();
    }
  }

  function reset() {
    activeCompetitionId = null;
    matchCode = null;
    competitionLobby?.classList.remove("hidden");
    competitionWaiting?.classList.add("hidden");
    setStatus("");
  }

  async function loadPlayerRank() {
    if (!Auth.isLoggedIn()) return;
    try {
      const socket = Online.ensureSocket();
      socket.emit("get-ranked-profile", { playerId: Auth.getPlayerId() }, (profile) => {
        if (profile?.error) return;
        playerRank = profile;
      });
    } catch {
      /* ignore */
    }
  }

  function canJoin(comp) {
    if (comp.status !== "active") return false;
    const required = RANKS.find((r) => r.id === comp.requiredRankId) || RANKS[0];
    const player = RANKS.find((r) => r.id === playerRank.rankId) || RANKS[0];
    return player.min >= required.min;
  }

  function statusLabel(status) {
    if (status === "active") return "En cours";
    if (status === "upcoming") return "À venir";
    return "Terminée";
  }

  function renderCompetitions() {
    if (!competitionList) return;

    const filter = compOfficialFilter?.value || "all";
    let filtered = [...competitions];
    if (filter === "official") filtered = filtered.filter((c) => c.isOfficial);
    else if (filter === "community") filtered = filtered.filter((c) => !c.isOfficial);

    competitionList.innerHTML = "";

    if (filtered.length === 0) {
      competitionEmpty?.classList.remove("hidden");
      return;
    }
    competitionEmpty?.classList.add("hidden");

    filtered.forEach((comp) => {
      const eligible = canJoin(comp);
      const card = document.createElement("article");
      card.className = "competition-card";
      card.innerHTML = `
        <div class="competition-banner" style="background: ${comp.bannerGradient}">
          <span class="competition-badge ${comp.isOfficial ? "official" : "community"}">
            ${comp.isOfficial ? "Officielle" : "Communauté"}
          </span>
          <span class="competition-status ${comp.status}">${statusLabel(comp.status)}</span>
        </div>
        <div class="competition-body">
          <h3 class="competition-title">${escapeHtml(comp.title)}</h3>
          <p class="competition-desc">${escapeHtml(comp.description)}</p>
          <div class="competition-meta">
            <div class="comp-meta-row">
              <span class="comp-meta-label">Rang requis</span>
              <span class="comp-meta-value rank-tag">${escapeHtml(comp.requiredRankName)}</span>
            </div>
            <div class="comp-meta-row">
              <span class="comp-meta-label">Manches / partie</span>
              <span class="comp-meta-value">${comp.roundsToWin}</span>
            </div>
            <div class="comp-meta-row">
              <span class="comp-meta-label">Début</span>
              <span class="comp-meta-value">${formatDateTime(comp.startDate)}</span>
            </div>
            <div class="comp-meta-row">
              <span class="comp-meta-label">Fin</span>
              <span class="comp-meta-value">${formatDateTime(comp.endDate)}</span>
            </div>
          </div>
          <button type="button" class="btn-start comp-join-btn" data-id="${comp.id}" ${
            !eligible || comp.status !== "active" ? "disabled" : ""
          }>
            ${comp.status !== "active" ? statusLabel(comp.status) : eligible ? "Rejoindre" : "Rang insuffisant"}
          </button>
        </div>
      `;
      competitionList.appendChild(card);
    });

    competitionList.querySelectorAll(".comp-join-btn").forEach((btn) => {
      btn.addEventListener("click", () => startCompetitionMatch(btn.dataset.id));
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  async function loadCompetitions() {
    try {
      const res = await fetch("/api/competitions");
      if (!res.ok) throw new Error("fetch_failed");
      competitions = await res.json();
      renderCompetitions();
    } catch {
      setStatus("Impossible de charger les compétitions — serveur hors ligne ?", true);
    }
  }

  async function startCompetitionMatch(competitionId) {
    if (!Auth.isLoggedIn()) {
      setStatus("Connectez-vous pour jouer", true);
      return;
    }

    activeCompetitionId = competitionId;
    try {
      Ambient.unlock();
      const res = await Online.emitAck("create-competition-match", {
        competitionId,
        playerId: Auth.getPlayerId(),
        playerName: Auth.getUsername(),
      });
      matchCode = res.state.code;
      competitionLobby?.classList.add("hidden");
      competitionWaiting?.classList.remove("hidden");
      if (competitionMatchCode) competitionMatchCode.textContent = matchCode;
      setStatus("Partie créée — partagez le code ou attendez un adversaire");
      Online.setCompetitionMatch(res.state);
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  async function joinCompetitionMatch() {
    const code = competitionJoinCode?.value.trim().toUpperCase();
    if (!code) {
      setStatus("Entrez un code", true);
      return;
    }
    if (!Auth.isLoggedIn()) {
      setStatus("Connectez-vous pour jouer", true);
      return;
    }

    try {
      Ambient.unlock();
      const res = await Online.emitAck("join-competition-match", {
        code,
        competitionId: activeCompetitionId,
        playerId: Auth.getPlayerId(),
        playerName: Auth.getUsername(),
      });
      matchCode = res.state.code;
      activeCompetitionId = res.state.competitionId;
      Online.setCompetitionMatch(res.state);
      if (res.state.status === "playing") {
        showPanel(false);
      } else {
        competitionLobby?.classList.add("hidden");
        competitionWaiting?.classList.remove("hidden");
        if (competitionMatchCode) competitionMatchCode.textContent = matchCode;
        setStatus("En attente du 2e joueur…");
      }
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  function populateCreateForm() {
    const rankSelect = document.getElementById("compRequiredRank");
    const themeSelect = document.getElementById("compBannerTheme");
    if (rankSelect && !rankSelect.options.length) {
      RANKS.forEach((r) => {
        const opt = document.createElement("option");
        opt.value = r.id;
        opt.textContent = r.name;
        rankSelect.appendChild(opt);
      });
    }
    if (themeSelect && !themeSelect.options.length) {
      BANNER_THEMES.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.label;
        themeSelect.appendChild(opt);
      });
    }

    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startInput = document.getElementById("compStartDate");
    const endInput = document.getElementById("compEndDate");
    if (startInput && !startInput.value) startInput.value = toDatetimeLocal(now);
    if (endInput && !endInput.value) endInput.value = toDatetimeLocal(weekLater);

    const officialRow = document.getElementById("compOfficialRow");
    if (officialRow) officialRow.classList.toggle("hidden", !Auth.isAdmin());
  }

  function toDatetimeLocal(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  async function submitCreateForm(e) {
    e.preventDefault();
    if (!Auth.isLoggedIn()) {
      setStatus("Connectez-vous pour créer une compétition", true);
      return;
    }

    const body = {
      title: document.getElementById("compTitle")?.value,
      description: document.getElementById("compDescription")?.value,
      requiredRankId: document.getElementById("compRequiredRank")?.value,
      roundsToWin: parseInt(document.getElementById("compRounds")?.value, 10),
      startDate: document.getElementById("compStartDate")?.value,
      endDate: document.getElementById("compEndDate")?.value,
      bannerTheme: document.getElementById("compBannerTheme")?.value,
      isOfficial: document.getElementById("compIsOfficial")?.checked || false,
    };

    try {
      const res = await fetch("/api/competitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...Auth.getAuthHeaders(),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "Erreur de création", true);
        return;
      }

      setStatus("Compétition créée !");
      competitionForm?.reset();
      populateCreateForm();
      setCompTab("list");
      await loadCompetitions();
    } catch {
      setStatus("Serveur inaccessible", true);
    }
  }

  function setCompTab(tab) {
    compTabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.compTab === tab);
    });
    compListSection?.classList.toggle("hidden", tab !== "list");
    compCreateSection?.classList.toggle("hidden", tab !== "create");
    if (tab === "create") populateCreateForm();
    if (tab === "list") loadCompetitions();
  }

  function init() {
    compTabButtons.forEach((btn) => {
      btn.addEventListener("click", () => setCompTab(btn.dataset.compTab));
    });

    compOfficialFilter?.addEventListener("change", renderCompetitions);
    btnCompetitionCreate?.addEventListener("click", () => {
      if (!activeCompetitionId) return;
      startCompetitionMatch(activeCompetitionId);
    });
    btnCompetitionJoin?.addEventListener("click", joinCompetitionMatch);
    btnCompetitionCopy?.addEventListener("click", () => {
      if (!matchCode) return;
      navigator.clipboard?.writeText(matchCode).then(() => setStatus("Code copié !"));
    });
    btnCompetitionBack?.addEventListener("click", () => {
      Online.leaveMatch();
      reset();
    });
    competitionForm?.addEventListener("submit", submitCreateForm);
    btnCreateCompetition?.addEventListener("click", () => setCompTab("create"));

    Auth.onReady(() => {
      if (Auth.isLoggedIn()) loadPlayerRank();
    });
  }

  return {
    init,
    showPanel,
    reset,
    loadCompetitions,
    getActiveCompetitionId: () => activeCompetitionId,
  };
})();
