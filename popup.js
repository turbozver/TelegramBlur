const DEFAULTS = {
    enabled: true,
    revealOnHover: false,
    revealMode: "hover",
    clickRevealBinding: "Mouse1",
    clickRevealRetention: "single",
    clickRevealPassThrough: true,
    hoverRevealDelay: 0,
    chatRevealDuration: 10,
    chatRevealBinding: "",
    blurText: true,
    blurAvatars: true,
    blurMedia: true,
    blurChatListMessage: true,
    blurChatListIdentity: true,
    blurChatListBadges: true,
    blurCurrentAuthor: true,
    blurCurrentMessages: true,
    blurCurrentHeader: true,
    blurCurrentPinned: true,
    blurCurrentDates: true,
    textBlur: 8,
    mediaBlur: 32,
    blurBackground: false,
    shortcut: "Alt+Shift+B",
    idleBlurDelay: 0,
    revealBlurDelay: 0
};

const elements = {
    enabled: document.getElementById("enabled"),
    revealOnHover: document.getElementById("revealOnHover"),
    revealModeRow: document.getElementById("revealModeRow"),
    clickRevealBindingRow: document.getElementById("clickRevealBindingRow"),
    clickRevealBindingButton: document.getElementById("clickRevealBindingButton"),
    clickRevealRetentionRow: document.getElementById("clickRevealRetentionRow"),
    clickRevealActionRow: document.getElementById("clickRevealActionRow"),
    hoverRevealDelay: document.getElementById("hoverRevealDelay"),
    hoverRevealDelayValue: document.getElementById("hoverRevealDelayValue"),
    hoverRevealDelayRow: document.getElementById("hoverRevealDelayRow"),
    chatRevealDuration: document.getElementById("chatRevealDuration"),
    chatRevealDurationValue: document.getElementById("chatRevealDurationValue"),
    chatRevealBindingButton: document.getElementById("chatRevealBindingButton"),
    chatRevealBindingClear: document.getElementById("chatRevealBindingClear"),
    revealChatBtn: document.getElementById("revealChatBtn"),
    revealChatDurationLabel: document.getElementById("revealChatDurationLabel"),
    blurText: document.getElementById("blurText"),
    blurAvatars: document.getElementById("blurAvatars"),
    blurMedia: document.getElementById("blurMedia"),
    blurChatListMessage: document.getElementById("blurChatListMessage"),
    blurChatListIdentity: document.getElementById("blurChatListIdentity"),
    blurChatListBadges: document.getElementById("blurChatListBadges"),
    blurCurrentAuthor: document.getElementById("blurCurrentAuthor"),
    blurCurrentMessages: document.getElementById("blurCurrentMessages"),
    blurCurrentHeader: document.getElementById("blurCurrentHeader"),
    blurCurrentPinned: document.getElementById("blurCurrentPinned"),
    blurCurrentDates: document.getElementById("blurCurrentDates"),
    textBlur: document.getElementById("textBlur"),
    mediaBlur: document.getElementById("mediaBlur"),
    textBlurValue: document.getElementById("textBlurValue"),
    mediaBlurValue: document.getElementById("mediaBlurValue"),
    blurBackground: document.getElementById("blurBackground"),
    shortcutButton: document.getElementById("shortcutButton"),
    idleBlurDelay: document.getElementById("idleBlurDelay"),
    idleBlurDelayValue: document.getElementById("idleBlurDelayValue"),
    revealBlurDelay: document.getElementById("revealBlurDelay"),
    revealBlurDelayValue: document.getElementById("revealBlurDelayValue"),
    revealDelayRow: document.getElementById("revealDelayRow"),
    status: document.getElementById("status")
};

let settings = { ...DEFAULTS };
let capturingShortcut = false;
let capturingRevealBinding = false;
let capturingChatRevealBinding = false;
let settingsOpen = false;
let customConfirmResolve = null;
let customConfirmBackdropPointerDown = false;
let capturedPointerSuppressUntil = 0;

document.getElementById("settingsBtn").addEventListener("click", () => showSettings(!settingsOpen));

document.getElementById("resetBtn").addEventListener("click", async () => {
    if (!await askConfirm({
        title: "Reset settings?",
        message: "This restores Telegram Blur settings to their defaults in this browser.",
        confirmText: "Reset"
    })) return;
    settings = { ...DEFAULTS };
    save();
});

for (const name of [
    "enabled", "revealOnHover", "blurText", "blurAvatars", "blurMedia", "blurBackground",
    "blurChatListMessage", "blurChatListIdentity", "blurChatListBadges",
    "blurCurrentAuthor", "blurCurrentMessages", "blurCurrentHeader", "blurCurrentPinned", "blurCurrentDates",
    "textBlur", "mediaBlur"
]) {
    elements[name].addEventListener("input", () => {
        settings[name] = elements[name].type === "checkbox" ? elements[name].checked : Number(elements[name].value);
        save();
    });
}

elements.idleBlurDelay.addEventListener("input", () => {
    settings.idleBlurDelay = clampNumber(elements.idleBlurDelay.value, 0, 3600, 0);
    save();
});

elements.revealBlurDelay.addEventListener("input", () => {
    const value = parseDecimal(elements.revealBlurDelay.value);
    if (!Number.isFinite(value)) return;
    settings.revealBlurDelay = clampDecimal(value, 0, 60, 0);
    elements.revealBlurDelayValue.textContent = `${formatSeconds(settings.revealBlurDelay)}s`;
    save(false);
});

elements.revealBlurDelay.addEventListener("change", () => {
    settings.revealBlurDelay = clampDecimal(elements.revealBlurDelay.value, 0, 60, 0);
    save();
});

elements.hoverRevealDelay.addEventListener("input", () => {
    const value = parseDecimal(elements.hoverRevealDelay.value);
    if (!Number.isFinite(value)) return;
    settings.hoverRevealDelay = clampDecimal(value, 0, 10, 0);
    elements.hoverRevealDelayValue.textContent = `${formatSeconds(settings.hoverRevealDelay)}s`;
    save(false);
});

elements.hoverRevealDelay.addEventListener("change", () => {
    settings.hoverRevealDelay = clampDecimal(elements.hoverRevealDelay.value, 0, 10, 0);
    save();
});

elements.chatRevealDuration.addEventListener("input", () => {
    settings.chatRevealDuration = clampNumber(elements.chatRevealDuration.value, 1, 3600, DEFAULTS.chatRevealDuration);
    save();
});

document.querySelectorAll("[data-reveal-mode]").forEach((button) => {
    button.addEventListener("click", () => {
        settings.revealMode = button.dataset.revealMode;
        save();
    });
});

document.querySelectorAll("[data-click-retention]").forEach((button) => {
    button.addEventListener("click", () => {
        settings.clickRevealRetention = button.dataset.clickRetention;
        save();
    });
});

document.querySelectorAll("[data-click-action]").forEach((button) => {
    button.addEventListener("click", () => {
        settings.clickRevealPassThrough = button.dataset.clickAction === "pass";
        save();
    });
});

elements.revealChatBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab?.id || !String(tab.url || "").startsWith("https://web.telegram.org/")) {
            showRevealChatFeedback("Open Telegram Web");
            return;
        }
        chrome.tabs.sendMessage(tab.id, {
            type: "telegram_blur_reveal_chat",
            duration: settings.chatRevealDuration
        }, (response) => {
            if (chrome.runtime.lastError || !response?.ok) {
                showRevealChatFeedback("Reload Telegram Web");
                return;
            }
            showRevealChatFeedback(response.revealed ? "Chat Revealed" : "Chat Blurred");
        });
    });
});

document.querySelectorAll("[data-step-target]").forEach((button) => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.stepTarget);
        if (!input) return;
        if (button.dataset.stepDirection === "up") input.stepUp();
        else input.stepDown();
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.focus();
    });
});

elements.shortcutButton.addEventListener("click", () => {
    stopRevealBindingCapture();
    stopChatRevealBindingCapture();
    capturingShortcut = true;
    elements.shortcutButton.classList.add("capturing");
    elements.shortcutButton.textContent = "Press keys";
});

elements.clickRevealBindingButton.addEventListener("click", () => {
    stopShortcutCapture();
    stopChatRevealBindingCapture();
    capturingRevealBinding = true;
    elements.clickRevealBindingButton.classList.add("capturing");
    elements.clickRevealBindingButton.textContent = "Press input";
});

elements.chatRevealBindingButton.addEventListener("click", () => {
    stopShortcutCapture();
    stopRevealBindingCapture();
    capturingChatRevealBinding = true;
    elements.chatRevealBindingButton.classList.add("capturing");
    elements.chatRevealBindingButton.textContent = "Press input";
});

elements.chatRevealBindingClear.addEventListener("click", () => {
    settings.chatRevealBinding = "";
    stopChatRevealBindingCapture();
    save();
});

document.addEventListener("pointerdown", (event) => {
    if (!capturingRevealBinding && !capturingChatRevealBinding) return;
    event.preventDefault();
    event.stopPropagation();
    capturedPointerSuppressUntil = Date.now() + 600;
    const binding = pointerBindingFromEvent(event);
    if (capturingRevealBinding) settings.clickRevealBinding = binding;
    if (capturingChatRevealBinding) settings.chatRevealBinding = binding;
    if (capturingRevealBinding) stopRevealBindingCapture();
    if (capturingChatRevealBinding) stopChatRevealBindingCapture();
    save();
}, true);

for (const eventName of ["click", "auxclick", "contextmenu"]) document.addEventListener(eventName, (event) => {
    if (Date.now() > capturedPointerSuppressUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
}, true);

document.addEventListener("keydown", (event) => {
    if (!capturingShortcut && !capturingRevealBinding && !capturingChatRevealBinding) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
        if (capturingShortcut) stopShortcutCapture();
        if (capturingRevealBinding) stopRevealBindingCapture();
        if (capturingChatRevealBinding) stopChatRevealBindingCapture();
        render();
        return;
    }

    const shortcut = shortcutFromEvent(event);
    if (!shortcut) return;

    if (capturingRevealBinding) {
        settings.clickRevealBinding = shortcut;
        stopRevealBindingCapture();
        save();
        return;
    }

    if (capturingChatRevealBinding) {
        settings.chatRevealBinding = shortcut;
        stopChatRevealBindingCapture();
        save();
        return;
    }

    settings.shortcut = shortcut;
    stopShortcutCapture();
    save();
}, true);

document.addEventListener("keyup", (event) => {
    if ((!capturingRevealBinding && !capturingChatRevealBinding) || !["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const binding = modifierBindingFromEvent(event);
    if (capturingRevealBinding) settings.clickRevealBinding = binding;
    if (capturingChatRevealBinding) settings.chatRevealBinding = binding;
    if (capturingRevealBinding) stopRevealBindingCapture();
    if (capturingChatRevealBinding) stopChatRevealBindingCapture();
    save();
}, true);

chrome.storage.local.get(["telegramBlurSettings"], (data) => {
    settings = { ...DEFAULTS, ...(data.telegramBlurSettings || {}) };
    render();
});

function save(renderAfterSave = true) {
    chrome.storage.local.set({ telegramBlurSettings: settings }, () => {
        if (renderAfterSave) render();
        notifyTabs();
    });
}

function render() {
    elements.enabled.checked = !!settings.enabled;
    elements.revealOnHover.checked = !!settings.revealOnHover;
    elements.blurText.checked = settings.blurText !== false;
    elements.blurAvatars.checked = settings.blurAvatars !== false;
    elements.blurMedia.checked = settings.blurMedia !== false;
    elements.blurChatListMessage.checked = settings.blurChatListMessage !== false;
    elements.blurChatListIdentity.checked = settings.blurChatListIdentity !== false;
    elements.blurChatListBadges.checked = settings.blurChatListBadges !== false;
    elements.blurCurrentAuthor.checked = settings.blurCurrentAuthor !== false;
    elements.blurCurrentMessages.checked = settings.blurCurrentMessages !== false;
    elements.blurCurrentHeader.checked = settings.blurCurrentHeader !== false;
    elements.blurCurrentPinned.checked = settings.blurCurrentPinned !== false;
    elements.blurCurrentDates.checked = settings.blurCurrentDates !== false;
    elements.blurBackground.checked = !!settings.blurBackground;
    elements.textBlur.value = settings.textBlur;
    elements.mediaBlur.value = settings.mediaBlur;
    elements.textBlurValue.textContent = `${settings.textBlur}px`;
    elements.mediaBlurValue.textContent = `${settings.mediaBlur}px`;
    elements.shortcutButton.textContent = settings.shortcut || DEFAULTS.shortcut;
    elements.clickRevealBindingButton.textContent = settings.clickRevealBinding || DEFAULTS.clickRevealBinding;
    elements.chatRevealBindingButton.textContent = settings.chatRevealBinding || "Not set";
    elements.chatRevealBindingClear.disabled = !settings.chatRevealBinding;
    elements.idleBlurDelay.value = settings.idleBlurDelay || 0;
    elements.idleBlurDelayValue.textContent = `${settings.idleBlurDelay || 0}s`;
    elements.revealBlurDelay.value = settings.revealBlurDelay || 0;
    elements.revealBlurDelayValue.textContent = `${formatSeconds(settings.revealBlurDelay)}s`;
    elements.hoverRevealDelay.value = settings.hoverRevealDelay || 0;
    elements.hoverRevealDelayValue.textContent = `${formatSeconds(settings.hoverRevealDelay)}s`;
    elements.chatRevealDuration.value = settings.chatRevealDuration || DEFAULTS.chatRevealDuration;
    elements.chatRevealDurationValue.textContent = `${settings.chatRevealDuration || DEFAULTS.chatRevealDuration}s`;
    elements.revealChatDurationLabel.textContent = formatDurationLabel(settings.chatRevealDuration || DEFAULTS.chatRevealDuration);
    const hoverMode = settings.revealMode !== "click";
    elements.revealModeRow.classList.toggle("hidden", !settings.revealOnHover);
    elements.clickRevealBindingRow.classList.toggle("hidden", !settings.revealOnHover || hoverMode);
    elements.clickRevealRetentionRow.classList.toggle("hidden", !settings.revealOnHover || hoverMode);
    elements.clickRevealActionRow.classList.toggle("hidden", !settings.revealOnHover || hoverMode);
    elements.hoverRevealDelayRow.classList.toggle("hidden", !settings.revealOnHover || !hoverMode);
    elements.revealDelayRow.classList.toggle("hidden", !settings.revealOnHover || !hoverMode);
    document.querySelectorAll("[data-reveal-mode]").forEach((button) => {
        const active = button.dataset.revealMode === (hoverMode ? "hover" : "click");
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-click-retention]").forEach((button) => {
        const active = button.dataset.clickRetention === (settings.clickRevealRetention === "multiple" ? "multiple" : "single");
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-click-action]").forEach((button) => {
        const active = button.dataset.clickAction === (settings.clickRevealPassThrough === false ? "block" : "pass");
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    elements.status.textContent = settings.enabled ? "Enabled" : "Disabled";
    elements.status.classList.toggle("disabled", !settings.enabled);
}

function showRevealChatFeedback(text) {
    const label = elements.revealChatBtn.querySelector("span");
    label.textContent = text;
    clearTimeout(showRevealChatFeedback.timer);
    showRevealChatFeedback.timer = setTimeout(() => {
        label.textContent = "Reveal Current Chat";
    }, 1400);
}

function formatDurationLabel(value) {
    const seconds = Number(value) || DEFAULTS.chatRevealDuration;
    if (seconds === 3600) return "1 hour";
    if (seconds >= 60 && seconds % 60 === 0) {
        const minutes = seconds / 60;
        return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
    }
    return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
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

function stopRevealBindingCapture() {
    capturingRevealBinding = false;
    elements.clickRevealBindingButton.classList.remove("capturing");
}

function stopChatRevealBindingCapture() {
    capturingChatRevealBinding = false;
    elements.chatRevealBindingButton.classList.remove("capturing");
}

function pointerBindingFromEvent(event) {
    const parts = [];
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (event.metaKey) parts.push("Meta");
    parts.push(({ 0: "Mouse1", 2: "Mouse2", 1: "Mouse3", 3: "Mouse4", 4: "Mouse5" })[event.button] || `Mouse${event.button + 1}`);
    return parts.join("+");
}

function modifierBindingFromEvent(event) {
    const released = event.key === "Control" ? "Ctrl" : event.key;
    const parts = [];
    if (event.ctrlKey || released === "Ctrl") parts.push("Ctrl");
    if (event.altKey || released === "Alt") parts.push("Alt");
    if (event.shiftKey || released === "Shift") parts.push("Shift");
    if (event.metaKey || released === "Meta") parts.push("Meta");
    return parts.join("+");
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
        Control: "Ctrl",
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

function clampDecimal(value, min, max, fallback) {
    const number = parseDecimal(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number * 100) / 100));
}

function parseDecimal(value) {
    return Number(String(value).trim().replace(",", "."));
}

function formatSeconds(value) {
    const seconds = Number(value) || 0;
    return Number.isInteger(seconds) ? seconds : Number(seconds.toFixed(2));
}

function askConfirm({ title, message, confirmText = "Confirm", cancelText = "Cancel" }) {
    return new Promise((resolve) => {
        const dialog = document.getElementById("confirmDialog");
        if (!dialog) {
            resolve(false);
            return;
        }
        if (dialog.open) dialog.close();

        customConfirmResolve = resolve;
        document.getElementById("confirmTitle").textContent = title;
        document.getElementById("confirmMessage").textContent = message;
        document.getElementById("confirmCancel").textContent = cancelText;
        document.getElementById("confirmAccept").textContent = confirmText;
        dialog.showModal();
        document.getElementById("confirmCancel").focus();
    });
}

function closeConfirmDialog(result) {
    const dialog = document.getElementById("confirmDialog");
    if (!customConfirmResolve) {
        if (dialog?.open) dialog.close();
        return;
    }

    const resolve = customConfirmResolve;
    customConfirmResolve = null;
    if (dialog.open) dialog.close(result ? "confirm" : "cancel");
    resolve(result);
}

const customConfirmDialog = document.getElementById("confirmDialog");
if (customConfirmDialog) {
    document.getElementById("confirmCancel").addEventListener("click", () => closeConfirmDialog(false));
    document.getElementById("confirmAccept").addEventListener("click", () => closeConfirmDialog(true));
    customConfirmDialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        closeConfirmDialog(false);
    });
    customConfirmDialog.addEventListener("click", (event) => {
        if (event.target !== customConfirmDialog || !customConfirmBackdropPointerDown) return;
        closeConfirmDialog(false);
    });
    customConfirmDialog.addEventListener("pointerdown", (event) => {
        customConfirmBackdropPointerDown = event.target === customConfirmDialog;
    });
    customConfirmDialog.addEventListener("pointerup", () => {
        setTimeout(() => {
            customConfirmBackdropPointerDown = false;
        }, 0);
    });
    customConfirmDialog.addEventListener("pointercancel", () => {
        customConfirmBackdropPointerDown = false;
    });
    customConfirmDialog.addEventListener("close", () => {
        if (!customConfirmResolve) return;
        const resolve = customConfirmResolve;
        customConfirmResolve = null;
        resolve(false);
    });
}


document.querySelectorAll("[data-rate-link]").forEach((link) => {
    if (navigator.userAgent.includes("Firefox")) {
        link.href = link.dataset.firefoxUrl;
    }
});
