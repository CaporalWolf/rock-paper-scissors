const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RANKINGS_FILE = path.join(__dirname, "rankings.json");
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const WIN_TARGET = 3;
const WIN_RATING = 35;
const LOSS_RATING = 25;

const RANKS = [
  { id: "unranked", name: "Non classé", min: 0 },
  { id: "incompetent", name: "Incompétant", min: 100 },
  { id: "competent", name: "Compétant", min: 250 },
  { id: "connoisseur", name: "Connaisseur", min: 500 },
  { id: "socrates", name: "Socrate", min: 800 },
];

const BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };

const matches = new Map();

function readRankings() {
  try {
    const raw = fs.readFileSync(RANKINGS_FILE, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function writeRankings(data) {
  fs.writeFileSync(RANKINGS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getRankFromRating(rating) {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (rating >= rank.min) current = rank;
  }
  return current;
}

function getPlayerRankedProfile(playerId) {
  const all = readRankings();
  const rating = all[playerId]?.rating ?? 0;
  const rank = getRankFromRating(rating);
  return { rating, rankId: rank.id, rankName: rank.name };
}

function applyRankedResult(winnerId, loserId) {
  const all = readRankings();
  if (!all[winnerId]) all[winnerId] = { rating: 0, wins: 0, losses: 0 };
  if (!all[loserId]) all[loserId] = { rating: 0, wins: 0, losses: 0 };

  all[winnerId].rating += WIN_RATING;
  all[winnerId].wins = (all[winnerId].wins || 0) + 1;
  all[loserId].rating = Math.max(0, all[loserId].rating - LOSS_RATING);
  all[loserId].losses = (all[loserId].losses || 0) + 1;

  writeRankings(all);

  return {
    winner: { ...getPlayerRankedProfile(winnerId), delta: WIN_RATING },
    loser: { ...getPlayerRankedProfile(loserId), delta: -LOSS_RATING },
  };
}

function generateCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  if (matches.has(code)) return generateCode();
  return code;
}

function getRoundWinner(a, b) {
  if (a === b) return "draw";
  if (BEATS[a] === b) return "player1";
  return "player2";
}

function sanitizeName(name) {
  return String(name || "Joueur").trim().slice(0, 24) || "Joueur";
}

function publicPlayer(player, index) {
  const ranked =
    player.modeContext === "ranked"
      ? getPlayerRankedProfile(player.playerId)
      : null;
  return {
    slot: index,
    playerId: player.playerId,
    name: player.name,
    rating: ranked?.rating ?? null,
    rankName: ranked?.rankName ?? null,
  };
}

function publicMatchState(match) {
  return {
    code: match.code,
    mode: match.mode,
    status: match.status,
    players: match.players.map((p, i) => publicPlayer(p, i)),
    scores: [...match.scores],
    round: {
      phase: match.round.phase,
      submitted: match.players.map((p) => p.choice !== null),
    },
    matchWinnerIndex: match.matchWinnerIndex,
    lastRound: match.lastRound,
  };
}

function broadcastMatch(io, match) {
  io.to(match.code).emit("match-state", publicMatchState(match));
}

function resolveRound(io, match) {
  const [p1, p2] = match.players;
  const result = getRoundWinner(p1.choice, p2.choice);

  let roundWinnerIndex = null;
  if (result === "player1") {
    match.scores[0]++;
    roundWinnerIndex = 0;
  } else if (result === "player2") {
    match.scores[1]++;
    roundWinnerIndex = 1;
  }

  match.lastRound = {
    choices: [p1.choice, p2.choice],
    result,
    roundWinnerIndex,
  };

  if (result === "draw") {
    match.consecutiveDraws = (match.consecutiveDraws || 0) + 1;
  } else {
    match.consecutiveDraws = 0;
  }

  p1.choice = null;
  p2.choice = null;
  match.round.phase = "choosing";

  if (match.consecutiveDraws >= 5) {
    match.status = "exploded";
    match.round.phase = "done";
    io.to(match.code).emit("round-result", {
      ...match.lastRound,
      scores: [...match.scores],
      consecutiveDraws: match.consecutiveDraws,
    });
    io.to(match.code).emit("game-exploded", {
      message: "5 égalités d'affilée — le jeu EXPLOSE !",
    });
    matches.delete(match.code);
    return;
  }

  if (match.scores[0] >= WIN_TARGET || match.scores[1] >= WIN_TARGET) {
    match.status = "finished";
    match.matchWinnerIndex = match.scores[0] >= WIN_TARGET ? 0 : 1;
    match.round.phase = "done";

    let rankUpdate = null;
    if (match.mode === "ranked") {
      const winner = match.players[match.matchWinnerIndex];
      const loser = match.players[1 - match.matchWinnerIndex];
      rankUpdate = applyRankedResult(winner.playerId, loser.playerId);
    }

    broadcastMatch(io, match);
    io.to(match.code).emit("match-finished", {
      ...publicMatchState(match),
      rankUpdate,
    });
    return;
  }

  broadcastMatch(io, match);
  io.to(match.code).emit("round-result", {
    ...match.lastRound,
    scores: [...match.scores],
    consecutiveDraws: match.consecutiveDraws || 0,
  });
}

function findMatchBySocket(socketId) {
  for (const match of matches.values()) {
    const idx = match.players.findIndex((p) => p.socketId === socketId);
    if (idx !== -1) return { match, playerIndex: idx };
  }
  return null;
}

function removePlayerFromMatch(io, match, playerIndex) {
  const player = match.players[playerIndex];
  if (player.socketId) {
    const sock = io.sockets.sockets.get(player.socketId);
    if (sock) sock.leave(match.code);
  }
  match.players.splice(playerIndex, 1);

  if (match.players.length === 0) {
    matches.delete(match.code);
    return;
  }

  match.status = "waiting";
  match.scores = [0, 0];
  match.consecutiveDraws = 0;
  match.matchWinnerIndex = null;
  match.lastRound = null;
  match.players.forEach((p) => {
    p.choice = null;
  });
  match.round.phase = "choosing";
  broadcastMatch(io, match);
}

function setupOnline(io) {
  io.on("connection", (socket) => {
    socket.on("get-ranked-profile", ({ playerId }, cb) => {
      if (typeof cb !== "function") return;
      if (!playerId) return cb({ error: "playerId requis" });
      cb(getPlayerRankedProfile(playerId));
    });

    socket.on("create-match", ({ mode, playerId, playerName }, cb) => {
      if (typeof cb !== "function") return;
      if (!["casual", "ranked"].includes(mode)) {
        return cb({ error: "Mode invalide" });
      }
      if (!playerId) return cb({ error: "playerId requis" });

      const code = generateCode();
      const match = {
        code,
        mode,
        status: "waiting",
        scores: [0, 0],
        matchWinnerIndex: null,
        lastRound: null,
        round: { phase: "choosing" },
        consecutiveDraws: 0,
        players: [
          {
            playerId: String(playerId).slice(0, 64),
            name: sanitizeName(playerName),
            socketId: socket.id,
            modeContext: mode,
            choice: null,
          },
        ],
        createdAt: Date.now(),
      };

      matches.set(code, match);
      socket.join(code);
      cb({ ok: true, state: publicMatchState(match) });
      broadcastMatch(io, match);
    });

    socket.on("join-match", ({ code, playerId, playerName }, cb) => {
      if (typeof cb !== "function") return;
      const match = matches.get(String(code || "").toUpperCase());
      if (!match) return cb({ error: "Code introuvable" });
      if (match.status === "finished") return cb({ error: "Partie terminée" });
      if (match.players.length >= 2) return cb({ error: "Partie complète" });
      if (match.players.some((p) => p.playerId === playerId)) {
        return cb({ error: "Déjà dans cette partie" });
      }

      match.players.push({
        playerId: String(playerId).slice(0, 64),
        name: sanitizeName(playerName),
        socketId: socket.id,
        modeContext: match.mode,
        choice: null,
      });

      match.status = "playing";
      socket.join(code);
      cb({ ok: true, state: publicMatchState(match) });
      broadcastMatch(io, match);
      io.to(code).emit("match-started", publicMatchState(match));
    });

    socket.on("submit-choice", ({ code, choice }, cb) => {
      if (typeof cb !== "function") return;
      const match = matches.get(String(code || "").toUpperCase());
      if (!match || match.status !== "playing") {
        return cb({ error: "Partie indisponible" });
      }

      const playerIndex = match.players.findIndex((p) => p.socketId === socket.id);
      if (playerIndex === -1) return cb({ error: "Non autorisé" });
      if (!["rock", "paper", "scissors"].includes(choice)) {
        return cb({ error: "Coup invalide" });
      }
      if (match.players[playerIndex].choice !== null) {
        return cb({ error: "Coup déjà envoyé" });
      }

      match.players[playerIndex].choice = choice;
      cb({ ok: true });

      const allReady = match.players.every((p) => p.choice !== null);
      broadcastMatch(io, match);

      if (allReady) {
        match.round.phase = "revealed";
        resolveRound(io, match);
      }
    });

    socket.on("rejoin-match", ({ code, playerId, playerName }, cb) => {
      if (typeof cb !== "function") return;
      const match = matches.get(String(code || "").toUpperCase());
      if (!match) return cb({ error: "Code introuvable" });

      let player = match.players.find((p) => p.playerId === playerId);
      if (!player) return cb({ error: "Joueur introuvable dans cette partie" });

      player.socketId = socket.id;
      player.name = sanitizeName(playerName);
      socket.join(match.code);
      cb({ ok: true, state: publicMatchState(match) });
      broadcastMatch(io, match);
    });

    socket.on("leave-match", () => {
      const found = findMatchBySocket(socket.id);
      if (!found) return;
      removePlayerFromMatch(io, found.match, found.playerIndex);
    });

    socket.on("disconnect", () => {
      const found = findMatchBySocket(socket.id);
      if (!found) return;
      removePlayerFromMatch(io, found.match, found.playerIndex);
    });
  });

  setInterval(() => {
    const now = Date.now();
    for (const [code, match] of matches) {
      if (match.players.length === 0 || now - match.createdAt > 2 * 60 * 60 * 1000) {
        matches.delete(code);
      }
    }
  }, 60_000);
}

module.exports = { setupOnline, RANKS, getRankFromRating };
