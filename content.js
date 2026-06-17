(() => {
    const DEFAULTS = {
        enabled: true,
        revealOnHover: false,
        textBlur: 7,
        mediaBlur: 24,
        shortcut: "Alt+Shift+B",
        idleBlurDelay: 0
    };

    let settings = { ...DEFAULTS };
    let idleTimer = null;

    chrome.storage.local.get(["telegramBlurSettings"], (data) => {
        settings = normalizeSettings(data.telegramBlurSettings);
        applySettings();
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message?.type !== "telegram_blur_settings") return;
        settings = normalizeSettings(message.settings);
        applySettings();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes.telegramBlurSettings) return;
        settings = normalizeSettings(changes.telegramBlurSettings.newValue);
        applySettings();
    });

    document.addEventListener("keydown", handleShortcut, true);
    for (const eventName of ["mousemove", "mousedown", "wheel", "touchstart", "keydown"]) {
        document.addEventListener(eventName, scheduleIdleBlur, { capture: true, passive: true });
    }

    function normalizeSettings(value) {
        return {
            ...DEFAULTS,
            ...(value || {}),
            textBlur: clampNumber(value?.textBlur, 2, 16, DEFAULTS.textBlur),
            mediaBlur: clampNumber(value?.mediaBlur, 8, 36, DEFAULTS.mediaBlur),
            shortcut: String(value?.shortcut || DEFAULTS.shortcut),
            idleBlurDelay: clampNumber(value?.idleBlurDelay, 0, 3600, DEFAULTS.idleBlurDelay)
        };
    }

    function applySettings() {
        const root = document.documentElement;
        root.classList.toggle("tgblur-enabled", !!settings.enabled);
        root.classList.toggle("tgblur-reveal-hover", !!settings.revealOnHover);
        root.style.setProperty("--tgblur-text-blur", `${settings.textBlur}px`);
        root.style.setProperty("--tgblur-media-blur", `${settings.mediaBlur}px`);
        scheduleIdleBlur();
    }

    function clampNumber(value, min, max, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, number));
    }

    function handleShortcut(event) {
        if (event.repeat || !matchesShortcut(event, settings.shortcut)) return;

        event.preventDefault();
        event.stopPropagation();
        settings = { ...settings, enabled: !settings.enabled };
        chrome.storage.local.set({ telegramBlurSettings: settings });
        applySettings();
    }

    function matchesShortcut(event, shortcut) {
        const parts = String(shortcut || "")
            .split("+")
            .map((part) => part.trim().toLowerCase())
            .filter(Boolean);
        if (parts.length < 1) return false;

        const expectedKey = parts[parts.length - 1];
        const expected = {
            ctrl: parts.includes("ctrl") || parts.includes("control"),
            alt: parts.includes("alt") || parts.includes("option"),
            shift: parts.includes("shift"),
            meta: parts.includes("meta") || parts.includes("cmd") || parts.includes("command")
        };

        return event.ctrlKey === expected.ctrl &&
            event.altKey === expected.alt &&
            event.shiftKey === expected.shift &&
            event.metaKey === expected.meta &&
            normalizedKeyFromEvent(event).toLowerCase() === expectedKey;
    }

    function normalizedKeyFromEvent(event) {
        if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
        if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
        const aliases = {
            " ": "Space",
            Escape: "Escape",
            Enter: "Enter",
            Tab: "Tab",
            Backspace: "Backspace",
            Delete: "Delete",
            ArrowUp: "ArrowUp",
            ArrowDown: "ArrowDown",
            ArrowLeft: "ArrowLeft",
            ArrowRight: "ArrowRight"
        };
        return aliases[event.key] || (event.key?.length === 1 ? event.key.toUpperCase() : event.key);
    }

    function scheduleIdleBlur() {
        clearTimeout(idleTimer);
        const delay = Number(settings.idleBlurDelay) || 0;
        if (delay <= 0 || settings.enabled) return;

        idleTimer = setTimeout(() => {
            settings = { ...settings, enabled: true };
            chrome.storage.local.set({ telegramBlurSettings: settings });
            applySettings();
        }, delay * 1000);
    }
})();
