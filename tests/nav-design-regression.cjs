// Offline navigation behavior checks. No browser, real account, or network traffic.
// node tests/nav-design-regression.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../assets/mobile-navigation.js'), 'utf8');

function setup({ small = true, hostname = 'netvistastudio.com' } = {}) {
  const nodes = [], documentListeners = {}, windowListeners = {}, mediaListeners = {};
  const media = { matches: small, addEventListener(type, callback) { mediaListeners[type] = callback; } };
  let active = null;
  let header, toggle, nav;
  function matches(node, selector) {
    if (selector === 'a[href]') return node.tagName === 'A' && Boolean(node.href);
    if (selector.startsWith('#')) return node.id === selector.slice(1);
    return false;
  }
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.attrs = new Map();
      this.hidden = false; this.value = ''; this.parentElement = null; this.textContent = ''; this.id = '';
      const classes = new Set();
      this.classList = { add: value => classes.add(value), contains: value => classes.has(value),
        toggle(value, force) { const enabled = force === undefined ? !classes.has(value) : force; if (enabled) classes.add(value); else classes.delete(value); return enabled; } };
      nodes.push(this);
    }
    set innerHTML(_) { throw new Error('Shared navigation must never interpolate HTML'); }
    append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); }
    replaceChildren(...children) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; this.append(...children); }
    setAttribute(name, value) { this.attrs.set(name, String(value)); if (name === 'href') this.href = String(value); }
    getAttribute(name) { return name === 'href' ? this.href : this.attrs.get(name); }
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
    getClientRects() {
      let current = this;
      while (current) {
        if (current.hidden || (current === nav && media.matches && !header.classList.contains('nav-open')) || (current === toggle && !media.matches)) return [];
        current = current.parentElement;
      }
      return [{}];
    }
    focus() { active = this; }
    closest(selector) { let current = this; while (current) { if (matches(current, selector)) return current; current = current.parentElement; } return null; }
    descendants() { return this.children.flatMap(child => [child, ...(child.descendants?.() || [])]); }
    querySelector(selector) { return this.descendants().find(child => matches(child, selector)) || null; }
    querySelectorAll(selector) {
      if (selector.includes('button:not')) return this.descendants().filter(child => child.tagName === 'A' && child.href || child.tagName === 'BUTTON' && !child.disabled || child.tagName === 'INPUT' && !child.disabled || child.attrs?.get('tabindex') === '0');
      return this.descendants().filter(child => matches(child, selector));
    }
    fire(type, extra = {}) {
      const event = { target: this, currentTarget: this, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
      (this.listeners[type] || []).forEach(callback => callback(event));
      return event;
    }
    click() { this.fire('click'); }
  }
  function make(tag, id, parent) { const value = new Element(tag); value.id = id; if (parent) parent.append(value); return value; }
  const body = make('body', 'body');
  header = make('header', 'site-header', body);
  toggle = make('button', 'nav-toggle', header);
  nav = make('nav', 'primary-nav', header);
  const navLinks = ['/video-editor/', '/#work', '/#media', '/#studio', '/applications/'].map((href, index) => { const link = make('a', `nav-${index}`, nav); link.href = href; return link; });
  const searchToggle = make('button', 'search-toggle', header);
  const searchPanel = make('section', 'search-panel', body);
  const searchStatus = make('p', 'search-status', searchPanel);
  const searchInput = make('input', 'search-input', searchPanel);
  const searchClose = make('button', 'search-close', searchPanel);
  const searchResults = make('ul', 'search-results', searchPanel);
  const footer = make('footer', 'footer', body);
  const footerLink = make('a', 'footer-link', footer); footerLink.href = '/video-editor/getting-started/';
  const authLink = make('a', 'auth-link', body); authLink.href = '/editor/account/?redirect=%2F#recovery';
  const documentElement = make('html', 'html');
  const document = {
    body, documentElement, get activeElement() { return active; },
    createElement: tag => new Element(tag),
    createTextNode(text) { const value = new Element('#text'); value.textContent = text; return value; },
    querySelector(selector) { return selector === '[data-shared-navigation]' ? header : nodes.find(child => matches(child, selector)) || null; },
    querySelectorAll(selector) { return selector.startsWith('.nv-header') ? [...navLinks, footerLink] : []; },
    addEventListener(type, callback) { (documentListeners[type] ||= []).push(callback); }
  };
  const window = { location: { hostname }, matchMedia: () => media, addEventListener(type, callback) { (windowListeners[type] ||= []).push(callback); } };
  vm.runInNewContext(source, { window, document });
  function key(key, extra = {}) {
    const event = { key, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
    (documentListeners.keydown || []).forEach(callback => callback(event)); return event;
  }
  return { header, toggle, nav, navLinks, searchToggle, searchPanel, searchInput, searchClose, searchStatus, searchResults, footerLink, authLink, documentElement,
    backdrop: nodes.find(node => node.className === 'navigation-backdrop'), searchBackdrop: nodes.find(node => node.className === 'search-backdrop'),
    key, active: () => active, resize: () => (windowListeners.resize || []).forEach(callback => callback()),
    restore: () => (windowListeners.pageshow || []).forEach(callback => callback()),
    wide() { media.matches = false; mediaListeners.change(); },
    nestedClick(target) { nav.fire('click', { target }); }
  };
}

const site = setup();
assert.equal(site.toggle.getAttribute('aria-expanded'), 'false');
assert(site.searchPanel.hidden && site.backdrop.hidden && site.searchBackdrop.hidden, 'All overlays start closed');
site.toggle.focus(); site.toggle.click();
assert(site.header.classList.contains('nav-open') && !site.backdrop.hidden, 'Mobile menu opens with a backdrop');
assert.equal(site.toggle.getAttribute('aria-expanded'), 'true');
assert(site.documentElement.classList.contains('navigation-open'), 'Open menu locks background scrolling');
assert(site.key('Tab', { shiftKey: true }).prevented);
assert.equal(site.active(), site.navLinks.at(-1), 'Shift-Tab wraps from menu button to final link');
assert(site.key('Tab').prevented);
assert.equal(site.active(), site.toggle, 'Tab wraps back to menu button');
site.key('Escape');
assert(!site.header.classList.contains('nav-open') && site.backdrop.hidden);
assert.equal(site.active(), site.toggle, 'Escape restores menu focus');
site.toggle.click(); site.nestedClick(site.navLinks[1]);
assert(!site.header.classList.contains('nav-open'), 'Route selection closes menu');
site.toggle.click(); site.resize();
assert(!site.header.classList.contains('nav-open'), 'Resize closes menu without stale expanded state');
site.toggle.click(); site.backdrop.click();
assert(!site.header.classList.contains('nav-open'), 'Backdrop dismisses navigation');
site.toggle.click(); site.searchToggle.focus(); site.searchToggle.click();
assert(!site.header.classList.contains('nav-open') && !site.searchPanel.hidden && !site.searchBackdrop.hidden, 'Search replaces rather than stacks the menu');
assert.equal(site.active(), site.searchInput, 'Opening search focuses its input');
assert.equal(site.searchResults.children.length, 5, 'Search provides a useful initial set of pages');
site.searchInput.value = 'colour'; site.searchInput.fire('input');
assert.equal(site.searchResults.children.length, 2, 'Search spans tool and guide pages');
assert(site.searchStatus.textContent.includes('2 matching pages'));
const found = site.searchResults.querySelectorAll('a[href]');
assert(found.some(link => link.href === '/video-editor/colour-grading-luts/'));
const last = found.at(-1); last.focus();
assert(site.key('Tab').prevented);
assert.equal(site.active(), site.searchInput, 'Search Tab stays in the search panel');
site.key('Tab', { shiftKey: true });
assert.equal(site.active(), last, 'Search reverse-Tab wraps through actual results');
site.searchInput.value = '<img onerror=alert(1)>'; site.searchInput.fire('input');
assert.equal(site.searchResults.children.length, 1);
assert.equal(site.searchResults.children[0].className, 'search-empty', 'Untrusted input is not inserted as HTML');
assert.equal(site.searchResults.querySelectorAll('a[href]').length, 0);
site.key('Escape');
assert(site.searchPanel.hidden && site.searchBackdrop.hidden && !site.documentElement.classList.contains('search-open'));
assert.equal(site.active(), site.searchToggle, 'Search Escape restores original focus');
assert.equal(site.searchInput.value, '', 'Closing search clears the query');
site.searchToggle.click(); site.searchClose.click(); assert(site.searchPanel.hidden, 'Close button dismisses search');
site.searchToggle.click(); site.searchBackdrop.click(); assert(site.searchPanel.hidden, 'Outside search backdrop dismisses search');
site.searchToggle.click(); site.toggle.click();
assert(site.searchPanel.hidden && site.header.classList.contains('nav-open'), 'Menu and search cannot overlap');
site.wide();
assert(!site.header.classList.contains('nav-open') && site.backdrop.hidden, 'Desktop breakpoint restores nonmodal navigation');
site.searchToggle.click(); site.restore();
assert(site.searchPanel.hidden && site.searchBackdrop.hidden, 'Back-forward cache restoration cannot leave a stale search overlay');

const watch = setup({ hostname: 'video.netvistastudio.com' });
assert(watch.navLinks.every(link => link.href.startsWith('https://netvistastudio.com/')), 'Watch account header links open actual studio routes');
assert(watch.footerLink.href.startsWith('https://netvistastudio.com/'), 'Watch account footer links open actual studio routes');
assert.equal(watch.authLink.href, '/editor/account/?redirect=%2F#recovery', 'Public navigation normalization never touches account callbacks');
watch.searchToggle.click();
assert(watch.searchResults.querySelectorAll('a[href]').every(link => link.href.startsWith('https://netvistastudio.com/')), 'Watch account quick search opens studio pages, not Watch routes');
const local = setup({ hostname: '127.0.0.1' });
assert(local.navLinks.every(link => link.href.startsWith('/')), 'Local preview routes remain local');
console.log('PASS: shared navigation, keyboard/focus behavior, safe quick search, Watch account routes and local preview routes');
