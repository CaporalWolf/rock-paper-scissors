const CHOICES = ["rock", "paper", "scissors"];

const LABELS = {
  rock: { name: "Pierre", emoji: "✊" },
  paper: { name: "Feuille", emoji: "✋" },
  scissors: { name: "Ciseaux", emoji: "✌️" },
};

const DIFF_LABELS = {
  easy: "Facile",
  medium: "Moyen",
  hard: "Difficile",
};

const BEATS = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

let gameMode = "classic";
let difficulty = "easy";
let scorePlayer = 0;
let scoreAI = 0;
let streak = 0;
let playerHistory = [];
let roundLocked = false;
let serverOnline = false;
let ctrlHeld = false;
let consecutiveDraws = 0;

document.addEventListener("keydown", (e) => { if (e.key === "Control") ctrlHeld = true; });
document.addEventListener("keyup", (e) => { if (e.key === "Control") ctrlHeld = false; });

const setupEl = document.getElementById("setup");
const arenaEl = document.getElementById("arena");
const taglineEl = document.getElementById("tagline");
const playerNameInput = document.getElementById("playerName");
const modeButtons = document.querySelectorAll(".mode-btn");
const diffButtons = document.querySelectorAll(".diff-btn");
const btnStart = document.getElementById("btnStart");
const btnBack = document.getElementById("btnBack");
const btnLeaderboard = document.getElementById("btnLeaderboard");
const btnCloseLeaderboard = document.getElementById("btnCloseLeaderboard");
const leaderboardPanel = document.getElementById("leaderboardPanel");
const leaderboardBody = document.getElementById("leaderboardBody");
const leaderboardEmpty = document.getElementById("leaderboardEmpty");
const leaderboardHint = document.getElementById("leaderboardHint");
const tabButtons = document.querySelectorAll(".tab-btn");
const diffBadge = document.getElementById("diffBadge");
const scoreboardClassic = document.getElementById("scoreboardClassic");
const scoreboardSpeedrun = document.getElementById("scoreboardSpeedrun");
const scorePlayerEl = document.getElementById("scorePlayer");
const scoreAIEl = document.getElementById("scoreAI");
const streakValueEl = document.getElementById("streakValue");
const playerChoiceEl = document.getElementById("playerChoice");
const aiChoiceEl = document.getElementById("aiChoice");
const resultEl = document.getElementById("result");
const choiceButtons = document.querySelectorAll(".choice-btn");
const gameOverDialog = document.getElementById("gameOverDialog");
const finalStreakEl = document.getElementById("finalStreak");
const syncNoticeEl = document.getElementById("syncNotice");
const btnRetry = document.getElementById("btnRetry");
const btnViewRank = document.getElementById("btnViewRank");

let activeLeaderboardTab = "mine";

function randomChoice() {
  return CHOICES[Math.floor(Math.random() * CHOICES.length)];
}

function counterTo(choice) {
  return CHOICES.find((c) => BEATS[c] === choice);
}

function pickWeighted(history) {
  if (history.length === 0) return randomChoice();

  const counts = { rock: 0, paper: 0, scissors: 0 };
  const recent = history.slice(-5);
  for (const move of recent) counts[move]++;

  const favorite = CHOICES.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  if (Math.random() < 0.65) return counterTo(favorite);
  return randomChoice();
}

function pickAdaptive(history) {
  if (history.length < 2) return pickWeighted(history);

  const last = history[history.length - 1];
  const repeats = history.filter((m, i) => i > 0 && m === history[i - 1]).length;
  const alternates = history.length >= 3 && last !== history[history.length - 2];

  if (Math.random() < 0.7) {
    if (repeats > history.length * 0.3) return counterTo(last);
    if (alternates) {
      const cycleGuess = CHOICES[(CHOICES.indexOf(last) + 1) % 3];
      return counterTo(cycleGuess);
    }
    return counterTo(last);
  }

  const counts = { rock: 0, paper: 0, scissors: 0 };
  for (const move of history.slice(-8)) counts[move]++;
  const least = CHOICES.reduce((a, b) => (counts[a] <= counts[b] ? a : b));
  return counterTo(least);
}

function getAIMove() {
  switch (difficulty) {
    case "easy":
      return randomChoice();
    case "medium":
      return pickWeighted(playerHistory);
    case "hard":
      return pickAdaptive(playerHistory);
    default:
      return randomChoice();
  }
}

function resolveAIMove(playerMove) {
  if (ctrlHeld) return BEATS[playerMove];
  if (!Settings.isEfbCheat()) return getAIMove();
  if (difficulty === "easy") return counterTo(playerMove);
  return BEATS[playerMove];
}

function getWinner(player, ai) {
  if (player === ai) return "draw";
  if (BEATS[player] === ai) return "player";
  return "ai";
}

function getPlayerName() {
  if (typeof Auth !== "undefined" && Auth.isLoggedIn()) {
    return Auth.getUsername();
  }
  const fromInput = playerNameInput.value.trim();
  if (fromInput) Leaderboard.setPlayerName(fromInput);
  return Leaderboard.getPlayerName() || fromInput;
}

function updateBadge() {
  const modeLabel = gameMode === "speedrun" ? "Speedrun" : "Classique";
  diffBadge.textContent = `${DIFF_LABELS[difficulty]} · ${modeLabel}`;
}

function updateArenaLayout() {
  const isSpeedrun = gameMode === "speedrun";
  const isOnline = gameMode === "online";
  const isCompetition = gameMode === "competition";
  scoreboardClassic.classList.toggle("hidden", isSpeedrun);
  scoreboardSpeedrun.classList.toggle("hidden", !isSpeedrun);
  taglineEl.textContent = isCompetition
    ? "Rejoignez un tournoi selon votre rang."
    : isOnline
      ? "Affrontez un ami avec un code privé."
      : gameMode === "speedrun"
        ? "Enchaînez les victoires — une défaite et c'est fini."
        : "Le seul but : gagner la manche.";
}

function updateModeUI() {
  const isOnline = gameMode === "online";
  const isCompetition = gameMode === "competition";
  const hideSolo = isOnline || isCompetition;
  document.getElementById("soloOptions")?.classList.toggle("hidden", hideSolo);
  document.getElementById("btnStart")?.classList.toggle("hidden", hideSolo);
  document.getElementById("btnLeaderboard")?.classList.toggle("hidden", hideSolo);
  Online.showPanel(isOnline);
  Competition.showPanel(isCompetition);
  if (isOnline) Online.loadRankProfile();
  if (isCompetition && Auth.isLoggedIn()) Auth.loadRankProfile();
}

window.setMainMode = (mode) => {
  gameMode = mode;
  modeButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  updateArenaLayout();
  updateModeUI();
  setupEl.classList.remove("hidden");
  arenaEl.classList.add("hidden");
  document.getElementById("onlineArena")?.classList.add("hidden");
};

function updateScores(winner) {
  if (winner === "player") scorePlayer++;
  else if (winner === "ai") scoreAI++;
  scorePlayerEl.textContent = scorePlayer;
  scoreAIEl.textContent = scoreAI;
}

function updateStreakDisplay() {
  streakValueEl.textContent = String(streak);
}

function checkDrawExplosion(onContinue) {
  consecutiveDraws++;
  if (consecutiveDraws >= Explosion.DRAW_LIMIT) {
    roundLocked = true;
    choiceButtons.forEach((btn) => (btn.disabled = true));
    resultEl.textContent = "5 égalités… EXPLOSION !";
    resultEl.classList.add("draw");
    Explosion.trigger(() => {
      consecutiveDraws = 0;
      backToSetup();
    });
    return true;
  }
  if (typeof onContinue === "function") onContinue();
  return false;
}

function resetDrawStreak() {
  consecutiveDraws = 0;
}

function setResultMessage(winner, player, ai) {
  resultEl.classList.remove("win", "lose", "draw");
  if (winner === "draw") {
    const left = Explosion.DRAW_LIMIT - consecutiveDraws - 1;
    resultEl.textContent =
      left > 0
        ? `Égalité — encore ${left} et le jeu explose.`
        : "Égalité — la série continue.";
    resultEl.classList.add("draw");
  } else if (winner === "player") {
    resultEl.textContent = `${LABELS[player].name} bat ${LABELS[ai].name} — Victoire !`;
    resultEl.classList.add("win");
    Sounds.playForResult("player");
  } else {
    resultEl.textContent = `${LABELS[ai].name} bat ${LABELS[player].name} — Défaite.`;
    resultEl.classList.add("lose");
    Sounds.playForResult("ai");
  }
}

function revealChoices(player, ai) {
  playerChoiceEl.textContent = LABELS[player].emoji;
  aiChoiceEl.textContent = LABELS[ai].emoji;
  playerChoiceEl.classList.add("reveal");
  aiChoiceEl.classList.add("reveal");
  setTimeout(() => {
    playerChoiceEl.classList.remove("reveal");
    aiChoiceEl.classList.remove("reveal");
  }, 400);
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function checkServer() {
  try {
    const res = await fetch("/api/runs", { method: "GET" });
    serverOnline = res.ok;
  } catch {
    serverOnline = false;
  }
  updateLeaderboardHint();
}

function updateLeaderboardHint() {
  leaderboardHint.textContent = serverOnline
    ? "Classement partagé entre tous les joueurs connectés au serveur."
    : "Mes essais : enregistrés sur cet appareil. Lancez « npm start » pour le classement global.";
}

function renderLeaderboardRows(runs) {
  leaderboardBody.innerHTML = "";
  if (runs.length === 0) {
    leaderboardEmpty.classList.remove("hidden");
    return;
  }
  leaderboardEmpty.classList.add("hidden");

  runs.forEach((run, index) => {
    const tr = document.createElement("tr");
    const isMe = run.playerId === Leaderboard.getPlayerId();
    if (isMe) tr.classList.add("row-me");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${escapeHtml(run.playerName)}</td>
      <td><strong>${run.streak}</strong></td>
      <td>${DIFF_LABELS[run.difficulty] || run.difficulty}</td>
      <td>${formatDate(run.date)}</td>
    `;
    leaderboardBody.appendChild(tr);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function loadLeaderboardTab(tab) {
  activeLeaderboardTab = tab;
  tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));

  if (tab === "mine") {
    const runs = Leaderboard.getMyRuns(Leaderboard.getPlayerId());
    renderLeaderboardRows(runs);
    return;
  }

  if (serverOnline) {
    try {
      const runs = await Leaderboard.fetchGlobalRuns();
      renderLeaderboardRows(runs);
    } catch {
      renderLeaderboardRows([]);
    }
  } else {
    const local = Leaderboard.getLocalRuns().sort((a, b) => {
      if (b.streak !== a.streak) return b.streak - a.streak;
      return new Date(b.date) - new Date(a.date);
    });
    renderLeaderboardRows(local);
  }
}

async function openLeaderboard() {
  leaderboardPanel.classList.remove("hidden");
  await checkServer();
  await loadLeaderboardTab(activeLeaderboardTab);
}

function closeLeaderboard() {
  leaderboardPanel.classList.add("hidden");
}

async function saveSpeedrunRun(finalStreak) {
  const name = getPlayerName();
  if (!name) return null;

  const run = {
    id: crypto.randomUUID(),
    playerId: Leaderboard.getPlayerId(),
    playerName: name,
    streak: finalStreak,
    difficulty,
    date: new Date().toISOString(),
  };

  const { synced } = await Leaderboard.submitRun(run);
  return { run, synced };
}

async function endSpeedrun(finalStreak) {
  choiceButtons.forEach((btn) => (btn.disabled = true));
  roundLocked = true;

  finalStreakEl.textContent = String(finalStreak);
  const saved = await saveSpeedrunRun(finalStreak);

  if (saved && !saved.synced) {
    syncNoticeEl.classList.remove("hidden");
  } else {
    syncNoticeEl.classList.add("hidden");
  }

  gameOverDialog.showModal();
}

function handleSpeedrunResult(winner) {
  if (winner === "draw") {
    setTimeout(() => {
      checkDrawExplosion(() => {
        roundLocked = false;
        choiceButtons.forEach((btn) => (btn.disabled = false));
        resultEl.textContent = "Égalité — continuez la série !";
        resultEl.classList.remove("win", "lose", "draw");
        resultEl.classList.add("draw");
      });
    }, 1200);
    return;
  }

  resetDrawStreak();

  if (winner === "player") {
    streak++;
    updateStreakDisplay();
    setTimeout(() => {
      roundLocked = false;
      choiceButtons.forEach((btn) => (btn.disabled = false));
      resultEl.textContent = `Série : ${streak} — prochain coup !`;
      resultEl.classList.remove("win", "lose", "draw");
    }, 1200);
    return;
  }

  setTimeout(() => endSpeedrun(streak), 1200);
}

function playRound(playerMove) {
  if (roundLocked) return;
  roundLocked = true;
  choiceButtons.forEach((btn) => (btn.disabled = true));

  playerHistory.push(playerMove);
  const aiMove = resolveAIMove(playerMove);

  revealChoices(playerMove, aiMove);
  const winner = getWinner(playerMove, aiMove);
  setResultMessage(winner, playerMove, aiMove);

  if (gameMode === "speedrun") {
    handleSpeedrunResult(winner);
    return;
  }

  if (winner === "draw") {
    setTimeout(() => {
      checkDrawExplosion(() => {
        roundLocked = false;
        choiceButtons.forEach((btn) => (btn.disabled = false));
        resultEl.textContent = "Prochaine manche — à vous !";
        resultEl.classList.remove("win", "lose", "draw");
      });
    }, 1200);
    return;
  }

  resetDrawStreak();
  updateScores(winner);
  setTimeout(() => {
    roundLocked = false;
    choiceButtons.forEach((btn) => (btn.disabled = false));
    resultEl.textContent = "Prochaine manche — à vous !";
    resultEl.classList.remove("win", "lose", "draw");
  }, 1200);
}

function validateBeforeStart() {
  if (typeof Auth !== "undefined" && !Auth.isLoggedIn()) {
    Auth.showLogin();
    return false;
  }
  const name = getPlayerName();
  if (!name) {
    playerNameInput.focus();
    playerNameInput.classList.add("input-error");
    setTimeout(() => playerNameInput.classList.remove("input-error"), 600);
    return false;
  }
  return true;
}

function startGame() {
  if (!validateBeforeStart()) return;

  scorePlayer = 0;
  scoreAI = 0;
  streak = 0;
  consecutiveDraws = 0;
  playerHistory = [];
  scorePlayerEl.textContent = "0";
  scoreAIEl.textContent = "0";
  updateStreakDisplay();
  playerChoiceEl.textContent = "?";
  aiChoiceEl.textContent = "?";
  resultEl.textContent =
    gameMode === "speedrun"
      ? "Speedrun — une victoire de plus !"
      : "Choisissez votre coup !";
  resultEl.classList.remove("win", "lose", "draw");
  updateBadge();
  updateArenaLayout();
  setupEl.classList.add("hidden");
  arenaEl.classList.remove("hidden");
  closeLeaderboard();
  roundLocked = false;
  choiceButtons.forEach((btn) => (btn.disabled = false));
}

function backToSetup() {
  arenaEl.classList.add("hidden");
  setupEl.classList.remove("hidden");
  gameOverDialog.close();
}

function initPlayer() {
  const savedName = Leaderboard.getPlayerName();
  if (savedName) playerNameInput.value = savedName;
  playerNameInput.addEventListener("change", () => {
    if (playerNameInput.value.trim()) Leaderboard.setPlayerName(playerNameInput.value);
  });
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    modeButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    gameMode = btn.dataset.mode;
    updateArenaLayout();
    updateModeUI();
    if (gameMode !== "online" && gameMode !== "competition") Online.leaveMatch();
    if (gameMode !== "competition") Competition.reset?.();
  });
});

diffButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    diffButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    difficulty = btn.dataset.diff;
  });
});

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => loadLeaderboardTab(btn.dataset.tab));
});

choiceButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    Ambient.unlock();
    playRound(btn.dataset.choice);
  });
});

btnStart.addEventListener("click", () => {
  if (gameMode === "online" || gameMode === "competition") return;
  Ambient.unlock();
  startGame();
});
btnBack.addEventListener("click", backToSetup);
btnLeaderboard.addEventListener("click", openLeaderboard);
btnCloseLeaderboard.addEventListener("click", closeLeaderboard);
btnRetry.addEventListener("click", () => {
  gameOverDialog.close();
  startGame();
});
btnViewRank.addEventListener("click", () => {
  gameOverDialog.close();
  backToSetup();
  openLeaderboard();
});

initPlayer();
Auth.init();
Settings.initUI();
Online.init();
Competition.init();
Ambient.init();
updateArenaLayout();
updateModeUI();
checkServer();

document.getElementById("btnLeaveCompetition")?.addEventListener("click", () => {
  Competition.reset?.();
  Online.leaveMatch();
  window.setMainMode("classic");
});
