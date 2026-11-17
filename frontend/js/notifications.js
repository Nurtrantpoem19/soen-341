(function (root) {
    const API_URL = "http://localhost:3000/api/notifications";
    const TOKEN_KEY = "careerconnect_token";
    const POLL_INTERVAL_MS = 30000;

    class SessionExpiredError extends Error {}

    function initializeNotificationCenter(environment) {
        const document = environment.document;
        const window = environment.window;
        const sessionStorage = environment.sessionStorage;
        const fetch = environment.fetch;
        const setInterval = environment.setInterval;
        const clearInterval = environment.clearInterval;

        const center = document.getElementById("notification-center");
        const bell = document.getElementById("notification-bell");
        const badge = document.getElementById("notification-badge");
        const panel = document.getElementById("notification-panel");
        const closeButton = document.getElementById("notification-close");
        const markAllButton = document.getElementById("mark-all-read");
        const status = document.getElementById("notification-status");
        const retryButton = document.getElementById("notification-retry");
        const list = document.getElementById("notification-list");

        if (!center || !bell || !badge || !panel || !closeButton ||
            !markAllButton || !status || !retryButton || !list) {
            return null;
        }

        let countRequest = null;
        let listRequest = null;
        let pollTimer = null;
        let sessionInvalidated = false;
        let unreadCount = null;
        const pendingActions = new Set();

        function getToken() {
            return sessionStorage.getItem(TOKEN_KEY);
        }

        function setStatus(message, state = "") {
            status.textContent = message;
            status.dataset.state = state;
            retryButton.hidden = state !== "error";
        }

        function setUnreadCount(value) {
            const count = Number(value);
            if (!Number.isSafeInteger(count) || count < 0) {
                throw new Error("The server returned an invalid unread notification count.");
            }

            unreadCount = count;
            badge.textContent = count > 99 ? "99+" : String(count);
            badge.hidden = count === 0;
            bell.setAttribute(
                "aria-label",
                count === 0 ? "Notifications" : `Notifications, ${count} unread`
            );
            markAllButton.disabled = count === 0;
        }

        function invalidateSession() {
            if (sessionInvalidated) {
                return;
            }

            sessionInvalidated = true;
            sessionStorage.removeItem(TOKEN_KEY);
            center.hidden = true;
            panel.hidden = true;
            bell.setAttribute("aria-expanded", "false");
            stopPolling();
            window.dispatchEvent(new window.Event("careerconnect:auth-invalid"));
        }

        async function requestJson(path, options, fallbackMessage) {
            const token = getToken();
            if (!token) {
                invalidateSession();
                throw new SessionExpiredError("Please log in to view notifications.");
            }

            let response;
            try {
                response = await fetch(`${API_URL}${path}`, {
                    ...options,
                    headers: {
                        Authorization: `Bearer ${token}`,
                        ...(options && options.headers ? options.headers : {})
                    }
                });
            } catch (error) {
                throw new Error("Unable to connect to the server. Please try again.");
            }

            if (response.status === 401) {
                invalidateSession();
                throw new SessionExpiredError("Your session has expired. Please log in again.");
            }

            let data;
            try {
                data = await response.json();
            } catch (error) {
                if (response.ok) {
                    throw new Error("The server returned an invalid notification response.");
                }
                data = null;
            }

            if (!response.ok) {
                throw new Error(data && data.message ? data.message : fallbackMessage);
            }
            if (!data || typeof data !== "object") {
                throw new Error("The server returned an invalid notification response.");
            }

            return data;
        }

        function safeInternalHref(value) {
            if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
                return null;
            }

            try {
                const url = new environment.URL(value, window.location.origin);
                if (url.origin !== window.location.origin) {
                    return null;
                }
                return `${url.pathname}${url.search}${url.hash}`;
            } catch (error) {
                return null;
            }
        }

        function createNotificationItem(notification) {
            const item = document.createElement("li");
            const unread = !notification.readAt;
            item.className = unread
                ? "notification-item is-unread"
                : "notification-item";

            const heading = document.createElement("div");
            heading.className = "notification-item-heading";

            const title = document.createElement("h3");
            title.className = "notification-item-title";
            const titleText = typeof notification.title === "string"
                ? notification.title
                : "Notification";
            const href = safeInternalHref(notification.link);
            if (href) {
                const link = document.createElement("a");
                link.href = href;
                link.textContent = titleText;
                title.append(link);
            } else {
                title.textContent = titleText;
            }

            const state = document.createElement("span");
            state.className = "notification-item-state";
            state.textContent = unread ? "Unread" : "Read";
            heading.append(title, state);

            const message = document.createElement("p");
            message.className = "notification-item-message";
            message.textContent = typeof notification.message === "string"
                ? notification.message
                : "";
            item.append(heading, message);

            if (typeof notification.createdAt === "string") {
                const createdAt = new Date(notification.createdAt);
                if (!Number.isNaN(createdAt.getTime())) {
                    const time = document.createElement("time");
                    time.dateTime = createdAt.toISOString();
                    time.textContent = createdAt.toLocaleString();
                    item.append(time);
                }
            }

            const notificationId = Number(notification.id);
            const actions = document.createElement("div");
            actions.className = "notification-item-actions";

            if (Number.isSafeInteger(notificationId) && notificationId > 0) {
                if (unread) {
                    const readButton = document.createElement("button");
                    readButton.type = "button";
                    readButton.textContent = "Mark as read";
                    readButton.addEventListener("click", function () {
                        void markAsRead(notificationId);
                    });
                    actions.append(readButton);
                }

                const dismissButton = document.createElement("button");
                dismissButton.type = "button";
                dismissButton.textContent = "Dismiss";
                dismissButton.addEventListener("click", function () {
                    void dismissNotification(notificationId);
                });
                actions.append(dismissButton);
            }

            if (actions.children.length > 0) {
                item.append(actions);
            }

            return item;
        }

        function renderNotifications(notifications) {
            if (!Array.isArray(notifications)) {
                throw new Error("The server returned an invalid notification list.");
            }

            list.replaceChildren(...notifications.map(createNotificationItem));
            if (notifications.length === 0) {
                setStatus("You’re all caught up.");
            } else {
                setStatus("");
            }
            markAllButton.disabled = unreadCount === 0;
        }

        async function refreshUnreadCount() {
            if (!getToken() || sessionInvalidated) {
                return;
            }
            if (countRequest) {
                return countRequest;
            }

            const currentRequest = (async function () {
                try {
                    const data = await requestJson(
                        "/unread-count",
                        { method: "GET" },
                        "Unable to load unread notifications."
                    );
                    setUnreadCount(data.count);
                } catch (error) {
                    if (!(error instanceof SessionExpiredError)) {
                        setStatus(error.message || "Unable to load unread notifications.", "error");
                    }
                }
            })();

            countRequest = currentRequest;
            try {
                await currentRequest;
            } finally {
                if (countRequest === currentRequest) {
                    countRequest = null;
                }
            }
        }

        async function refreshNotifications() {
            if (!getToken() || sessionInvalidated) {
                return;
            }
            if (listRequest) {
                return listRequest;
            }

            setStatus("Loading notifications...", "loading");
            retryButton.hidden = true;
            list.setAttribute("aria-busy", "true");

            const currentRequest = (async function () {
                try {
                    const data = await requestJson(
                        "",
                        { method: "GET" },
                        "Unable to load notifications."
                    );
                    renderNotifications(data.notifications);
                } catch (error) {
                    if (!(error instanceof SessionExpiredError)) {
                        setStatus(error.message || "Unable to load notifications.", "error");
                    }
                } finally {
                    list.setAttribute("aria-busy", "false");
                }
            })();

            listRequest = currentRequest;
            try {
                await currentRequest;
            } finally {
                if (listRequest === currentRequest) {
                    listRequest = null;
                }
            }
        }

        async function runAction(key, path, successMessage) {
            if (!getToken() || sessionInvalidated || pendingActions.has(key)) {
                return;
            }

            pendingActions.add(key);
            try {
                await requestJson(
                    path,
                    { method: "PATCH" },
                    "Unable to update notifications."
                );
                setStatus(successMessage);
                await Promise.all([refreshNotifications(), refreshUnreadCount()]);
            } catch (error) {
                if (!(error instanceof SessionExpiredError)) {
                    setStatus(error.message || "Unable to update notifications.", "error");
                }
            } finally {
                pendingActions.delete(key);
            }
        }

        function markAsRead(id) {
            return runAction(`read:${id}`, `/${encodeURIComponent(id)}/read`, "Notification marked as read.");
        }

        function dismissNotification(id) {
            return runAction(`dismiss:${id}`, `/${encodeURIComponent(id)}/dismiss`, "Notification dismissed.");
        }

        function markAllAsRead() {
            return runAction("read-all", "/read-all", "All notifications marked as read.");
        }

        function openPanel() {
            if (center.hidden || !getToken()) {
                return;
            }

            panel.hidden = false;
            bell.setAttribute("aria-expanded", "true");
            closeButton.focus();
            void refreshNotifications();
        }

        function closePanel(restoreFocus = false) {
            panel.hidden = true;
            bell.setAttribute("aria-expanded", "false");
            if (restoreFocus && !center.hidden) {
                bell.focus();
            }
        }

        function stopPolling() {
            if (pollTimer !== null) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        }

        function synchronizeSession() {
            if (!getToken()) {
                center.hidden = true;
                closePanel();
                badge.hidden = true;
                badge.textContent = "";
                unreadCount = null;
                markAllButton.disabled = true;
                stopPolling();
                return;
            }

            sessionInvalidated = false;
            center.hidden = false;
            if (document.visibilityState === "visible") {
                startPolling();
                void refreshUnreadCount();
            }
        }

        function startPolling() {
            if (pollTimer !== null || !getToken() || document.visibilityState !== "visible") {
                return;
            }

            pollTimer = setInterval(function () {
                if (document.visibilityState === "visible" && getToken()) {
                    void refreshUnreadCount();
                }
            }, POLL_INTERVAL_MS);
        }

        bell.addEventListener("click", function () {
            if (panel.hidden) {
                openPanel();
            } else {
                closePanel();
            }
        });
        closeButton.addEventListener("click", function () {
            closePanel(true);
        });
        markAllButton.addEventListener("click", function () {
            void markAllAsRead();
        });
        retryButton.addEventListener("click", function () {
            void Promise.all([refreshUnreadCount(), refreshNotifications()]);
        });
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && !panel.hidden) {
                event.preventDefault();
                closePanel(true);
            }
        });
        document.addEventListener("click", function (event) {
            if (!panel.hidden && !center.contains(event.target)) {
                closePanel();
            }
        });
        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible" && getToken()) {
                void refreshUnreadCount();
                startPolling();
            } else {
                stopPolling();
            }
        });
        window.addEventListener("storage", function (event) {
            if (event.key === TOKEN_KEY || event.key === null) {
                synchronizeSession();
            }
        });

        if (!getToken()) {
            center.hidden = true;
            return {
                refreshUnreadCount,
                refreshNotifications,
                markAsRead,
                dismissNotification,
                markAllAsRead,
                openPanel,
                closePanel
            };
        }

        center.hidden = false;
        if (document.visibilityState === "visible") {
            startPolling();
            void refreshUnreadCount();
        }

        return {
            refreshUnreadCount,
            refreshNotifications,
            markAsRead,
            dismissNotification,
            markAllAsRead,
            openPanel,
            closePanel
        };
    }

    if (typeof module === "object" && module.exports) {
        module.exports = { initializeNotificationCenter };
    } else {
        initializeNotificationCenter({
            document: root.document,
            window: root,
            sessionStorage: root.sessionStorage,
            fetch: root.fetch.bind(root),
            setInterval: root.setInterval.bind(root),
            clearInterval: root.clearInterval.bind(root),
            URL: root.URL
        });
    }
})(globalThis);
