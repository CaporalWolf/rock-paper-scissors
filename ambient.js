const Ambient = (() => {
  const FOLDER = "sounds/ambient/";
  const MANIFEST = "sounds/ambient/tracks.json";

  const DEFAULT_TRACKS = [
    "music 1.mp3",
    "music 2.mp3",
    "music 3.mp3",
    "music 4.mp3",
    "music 5.mp3",
    "music 6.mp3",
    "music 7.mp3",
    "music 8.mp3",
  ];

  const PAUSE_BETWEEN_MS = 3_000;

  let tracks = [...DEFAULT_TRACKS];
  let active = false;
  let unlocked = false;
  let currentAudio = null;
  let scheduleTimer = null;

  function pickTrack() {
    return tracks[Math.floor(Math.random() * tracks.length)];
  }

  function trackUrl(filename) {
    return FOLDER + encodeURI(filename);
  }

  function applyVolume() {
    if (currentAudio) {
      currentAudio.volume =
        typeof Settings !== "undefined" ? Settings.getMusicVolume() : 0.7;
    }
  }

  function scheduleNext(delayMs = PAUSE_BETWEEN_MS) {
    if (!active) return;
    clearTimeout(scheduleTimer);
    scheduleTimer = setTimeout(playRandom, delayMs);
  }

  function playRandom() {
    if (!active || tracks.length === 0) {
      if (active) scheduleNext();
      return;
    }

    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    const audio = new Audio(trackUrl(pickTrack()));
    currentAudio = audio;
    applyVolume();

    const onDone = () => {
      if (currentAudio === audio) currentAudio = null;
      scheduleNext();
    };

    audio.addEventListener("ended", onDone, { once: true });
    audio.addEventListener("error", onDone, { once: true });

    audio.play().catch(() => scheduleNext());
  }

  async function loadTracksFromApi() {
    try {
      const res = await fetch("/api/ambient-tracks");
      if (!res.ok) return [];
      const files = await res.json();
      return Array.isArray(files)
        ? files.filter((f) => typeof f === "string" && /\.mp3$/i.test(f))
        : [];
    } catch {
      return [];
    }
  }

  async function loadTracksFromManifest() {
    try {
      const res = await fetch(MANIFEST);
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      return data.filter((f) => typeof f === "string" && /\.mp3$/i.test(f));
    } catch {
      return [];
    }
  }

  async function loadTracks() {
    let list = await loadTracksFromApi();
    if (list.length === 0) list = await loadTracksFromManifest();
    if (list.length > 0) tracks = list;
    return tracks.length;
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    start();
  }

  function bindUnlock() {
    const once = () => unlock();
    document.addEventListener("click", once, { once: true, capture: true });
    document.addEventListener("keydown", once, { once: true });
  }

  async function init() {
    await loadTracks();
    bindUnlock();
  }

  function start() {
    if (tracks.length === 0) return;
    active = true;
    unlocked = true;
    clearTimeout(scheduleTimer);
    playRandom();
  }

  function stop() {
    active = false;
    clearTimeout(scheduleTimer);
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
  }

  return {
    init,
    start,
    stop,
    unlock,
    applyVolume,
    getTrackCount: () => tracks.length,
  };
})();
