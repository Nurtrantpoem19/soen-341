const sidebar = document.getElementById("career-sidebar");
const appShell = document.getElementById("app-shell");
const toggleButton = document.getElementById("sidebar-toggle");
const closeButton = document.getElementById("sidebar-close");
const backdrop = document.getElementById("sidebar-backdrop");
const mobileLayout = window.matchMedia("(max-width: 700px)");

function isMobileLayout() {
    return mobileLayout.matches;
}

function setMobileOpen(isOpen, returnFocus = false) {
    document.body.classList.toggle("sidebar-open", isOpen);
    backdrop.hidden = !isOpen;
    sidebar.inert = !isOpen;
    appShell.inert = isOpen;
    toggleButton.setAttribute("aria-expanded", String(isOpen));
    toggleButton.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");

    if (isOpen) {
        closeButton.focus();
        return;
    }

    if (returnFocus) {
        toggleButton.focus();
    }
}

function syncLayout() {
    if (isMobileLayout()) {
        setMobileOpen(false);
        sidebar.inert = true;
        appShell.inert = false;
        return;
    }

    document.body.classList.remove("sidebar-open");
    document.body.style.overflow = "";
    backdrop.hidden = true;
    sidebar.inert = false;
    appShell.inert = false;

    const isExpanded = !document.body.classList.contains("sidebar-collapsed");
    toggleButton.setAttribute("aria-expanded", String(isExpanded));
    toggleButton.setAttribute("aria-label", isExpanded ? "Collapse navigation" : "Expand navigation");
}

toggleButton.addEventListener("click", function () {
    if (isMobileLayout()) {
        setMobileOpen(!document.body.classList.contains("sidebar-open"));
        return;
    }

    const isCollapsed = document.body.classList.toggle("sidebar-collapsed");
    toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
    toggleButton.setAttribute("aria-label", isCollapsed ? "Expand navigation" : "Collapse navigation");
});

closeButton.addEventListener("click", function () {
    setMobileOpen(false, true);
});

backdrop.addEventListener("click", function () {
    setMobileOpen(false, true);
});

sidebar.addEventListener("click", function (event) {
    if (isMobileLayout() && event.target.closest("a.sidebar-link")) {
        setMobileOpen(false);
    }
});

document.addEventListener("keydown", function (event) {
    if (!isMobileLayout() || !document.body.classList.contains("sidebar-open")) {
        return;
    }

    if (event.key === "Escape") {
        setMobileOpen(false, true);
        return;
    }

    if (event.key !== "Tab") {
        return;
    }

    const focusableElements = sidebar.querySelectorAll("a[href], button:not([disabled])");
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
    }
});

mobileLayout.addEventListener("change", syncLayout);
syncLayout();
