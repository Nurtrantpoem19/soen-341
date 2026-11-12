const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initializeNotificationCenter } = require('../frontend/js/notifications');

class FakeElement {
    constructor(document, tagName, id = '') {
        this.document = document;
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.children = [];
        this.parentElement = null;
        this.attributes = {};
        this.dataset = {};
        this.listeners = new Map();
        this.className = '';
        this.textContent = '';
        this.hidden = false;
        this.disabled = false;
        this.href = '';
        this.datetime = '';
        this.classList = {
            add: name => this.setClass(name, true),
            remove: name => this.setClass(name, false),
            contains: name => this.className.split(/\s+/).includes(name)
        };
    }

    setClass(name, enabled) {
        const values = new Set(this.className.split(/\s+/).filter(Boolean));
        if (enabled) {
            values.add(name);
        } else {
            values.delete(name);
        }
        this.className = [...values].join(' ');
    }

    append(...elements) {
        elements.forEach(element => {
            element.parentElement = this;
            this.children.push(element);
        });
    }

    replaceChildren(...elements) {
        this.children.forEach(element => {
            element.parentElement = null;
        });
        this.children = [];
        this.append(...elements);
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    dispatch(type, event = {}) {
        (this.listeners.get(type) || []).forEach(listener => listener({
            target: this,
            preventDefault() {},
            ...event
        }));
    }

    click() {
        this.dispatch('click');
    }

    focus() {
        this.document.activeElement = this;
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    getAttribute(name) {
        return this.attributes[name] ?? null;
    }

    contains(element) {
        return this === element || this.children.some(child => child.contains(element));
    }
}

Object.defineProperty(FakeElement.prototype, 'innerHTML', {
    get() {
        return '';
    },
    set() {
        throw new Error('Notification UI must not assign innerHTML.');
    }
});

class FakeDocument {
    constructor() {
        this.elements = new Map();
        this.createdElements = [];
        this.listeners = new Map();
        this.visibilityState = 'visible';
        this.activeElement = null;
    }

    addElement(id) {
        const element = new FakeElement(this, 'div', id);
        this.elements.set(id, element);
        return element;
    }

    getElementById(id) {
        return this.elements.get(id) || null;
    }

    createElement(tagName) {
        const element = new FakeElement(this, tagName);
        this.createdElements.push(element);
        return element;
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    dispatch(type, event = {}) {
        (this.listeners.get(type) || []).forEach(listener => listener({
            preventDefault() {},
            ...event
        }));
    }
}

function createEnvironment({ token = 'valid-token', fetchImpl = async () => response({ count: 0 }) } = {}) {
    const document = new FakeDocument();
    const center = document.addElement('notification-center');
    center.hidden = true;
    const bell = document.addElement('notification-bell');
    const badge = document.addElement('notification-badge');
    const panel = document.addElement('notification-panel');
    panel.hidden = true;
    const closeButton = document.addElement('notification-close');
    const markAllButton = document.addElement('mark-all-read');
    const status = document.addElement('notification-status');
    const retryButton = document.addElement('notification-retry');
    const list = document.addElement('notification-list');
    center.append(bell, panel);
    bell.append(badge);
    panel.append(closeButton, markAllButton, status, retryButton, list);

    let storedToken = token;
    const sessionStorage = {
        getItem(key) {
            return key === 'careerconnect_token' ? storedToken : null;
        },
        removeItem(key) {
            if (key === 'careerconnect_token') {
                storedToken = null;
            }
        },
        setItem(key, value) {
            if (key === 'careerconnect_token') {
                storedToken = value;
            }
        }
    };
    const windowListeners = new Map();
    const intervals = new Map();
    const dispatchedEvents = [];
    let intervalId = 0;
    const window = {
        location: { origin: 'http://localhost:5500' },
        Event: class {
            constructor(type) {
                this.type = type;
            }
        },
        dispatchEvent(event) {
            dispatchedEvents.push(event.type);
            (windowListeners.get(event.type) || []).forEach(listener => listener(event));
        },
        addEventListener(type, listener) {
            const listeners = windowListeners.get(type) || [];
            listeners.push(listener);
            windowListeners.set(type, listeners);
        }
    };
    const calls = [];
    const fetch = async (url, options) => {
        calls.push({ url, options });
        return fetchImpl(url, options);
    };
    const setInterval = (callback, delay) => {
        intervalId += 1;
        intervals.set(intervalId, { callback, delay });
        return intervalId;
    };
    const clearInterval = id => intervals.delete(id);

    const controller = initializeNotificationCenter({
        document,
        window,
        sessionStorage,
        fetch,
        setInterval,
        clearInterval,
        URL
    });

    return {
        controller,
        document,
        center,
        bell,
        badge,
        panel,
        closeButton,
        markAllButton,
        status,
        retryButton,
        list,
        sessionStorage,
        window,
        calls,
        intervals,
        dispatchedEvents
    };
}

function response(data, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return data;
        }
    };
}

async function flushPromises() {
    await new Promise(resolve => setImmediate(resolve));
}

test('notification controls stay hidden without a session and issue no requests', () => {
    const ui = createEnvironment({ token: null });
    assert.equal(ui.center.hidden, true);
    assert.equal(ui.calls.length, 0);
    assert.equal(ui.intervals.size, 0);
});

test('notification controls resync when authentication changes in another tab', async () => {
    const ui = createEnvironment({ token: null });
    ui.sessionStorage.setItem('careerconnect_token', 'new-token');
    ui.window.dispatchEvent({ type: 'storage', key: 'careerconnect_token' });
    await flushPromises();

    assert.equal(ui.center.hidden, false);
    assert.equal(ui.intervals.size, 1);
    assert.equal(ui.calls.length, 1);
    assert.equal(ui.calls[0].options.headers.Authorization, 'Bearer new-token');

    ui.sessionStorage.removeItem('careerconnect_token');
    ui.window.dispatchEvent({ type: 'storage', key: 'careerconnect_token' });
    assert.equal(ui.center.hidden, true);
    assert.equal(ui.intervals.size, 0);
});

test('authenticated notification requests use Bearer auth and render safe, keyboard-accessible content', async () => {
    const ui = createEnvironment({
        fetchImpl: async url => {
            if (url.endsWith('/unread-count')) {
                return response({ count: 4 });
            }
            return response({
                notifications: [
                    {
                        id: 8,
                        title: '<img src=x onerror=alert(1)>',
                        message: '<script>unsafe()</script>',
                        link: '/frontend/job.html?id=9',
                        createdAt: '2026-11-12T12:00:00.000Z',
                        readAt: null
                    },
                    {
                        id: 7,
                        title: 'Untrusted link',
                        message: 'A message',
                        link: 'https://untrusted.example/',
                        readAt: '2026-11-11T12:00:00.000Z'
                    }
                ],
                nextBeforeId: null
            });
        }
    });

    await ui.controller.refreshUnreadCount();
    assert.equal(ui.center.hidden, false);
    assert.equal(ui.badge.textContent, '4');
    assert.equal(ui.badge.hidden, false);
    assert.equal(ui.bell.getAttribute('aria-label'), 'Notifications, 4 unread');
    assert.equal(ui.calls[0].options.headers.Authorization, 'Bearer valid-token');

    ui.controller.openPanel();
    await ui.controller.refreshNotifications();
    assert.equal(ui.panel.hidden, false);
    assert.equal(ui.document.activeElement, ui.closeButton);
    assert.equal(ui.bell.getAttribute('aria-expanded'), 'true');
    assert.equal(ui.list.children.length, 2);

    const message = ui.document.createdElements.find(element =>
        element.className === 'notification-item-message'
    );
    assert.equal(message.textContent, '<script>unsafe()</script>');
    const firstItem = ui.list.children[0];
    assert.ok(firstItem.classList.contains('is-unread'));
    assert.equal(firstItem.children[0].children[0].children[0].href, '/frontend/job.html?id=9');

    const secondItem = ui.list.children[1];
    assert.equal(secondItem.children[0].children[0].children.length, 0);
    assert.equal(secondItem.classList.contains('is-unread'), false);

    ui.document.dispatch('keydown', { key: 'Escape' });
    assert.equal(ui.panel.hidden, true);
    assert.equal(ui.bell.getAttribute('aria-expanded'), 'false');
    assert.equal(ui.document.activeElement, ui.bell);
});

test('notification actions call their PATCH endpoints and refresh state', async () => {
    const ui = createEnvironment({
        fetchImpl: async url => {
            if (url.endsWith('/unread-count')) {
                return response({ count: 1 });
            }
            if (url.endsWith('/8/read') || url.endsWith('/8/dismiss') || url.endsWith('/read-all')) {
                return response({ message: 'Updated.' });
            }
            return response({ notifications: [], nextBeforeId: null });
        }
    });

    await ui.controller.markAsRead(8);
    await ui.controller.dismissNotification(8);
    await ui.controller.markAllAsRead();

    const mutations = ui.calls.filter(call => call.options.method === 'PATCH');
    assert.deepEqual(mutations.map(call => call.url), [
        'http://localhost:3000/api/notifications/8/read',
        'http://localhost:3000/api/notifications/8/dismiss',
        'http://localhost:3000/api/notifications/read-all'
    ]);
    assert.ok(mutations.every(call => call.options.headers.Authorization === 'Bearer valid-token'));
    assert.equal(ui.calls.filter(call => call.url.endsWith('/unread-count')).length, 3);
});

test('empty list and API failures have visible status states', async () => {
    const empty = createEnvironment({
        fetchImpl: async url => url.endsWith('/unread-count')
            ? response({ count: 0 })
            : response({ notifications: [], nextBeforeId: null })
    });
    empty.controller.openPanel();
    await empty.controller.refreshNotifications();
    assert.equal(empty.status.textContent, 'You’re all caught up.');
    assert.equal(empty.markAllButton.disabled, true);

    const failed = createEnvironment({
        fetchImpl: async () => { throw new Error('network down'); }
    });
    await failed.controller.refreshUnreadCount();
    assert.equal(failed.status.dataset.state, 'error');
    assert.match(failed.status.textContent, /Unable to connect/);
    assert.equal(failed.retryButton.hidden, false);
});

test('a 401 clears the session, stops polling, and refreshes auth navigation', async () => {
    const ui = createEnvironment({
        fetchImpl: async () => response({ message: 'Expired.' }, 401)
    });
    await ui.controller.refreshUnreadCount();
    assert.equal(ui.sessionStorage.getItem('careerconnect_token'), null);
    assert.equal(ui.center.hidden, true);
    assert.equal(ui.intervals.size, 0);
    assert.deepEqual(ui.dispatchedEvents, ['careerconnect:auth-invalid']);
});

test('concurrent unread-count refreshes share one request', async () => {
    let resolveResponse;
    const ui = createEnvironment({
        fetchImpl: () => new Promise(resolve => {
            resolveResponse = resolve;
        })
    });
    const first = ui.controller.refreshUnreadCount();
    const second = ui.controller.refreshUnreadCount();
    await flushPromises();
    assert.equal(ui.calls.length, 1);
    resolveResponse(response({ count: 2 }));
    await Promise.all([first, second]);
});
