const DEFAULTS = {
    enabled: true,
    revealOnHover: false,
    textBlur: 7,
    mediaBlur: 24,
    shortcut: "Alt+Shift+B",
    idleBlurDelay: 0
};

const elements = {
    enabled: document.getElementById("enabled"),
    revealOnHover: document.getElementById("revealOnHover"),
    textBlur: document.getElementById("textBlur"),
    mediaBlur: document.getElementById("mediaBlur"),
    textBlurValue: document.getElementById("textBlurValue"),
    mediaBlurValue: document.getElementById("mediaBlurValue"),
    shortcutButton: document.getElementById("shortcutButton"),
    idleBlurDelay: document.getElementById("idleBlurDelay"),
    idleBlurDelayValue: document.getElementById("idleBlurDelayValue"),
    status: document.getElementById("status")
};

let settings = { ...DEFAULTS };
let capturingShortcut = false;
let settingsOpen = false;

document.getElementById("settingsBtn").addEventListener("click", () => showSettings(!settingsOpen));

document.getElementById("resetBtn").addEventListener("click", () => {
    if (!confirm("Reset Telegram Blur settings?")) return;
    settings = { ...DEFAULTS };
    save();
});

for (const name of ["enabled", "revealOnHover", "textBlur", "mediaBlur"]) {
    elements[name].addEventListener("input", () => {
        settings[name] = elements[name].type === "checkbox" ? elements[name].checked : Number(elements[name].value);
        save();
    });
}

elements.idleBlurDelay.addEventListener("input", () => {
    settings.idleBlurDelay = clampNumber(elements.idleBlurDelay.value, 0, 3600, 0);
    save();
});

elements.shortcutButton.addEventListener("click", () => {
    capturingShortcut = true;
    elements.shortcutButton.classList.add("capturing");
    elements.shortcutButton.textContent = "Press keys";
});

document.addEventListener("keydown", (event) => {
    if (!capturingShortcut) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
        stopShortcutCapture();
        render();
        return;
    }

    const shortcut = shortcutFromEvent(event);
    if (!shortcut) return;

    settings.shortcut = shortcut;
    stopShortcutCapture();
    save();
}, true);

chrome.storage.local.get(["telegramBlurSettings"], (data) => {
    settings = { ...DEFAULTS, ...(data.telegramBlurSettings || {}) };
    render();
});

function save() {
    chrome.storage.local.set({ telegramBlurSettings: settings }, () => {
        render();
        notifyTabs();
    });
}

function render() {
    elements.enabled.checked = !!settings.enabled;
    elements.revealOnHover.checked = !!settings.revealOnHover;
    elements.textBlur.value = settings.textBlur;
    elements.mediaBlur.value = settings.mediaBlur;
    elements.textBlurValue.textContent = `${settings.textBlur}px`;
    elements.mediaBlurValue.textContent = `${settings.mediaBlur}px`;
    elements.shortcutButton.textContent = settings.shortcut || DEFAULTS.shortcut;
    elements.idleBlurDelay.value = settings.idleBlurDelay || 0;
    elements.idleBlurDelayValue.textContent = `${settings.idleBlurDelay || 0}s`;
    elements.status.textContent = settings.enabled ? "Enabled" : "Disabled";
}

function showSettings(show) {
    settingsOpen = show;
    document.getElementById("mainView").classList.toggle("hidden", show);
    document.getElementById("settingsView").classList.toggle("hidden", !show);
    const button = document.getElementById("settingsBtn");
    button.innerHTML = show ? "&#8617;" : "&#9881;";
    button.classList.toggle("back-button", show);
    button.title = show ? "Back" : "Settings";
    button.setAttribute("aria-label", button.title);
}

function notifyTabs() {
    chrome.tabs.query({ url: "https://web.telegram.org/*" }, (tabs) => {
        for (const tab of tabs) {
            try {
                chrome.tabs.sendMessage(tab.id, { type: "telegram_blur_settings", settings }, () => void chrome.runtime.lastError);
            } catch {
                // The tab may not have the content script yet.
            }
        }
    });
}

function stopShortcutCapture() {
    capturingShortcut = false;
    elements.shortcutButton.classList.remove("capturing");
}

function shortcutFromEvent(event) {
    const key = normalizedKeyFromEvent(event);
    if (!key || ["Control", "Shift", "Alt", "Meta"].includes(key)) return "";

    const parts = [];
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (event.metaKey) parts.push("Meta");
    parts.push(key);
    return parts.join("+");
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

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
}
