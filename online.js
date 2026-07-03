const Online = (() => {
  const LABELS = {
    rock: { name: "Pierre", emoji: "✊" },
    paper: { name: "Feuille", emoji: "✋" },
    scissors: { name: "Ciseaux", emoji: "✌️" },
  };

  let socket = null;
  let onlineMode = "casual";
  let matchCode = null;
  let mySlot = null;
  let roundLocked = false;
  let isCompetitionMatch = false;
  let competitionTitle = null;
  let winTarget = 3;

  const onlinePanel = document.getElementById("onlinePanel");
  const onlineLobby = document.getElementById("onlineLobby");
  const onlineWaiting = document.getElementById("onlineWaiting");
  const onlineArena = document.getElementById("onlineArena");
  const joinCodeInput = document.getElementById("joinCodeInput");
  const displayCode = document.getElementById("displayCode");
  const onlineStatus = document.getElementById("onlineStatus");
  const onlineRankBadge = document.getElementById("onlineRankBadge");
  const btnCreateMatch = document.getElementById("btnCreateMatch");
  const btnJoinMatch = document.getElementById("btnJoinMatch");
  const btnCopyCode = document.getElementById("btnCopyCode");
  const btnLeaveOnline = document.getElementById("btnLeaveOnline");
  const btnLeaveMatch = document.getElementById("btnLeaveMatch");
  const onlineModeButtons = document.querySelectorAll(".online-mode-btn");
  const onlineScoreYou = document.getElementById("onlineScoreYou");
  const onlineScoreOpp = document.getElementById("onlineScoreOpp");
  const onlineOppName = document.getElementById("onlineOppName");
  const onlineYouName = document.getElementById("onlineYouName");
  const onlinePlayerChoice = document.getElementById("onlinePlayerChoice");
  const onlineOppChoice = document.getElementById("onlineOppChoice");
  const onlineResult = document.getElementById("onlineResult");
  const onlineChoiceButtons = document.querySelectorAll(".online-choice-btn");
  const onlineMatchEnd = document.getElementById("onlineMatchEnd");
  const onlineMatchEndMsg = document.getElementById("onlineMatchEndMsg");

  function getPlayerId() {
    if (typeof Auth !== "undefined" && Auth.isLoggedIn()) {
      return Auth.getPlayerId();
    }
    return Leaderboard.getPlayerId();
  }

  function getPlayerName() {
    if (typeof Auth !== "undefined" && Auth.isLoggedIn()) {
      return Auth.getUsername();
    }
    const input = document.getElementById("playerName");
    const name = input?.value.trim();
    if (name) Leaderboard.setPlayerName(name);
    return Leaderboard.getPlayerName() || name || "Joueur";
  }

  function setCompetitionMatch(state) {
    if (!state) return;
    isCompetitionMatch = state.mode === "competition";
    competitionTitle = state.competitionTitle;
    winTarget = state.winTarget || 3;
    matchCode = state.code;
    mySlot = findMySlot(state);
    renderState(state);
  }

  function ensureSocket() {
    if (socket?.connected) return socket;
    socket = io({ transports: ["websocket", "polling"] });
    socket.on("match-state", renderState);
    socket.on("match-started", (state) => {
      if (state.mode === "competition") {
        isCompetitionMatch = true;
        competitionTitle = state.competitionTitle;
        winTarget = state.winTarget || 3;
      }
      renderState(state);
      showArena();
    });
    socket.on("round-result", handleRoundResult);
    socket.on("match-finished", handleMatchFinished);
    socket.on("game-exploded", handleGameExploded);
    socket.on("connect_error", () => {
      setStatus("Serveur hors ligne — lancez npm start", true);
    });
    return socket;
  }

  function setStatus(msg, isError = false) {
    if (!onlineStatus) return;
    onlineStatus.textContent = msg;
    onlineStatus.classList.toggle("error", isError);
  }

  function emitAck(event, payload) {
    return new Promise((resolve, reject) => {
      ensureSocket().emit(event, payload, (res) => {
        if (res?.error) reject(new Error(res.error));
        else resolve(res);
      });
    });
  }

  const setupEl = document.getElementById("setup");
  const onlineArenaEl = document.getElementById("onlineArena");

  function showLobby() {
    setupEl?.classList.remove("hidden");
    onlineArenaEl?.classList.add("hidden");
    onlineLobby?.classList.remove("hidden");
    onlineWaiting?.classList.add("hidden");
    onlineMatchEnd?.classList.add("hidden");
    matchCode = null;
    mySlot = null;
    roundLocked = false;
    isCompetitionMatch = false;
    competitionTitle = null;
    winTarget = 3;
  }

  function showWaiting(code) {
    setupEl?.classList.remove("hidden");
    onlineArenaEl?.classList.add("hidden");
    onlineLobby?.classList.add("hidden");
    onlineWaiting?.classList.remove("hidden");
    if (displayCode) displayCode.textContent = code;
    setStatus("En attente d'un ami…");
  }

  function showArena() {
    setupEl?.classList.add("hidden");
    onlineArenaEl?.classList.remove("hidden");
    onlineLobby?.classList.add("hidden");
    onlineWaiting?.classList.add("hidden");
    onlineMatchEnd?.classList.add("hidden");
    roundLocked = false;
    enableChoices(true);
  }

  function showPanel(visible) {
    onlinePanel?.classList.toggle("hidden", !visible);
    if (!visible) leaveMatch();
  }

  function findMySlot(state) {
    const id = getPlayerId();
    return state.players.findIndex((p) => p.playerId === id);
  }

  function loadRankProfile() {
    if (onlineMode !== "ranked" || !onlineRankBadge) return;
    ensureSocket().emit("get-ranked-profile", { playerId: getPlayerId() }, (profile) => {
      if (profile?.error) return;
      onlineRankBadge.textContent = `${profile.rankName} · ${profile.rating} pts`;
      onlineRankBadge.classList.remove("hidden");
    });
  }

  async function createMatch() {
    const name = getPlayerName();
    if (!name) {
      setStatus("Entrez un pseudo d'abord", true);
      return;
    }
    try {
      Ambient.unlock();
      const res = await emitAck("create-match", {
        mode: onlineMode,
        playerId: getPlayerId(),
        playerName: name,
      });
      matchCode = res.state.code;
      mySlot = 0;
      showWaiting(matchCode);
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  async function joinMatch() {
    const name = getPlayerName();
    const code = joinCodeInput?.value.trim().toUpperCase();
    if (!name) {
      setStatus("Entrez un pseudo d'abord", true);
      return;
    }
    if (!code || code.length < 4) {
      setStatus("Code invalide", true);
      return;
    }
    try {
      Ambient.unlock();
      const res = await emitAck("join-match", {
        code,
        playerId: getPlayerId(),
        playerName: name,
      });
      matchCode = res.state.code;
      mySlot = findMySlot(res.state);
      if (res.state.status === "playing") showArena();
      else showWaiting(matchCode);
      renderState(res.state);
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  function leaveMatch() {
    if (socket?.connected) socket.emit("leave-match");
    const wasCompetition = isCompetitionMatch || gameModeCompetition();
    matchCode = null;
    mySlot = null;
    isCompetitionMatch = false;
    competitionTitle = null;
    winTarget = 3;
    if (wasCompetition) {
      showLobbyCompetition();
    } else {
      showLobby();
    }
    setStatus("");
  }

  function gameModeCompetition() {
    return document.querySelector('.mode-btn[data-mode="competition"]')?.classList.contains("active");
  }

  function showLobbyCompetition() {
    setupEl?.classList.remove("hidden");
    onlineArenaEl?.classList.add("hidden");
    if (typeof Competition !== "undefined") {
      Competition.showPanel(true);
      Competition.reset?.();
    }
  }

  function renderState(state) {
    if (!state) return;
    matchCode = state.code;
    if (mySlot === null) mySlot = findMySlot(state);

    const oppSlot = mySlot === 0 ? 1 : 0;
    const me = state.players[mySlot];
    const opp = state.players[oppSlot];

    if (me && onlineYouName) onlineYouName.textContent = me.name;
    if (opp && onlineOppName) onlineOppName.textContent = opp.name;

    if (onlineScoreYou) onlineScoreYou.textContent = String(state.scores[mySlot] ?? 0);
    if (onlineScoreOpp) onlineScoreOpp.textContent = String(state.scores[oppSlot] ?? 0);

    if (state.status === "waiting") {
      showWaiting(state.code);
      setStatus("En attente du 2e joueur…");
      return;
    }

    if (state.status === "playing") {
      showArena();
      const submitted = state.round.submitted[mySlot];
      if (submitted) {
        roundLocked = true;
        enableChoices(false);
        onlinePlayerChoice.textContent = "✓";
        onlineOppChoice.textContent = state.round.submitted[oppSlot] ? "?" : "…";
        onlineResult.textContent = "En attente de l'adversaire…";
      } else {
        roundLocked = false;
        enableChoices(true);
        onlinePlayerChoice.textContent = "?";
        onlineOppChoice.textContent = "?";
        onlineResult.textContent = "Choisissez votre coup !";
      }
      const target = state.winTarget || winTarget || 3;
      if (state.mode === "competition") {
        setStatus(`${state.competitionTitle || "Compétition"} · Premier à ${target} manches`);
        const badge = document.getElementById("onlineModeBadge");
        if (badge) badge.textContent = `Compétition · ${state.competitionTitle || ""}`;
      } else {
        const modeLabel = state.mode === "ranked" ? "Classé" : "Casual";
        setStatus(`${modeLabel} · Premier à ${target} manches`);
      }
    }
  }

  function handleRoundResult(data) {
    if (mySlot === null) return;
    const oppSlot = mySlot === 0 ? 1 : 0;
    const myChoice = data.choices[mySlot];
    const oppChoice = data.choices[oppSlot];

    onlinePlayerChoice.textContent = LABELS[myChoice]?.emoji ?? "?";
    onlineOppChoice.textContent = LABELS[oppChoice]?.emoji ?? "?";

    onlineResult.classList.remove("win", "lose", "draw");
    if (data.result === "draw") {
      const left = Explosion.DRAW_LIMIT - (data.consecutiveDraws || 0);
      onlineResult.textContent =
        left > 0 ? `Égalité ! Encore ${left} et le jeu explose.` : "Égalité !";
      onlineResult.classList.add("draw");
    } else if (data.roundWinnerIndex === mySlot) {
      onlineResult.textContent = "Manche gagnée !";
      onlineResult.classList.add("win");
      Sounds.playForResult("player");
    } else {
      onlineResult.textContent = "Manche perdue.";
      onlineResult.classList.add("lose");
      Sounds.playForResult("ai");
    }

    if (onlineScoreYou) onlineScoreYou.textContent = String(data.scores[mySlot]);
    if (onlineScoreOpp) onlineScoreOpp.textContent = String(data.scores[oppSlot]);

    setTimeout(() => {
      roundLocked = false;
      enableChoices(true);
      onlinePlayerChoice.textContent = "?";
      onlineOppChoice.textContent = "?";
      onlineResult.textContent = "Prochaine manche !";
      onlineResult.classList.remove("win", "lose", "draw");
    }, 2000);
  }

  function handleGameExploded() {
    enableChoices(false);
    onlineResult.textContent = "5 égalités… EXPLOSION !";
    Explosion.trigger(() => {
      leaveMatch();
      if (typeof window.setMainMode === "function") window.setMainMode("online");
    });
  }

  function handleMatchFinished(state) {
    enableChoices(false);
    onlineMatchEnd?.classList.remove("hidden");

    const won = state.matchWinnerIndex === mySlot;
    let msg = won ? "Victoire !" : "Défaite.";

    if (state.mode === "ranked" && state.rankUpdate) {
      const me = won ? state.rankUpdate.winner : state.rankUpdate.loser;
      const delta = me.delta > 0 ? `+${me.delta}` : String(me.delta);
      msg += ` ${me.rankName} (${me.rating} pts, ${delta})`;
      loadRankProfile();
    } else if (state.mode === "competition") {
      msg = won
        ? `Victoire en ${state.competitionTitle || "compétition"} !`
        : `Défaite en ${state.competitionTitle || "compétition"}.`;
    }

    onlineMatchEndMsg.textContent = msg;
    Sounds.playForResult(won ? "player" : "ai");
  }

  function enableChoices(enabled) {
    onlineChoiceButtons.forEach((btn) => {
      btn.disabled = !enabled;
    });
  }

  async function submitChoice(choice) {
    if (roundLocked || !matchCode) return;
    roundLocked = true;
    enableChoices(false);
    try {
      await emitAck("submit-choice", { code: matchCode, choice });
      onlinePlayerChoice.textContent = "✓";
      onlineResult.textContent = "Coup envoyé — en attente…";
    } catch (err) {
      roundLocked = false;
      enableChoices(true);
      onlineResult.textContent = err.message;
    }
  }

  function copyCode() {
    if (!matchCode) return;
    navigator.clipboard?.writeText(matchCode).then(() => {
      setStatus("Code copié !");
    });
  }

  function init() {
    onlineModeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        onlineModeButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        onlineMode = btn.dataset.onlineMode;
        onlineRankBadge?.classList.toggle("hidden", onlineMode !== "ranked");
        if (onlineMode === "ranked") loadRankProfile();
      });
    });

    btnCreateMatch?.addEventListener("click", createMatch);
    btnJoinMatch?.addEventListener("click", joinMatch);
    btnCopyCode?.addEventListener("click", copyCode);
    btnLeaveOnline?.addEventListener("click", () => {
      leaveMatch();
      if (typeof window.setMainMode === "function") window.setMainMode("classic");
    });
    btnLeaveMatch?.addEventListener("click", () => {
      const wasCompetition = isCompetitionMatch;
      leaveMatch();
      if (wasCompetition && typeof window.setMainMode === "function") {
        window.setMainMode("competition");
      }
    });

    document.getElementById("btnOnlineRematch")?.addEventListener("click", () => {
      leaveMatch();
      showLobby();
    });

    onlineChoiceButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        Ambient.unlock();
        submitChoice(btn.dataset.choice);
      });
    });
  }

  return {
    init,
    showPanel,
    showLobby,
    loadRankProfile,
    leaveMatch,
    ensureSocket,
    emitAck,
    setCompetitionMatch,
  };
})();
