const Settings = (() => {
  const STORAGE_KEY = "rps_settings";
  const EFB_CHEAT_VALUE = 23;

  const DEFAULTS = { music: 70, sfx: 65, efb: 0 };

  let state = { ...DEFAULTS };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && typeof saved === "object") {
        return {
          music: clampPercent(saved.music, DEFAULTS.music),
          sfx: clampPercent(saved.sfx, DEFAULTS.sfx),
          efb: clampPercent(saved.efb, DEFAULTS.efb),
        };
      }
    } catch {
      /* ignore */
    }
    return { ...DEFAULTS };
  }

  function clampPercent(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(100, Math.max(0, Math.round(n)));
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getMusicVolume() {
    return state.music / 100;
  }

  function getSfxVolume() {
    return state.sfx / 100;
  }

  function getEfb() {
    return state.efb;
  }

  function isEfbCheat() {
    return state.efb === EFB_CHEAT_VALUE;
  }

  function set(key, value) {
    state[key] = clampPercent(value, DEFAULTS[key] ?? 0);
    save();
    if (typeof Ambient !== "undefined") Ambient.applyVolume();
    if (typeof Sounds !== "undefined") Sounds.applyVolume();
  }

  function initUI() {
    const dialog = document.getElementById("settingsDialog");
    const btnOpen = document.getElementById("btnSettings");
    const btnClose = document.getElementById("btnCloseSettings");

    const musicSlider = document.getElementById("musicVolume");
    const sfxSlider = document.getElementById("sfxVolume");
    const efbSlider = document.getElementById("efbVolume");
    const musicValue = document.getElementById("musicValue");
    const sfxValue = document.getElementById("sfxValue");
    const efbValue = document.getElementById("efbValue");

    function syncLabels() {
      musicValue.textContent = `${state.music}%`;
      sfxValue.textContent = `${state.sfx}%`;
      efbValue.textContent = `${state.efb}%`;
    }

    function bindSlider(slider, key) {
      slider.value = String(state[key]);
      slider.addEventListener("input", () => {
        set(key, slider.value);
        syncLabels();
      });
    }

    bindSlider(musicSlider, "music");
    bindSlider(sfxSlider, "sfx");
    bindSlider(efbSlider, "efb");
    syncLabels();

    btnOpen.addEventListener("click", () => {
      if (typeof Ambient !== "undefined") Ambient.unlock();
      dialog.showModal();
    });
    btnClose.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  state = load();

  return {
    initUI,
    getMusicVolume,
    getSfxVolume,
    getEfb,
    isEfbCheat,
  };
})();
