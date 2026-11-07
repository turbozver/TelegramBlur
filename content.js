(() => {
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

    let settings = { ...DEFAULTS };
    let idleTimer = null;
    let idleForcedBlur = false;
    let transitionResetTimer = null;
    let revealPointerFrame = 0;
    let revealPointerTarget = null;
    let pointerX = 0;
    let pointerY = 0;
    const clickRevealTargets = new Set();
    let chatRevealTimer = null;
    let chatRevealWatchTimer = null;
    let chatRevealKey = "";
    let clickRevealSuppressionUntil = 0;
    let clickRevealSuppressedButton = -1;

    chrome.storage.local.get(["telegramBlurSettings"], (data) => {
        settings = normalizeSettings(data.telegramBlurSettings);
        applySettings();
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.type === "telegram_blur_settings") {
            settings = normalizeSettings(message.settings);
            applySettings();
            return;
        }
        if (message?.type === "telegram_blur_reveal_chat") {
            if (!document.querySelector("#column-center")) {
                sendResponse({ ok: false });
                return;
            }
            sendResponse({ ok: true, revealed: toggleCurrentChatReveal(message.duration) });
        }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes.telegramBlurSettings) return;
        settings = normalizeSettings(changes.telegramBlurSettings.newValue);
        applySettings();
    });

    document.addEventListener("keydown", handleShortcut, true);
    document.addEventListener("keydown", handleChatRevealKey, true);
    document.addEventListener("pointerdown", handleChatRevealPointer, true);
    document.addEventListener("click", suppressChatRevealPointerAction, true);
    document.addEventListener("auxclick", suppressChatRevealPointerAction, true);
    document.addEventListener("contextmenu", suppressChatRevealPointerAction, true);
    document.addEventListener("keydown", handleClickRevealKey, true);
    document.addEventListener("pointerdown", handleClickRevealPointer, true);
    document.addEventListener("click", suppressBoundPointerAction, true);
    document.addEventListener("auxclick", suppressBoundPointerAction, true);
    document.addEventListener("contextmenu", suppressBoundPointerAction, true);
    document.addEventListener("pointermove", handleRevealPointerMove, { capture: true, passive: true });
    document.addEventListener("pointerleave", clearRevealPointerTarget, true);
    for (const eventName of ["mousemove", "mousedown", "wheel", "touchstart", "keydown"]) {
        document.addEventListener(eventName, scheduleIdleBlur, { capture: true, passive: true });
    }

    function normalizeSettings(value) {
        return {
            ...DEFAULTS,
            ...(value || {}),
            revealMode: value?.revealMode === "click" ? "click" : "hover",
            clickRevealBinding: String(value?.clickRevealBinding || DEFAULTS.clickRevealBinding),
            clickRevealRetention: value?.clickRevealRetention === "multiple" ? "multiple" : "single",
            clickRevealPassThrough: value?.clickRevealPassThrough !== false,
            hoverRevealDelay: clampNumber(value?.hoverRevealDelay, 0, 10, DEFAULTS.hoverRevealDelay),
            chatRevealDuration: clampNumber(value?.chatRevealDuration, 1, 3600, DEFAULTS.chatRevealDuration),
            chatRevealBinding: String(value?.chatRevealBinding || ""),
            blurText: value?.blurText !== false,
            blurAvatars: value?.blurAvatars !== false,
            blurMedia: value?.blurMedia !== false,
            blurChatListMessage: value?.blurChatListMessage !== false,
            blurChatListIdentity: value?.blurChatListIdentity !== false,
            blurChatListBadges: value?.blurChatListBadges !== false,
            blurCurrentAuthor: value?.blurCurrentAuthor !== false,
            blurCurrentMessages: value?.blurCurrentMessages !== false,
            blurCurrentHeader: value?.blurCurrentHeader !== false,
            blurCurrentPinned: value?.blurCurrentPinned !== false,
            blurCurrentDates: value?.blurCurrentDates !== false,
            textBlur: clampNumber(value?.textBlur, 2, 32, DEFAULTS.textBlur),
            mediaBlur: clampNumber(value?.mediaBlur, 8, 64, DEFAULTS.mediaBlur),
            blurBackground: !!value?.blurBackground,
            shortcut: String(value?.shortcut || DEFAULTS.shortcut),
            idleBlurDelay: clampNumber(value?.idleBlurDelay, 0, 3600, DEFAULTS.idleBlurDelay),
            revealBlurDelay: clampNumber(value?.revealBlurDelay, 0, 60, DEFAULTS.revealBlurDelay)
        };
    }

    function applySettings() {
        const root = document.documentElement;
        if (settings.enabled) idleForcedBlur = false;
        const enabled = isBlurEnabled();
        root.classList.add("tgblur-skip-return-delay");
        clearTimeout(transitionResetTimer);
        root.classList.toggle("tgblur-enabled", enabled);
        root.classList.toggle("tgblur-reveal-hover", enabled && !!settings.revealOnHover && settings.revealMode === "hover");
        root.classList.toggle("tgblur-reveal-click", enabled && !!settings.revealOnHover && settings.revealMode === "click");
        root.classList.toggle("tgblur-blur-text", !!settings.blurText);
        root.classList.toggle("tgblur-blur-avatars", !!settings.blurAvatars);
        root.classList.toggle("tgblur-blur-media", !!settings.blurMedia);
        root.classList.toggle("tgblur-chatlist-message", !!settings.blurChatListMessage);
        root.classList.toggle("tgblur-chatlist-identity", !!settings.blurChatListIdentity);
        root.classList.toggle("tgblur-chatlist-badges", !!settings.blurChatListBadges);
        root.classList.toggle("tgblur-current-author", !!settings.blurCurrentAuthor);
        root.classList.toggle("tgblur-current-messages", !!settings.blurCurrentMessages);
        root.classList.toggle("tgblur-current-header", !!settings.blurCurrentHeader);
        root.classList.toggle("tgblur-current-pinned", !!settings.blurCurrentPinned);
        root.classList.toggle("tgblur-current-dates", !!settings.blurCurrentDates);
        root.classList.toggle("tgblur-background", !!settings.blurBackground);
        root.style.setProperty("--tgblur-text-blur", `${settings.textBlur}px`);
        root.style.setProperty("--tgblur-media-blur", `${settings.mediaBlur}px`);
        root.style.setProperty("--tgblur-avatar-blur", `${Math.max(6, Math.min(12, Math.round(settings.mediaBlur * 0.42)))}px`);
        root.style.setProperty("--tgblur-small-avatar-blur", `${Math.max(4, Math.min(8, Math.round(settings.mediaBlur * 0.28)))}px`);
        root.style.setProperty("--tgblur-reveal-delay", `${settings.revealBlurDelay}s`);
        root.style.setProperty("--tgblur-hover-delay", `${settings.hoverRevealDelay}s`);
        if (!enabled || !settings.revealOnHover || settings.revealMode !== "hover") clearRevealPointerTarget();
        if (!enabled || !settings.revealOnHover || settings.revealMode !== "click") clearClickRevealTarget();
        if (settings.clickRevealRetention === "single" && clickRevealTargets.size > 1) clearClickRevealTarget();
        if (!enabled) clearChatReveal();
        transitionResetTimer = setTimeout(() => {
            root.classList.remove("tgblur-skip-return-delay");
        }, 180);
        scheduleIdleBlur();
    }

    function handleRevealPointerMove(event) {
        pointerX = event.clientX;
        pointerY = event.clientY;
        if (revealPointerFrame) return;
        revealPointerFrame = requestAnimationFrame(updateRevealPointerTarget);
    }

    function updateRevealPointerTarget() {
        revealPointerFrame = 0;
        if (!isBlurEnabled() || !settings.revealOnHover || settings.revealMode !== "hover") {
            clearRevealPointerTarget();
            return;
        }

        const hovered = document.elementFromPoint(pointerX, pointerY);
        const bubble = hovered?.closest?.(".bubbles .bubble:not(.service)");
        const content = bubble?.querySelector(":scope > .bubble-content-wrapper > .bubble-content");
        let nextTarget = null;

        if (revealPointerTarget?.isConnected && containsPointer(revealPointerTarget)) {
            nextTarget = revealPointerTarget;
        } else if (content && containsPointer(content)) {
            nextTarget = content;
        } else if (hovered?.closest?.(".bubbles")) {
            const contents = document.querySelectorAll(".bubbles .bubble:not(.service) .bubble-content");
            for (const candidate of contents) {
                if (containsPointer(candidate)) {
                    nextTarget = candidate;
                    break;
                }
            }
        }

        if (nextTarget === revealPointerTarget) return;
        revealPointerTarget?.classList.remove("tgblur-pointer-reveal");
        revealPointerTarget = nextTarget;
        revealPointerTarget?.classList.add("tgblur-pointer-reveal");
    }

    function containsPointer(element) {
        const rect = element.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) return false;
        return pointerX >= rect.left &&
            pointerX <= rect.right &&
            pointerY >= rect.top &&
            pointerY <= rect.bottom;
    }

    function clearRevealPointerTarget() {
        if (revealPointerFrame) {
            cancelAnimationFrame(revealPointerFrame);
            revealPointerFrame = 0;
        }
        revealPointerTarget?.classList.remove("tgblur-pointer-reveal");
        revealPointerTarget = null;
    }

    function handleClickRevealPointer(event) {
        if (!canUseClickReveal() || !matchesPointerBinding(event, settings.clickRevealBinding)) return;
        const target = getClickRevealTarget(event.composedPath?.() || [event.target]);
        if (!target) return;
        if (!settings.clickRevealPassThrough) {
            event.preventDefault();
            event.stopImmediatePropagation();
            clickRevealSuppressionUntil = Date.now() + 600;
            clickRevealSuppressedButton = event.button;
        }
        toggleClickReveal(target);
    }

    function suppressBoundPointerAction(event) {
        if (!canUseClickReveal() || settings.clickRevealPassThrough || !matchesPointerBinding(event, settings.clickRevealBinding)) return;
        if (Date.now() > clickRevealSuppressionUntil || event.button !== clickRevealSuppressedButton) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function handleClickRevealKey(event) {
        if (event.repeat || !canUseClickReveal() || !matchesShortcut(event, settings.clickRevealBinding)) return;
        const hovered = document.elementFromPoint(pointerX, pointerY);
        const target = getClickRevealTarget([hovered, document.activeElement]);
        if (!target) return;
        if (!settings.clickRevealPassThrough) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
        toggleClickReveal(target);
    }

    function canUseClickReveal() {
        return isBlurEnabled() && settings.revealOnHover && settings.revealMode === "click";
    }

    function getClickRevealTarget(sources) {
        const selector = [
            ".bubbles .bubble:not(.service)",
            ".bubbles .bubble.service",
            ".bubbles-group-avatar-container",
            ".chatlist-chat",
            ".stories-list [role='button']",
            ".pinned-message",
            ".reply-wrapper-content",
            ".search-super-item",
            ".btn-menu-item",
            ".topbar-call-center",
            ".sidebar-header .chat-info .person",
            ".profile-content",
            ".settings-container .row",
            ".shared-media-container .row",
            ".shared-media-container .chatlist-chat"
        ].join(",");
        for (const source of sources) {
            if (!(source instanceof Element)) continue;
            const target = source.matches(selector) ? source : source.closest(selector);
            if (target) return target;
        }
        for (const source of sources) {
            if (!(source instanceof Element)) continue;
            const style = getComputedStyle(source);
            const backdrop = style.backdropFilter || style.webkitBackdropFilter;
            if (style.filter !== "none" || (backdrop && backdrop !== "none")) return source;
        }
        return null;
    }

    function toggleClickReveal(target) {
        pruneClickRevealTargets();
        if (!target) {
            if (settings.clickRevealRetention === "single") clearClickRevealTarget();
            return;
        }
        if (clickRevealTargets.has(target)) {
            target.classList.remove("tgblur-click-reveal");
            clickRevealTargets.delete(target);
            return;
        }
        if (settings.clickRevealRetention === "single") clearClickRevealTarget();
        target.classList.add("tgblur-click-reveal");
        clickRevealTargets.add(target);
    }

    function matchesPointerBinding(event, binding) {
        const parts = String(binding || "").split("+").map((part) => part.trim().toLowerCase()).filter(Boolean);
        const expectedButton = parts.find((part) => /^mouse[1-5]$/.test(part));
        if (!expectedButton || pointerButtonName(event.button).toLowerCase() !== expectedButton) return false;
        return event.ctrlKey === parts.includes("ctrl") &&
            event.altKey === parts.includes("alt") &&
            event.shiftKey === parts.includes("shift") &&
            event.metaKey === parts.includes("meta");
    }

    function pointerButtonName(button) {
        return ({ 0: "Mouse1", 2: "Mouse2", 1: "Mouse3", 3: "Mouse4", 4: "Mouse5" })[button] || "";
    }

    function clearClickRevealTarget() {
        for (const target of clickRevealTargets) target.classList.remove("tgblur-click-reveal");
        clickRevealTargets.clear();
    }

    function pruneClickRevealTargets() {
        for (const target of clickRevealTargets) {
            if (target.isConnected) continue;
            clickRevealTargets.delete(target);
        }
    }

    function handleChatRevealKey(event) {
        if (event.repeat || !settings.chatRevealBinding || !matchesShortcut(event, settings.chatRevealBinding)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        toggleCurrentChatReveal(settings.chatRevealDuration);
    }

    function handleChatRevealPointer(event) {
        if (!settings.chatRevealBinding || !matchesPointerBinding(event, settings.chatRevealBinding)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        toggleCurrentChatReveal(settings.chatRevealDuration);
    }

    function suppressChatRevealPointerAction(event) {
        if (!settings.chatRevealBinding || !matchesPointerBinding(event, settings.chatRevealBinding)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function toggleCurrentChatReveal(duration) {
        if (!isBlurEnabled()) return false;
        const currentKey = getCurrentChatKey();
        if (document.documentElement.classList.contains("tgblur-reveal-chat") && currentKey === chatRevealKey) {
            clearChatReveal();
            return false;
        }
        clearTimeout(chatRevealTimer);
        document.documentElement.classList.add("tgblur-reveal-chat");
        chatRevealKey = currentKey;
        const seconds = clampNumber(duration, 1, 3600, settings.chatRevealDuration);
        chatRevealTimer = setTimeout(clearChatReveal, seconds * 1000);
        clearInterval(chatRevealWatchTimer);
        chatRevealWatchTimer = setInterval(() => {
            if (getCurrentChatKey() !== chatRevealKey) clearChatReveal();
        }, 100);
        return true;
    }

    function clearChatReveal() {
        clearTimeout(chatRevealTimer);
        clearInterval(chatRevealWatchTimer);
        chatRevealTimer = null;
        chatRevealWatchTimer = null;
        chatRevealKey = "";
        document.documentElement.classList.remove("tgblur-reveal-chat");
    }

    function getCurrentChatKey() {
        if (location.hash && location.hash !== "#") return `route:${location.pathname}${location.hash}`;
        const peer = document.querySelector("#column-center .sidebar-header .chat-info [data-peer-id]")?.getAttribute("data-peer-id");
        return peer ? `peer:${peer}` : `route:${location.pathname}${location.hash}`;
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
        if (idleForcedBlur && !settings.enabled) {
            idleForcedBlur = false;
            applySettings();
            return;
        }
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

    function scheduleIdleBlur() {
        clearTimeout(idleTimer);
        const delay = Number(settings.idleBlurDelay) || 0;
        if (delay <= 0 || isBlurEnabled()) return;

        idleTimer = setTimeout(() => {
            idleForcedBlur = true;
            applySettings();
        }, delay * 1000);
    }

    function isBlurEnabled() {
        return !!settings.enabled || idleForcedBlur;
    }
})();
