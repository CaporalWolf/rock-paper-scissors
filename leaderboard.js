const Leaderboard = (() => {
  const STORAGE_KEY = "rps_runs_local";
  const PLAYER_ID_KEY = "rps_player_id";
  const PLAYER_NAME_KEY = "rps_player_name";

  function getPlayerId() {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  }

  function getPlayerName() {
    return localStorage.getItem(PLAYER_NAME_KEY) || "";
  }

  function setPlayerName(name) {
    const trimmed = name.trim().slice(0, 24);
    if (trimmed) localStorage.setItem(PLAYER_NAME_KEY, trimmed);
    return trimmed;
  }

  function getLocalRuns() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveLocalRun(run) {
    const runs = getLocalRuns();
    runs.push(run);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
    return run;
  }

  function getMyRuns(playerId) {
    return getLocalRuns()
      .filter((r) => r.playerId === playerId)
      .sort((a, b) => {
        if (b.streak !== a.streak) return b.streak - a.streak;
        return new Date(b.date) - new Date(a.date);
      });
  }

  async function fetchGlobalRuns() {
    const res = await fetch("/api/runs");
    if (!res.ok) throw new Error("fetch_failed");
    return res.json();
  }

  async function submitRun(run) {
    saveLocalRun(run);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: run.playerId,
          playerName: run.playerName,
          streak: run.streak,
          difficulty: run.difficulty,
        }),
      });
      if (!res.ok) throw new Error("post_failed");
      return { synced: true };
    } catch {
      return { synced: false };
    }
  }

  return {
    getPlayerId,
    getPlayerName,
    setPlayerName,
    getLocalRuns,
    getMyRuns,
    saveLocalRun,
    fetchGlobalRuns,
    submitRun,
  };
})();
