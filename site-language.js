import home from './i18n-home.js';
import coreTour from './i18n-tour-core.js';
import operationsTour from './i18n-tour-ops.js';

const spanish = { ...operationsTour, ...coreTour, ...home };
const storageKey = 'wmt-language';
const previewOrigin = 'https://weaver-maritime-portal-preview.chummyshrew24.chatgpt.site/';
const translatedAttributes = ['alt', 'aria-label', 'placeholder', 'title', 'content'];
const excluded = 'script, style, noscript, textarea, [data-wmt-language], [data-wmt-portal], [data-wmt-statement]';
const sourceValues = new WeakMap();
const messagesWithFields = [
  {
    pattern: /^Thanks, (.+)\. Your message is with our team, and we’ll reply to (.+)\.$/u,
    template: 'Thanks, {first}. Your message is with our team, and we’ll reply to {email}.',
    fields: ['first', 'email'],
  },
  {
    pattern: /^Your email app should now be open with your message to (.+)\. Press send there to finish\. If nothing opened, write to us directly at$/u,
    template: 'Your email app should now be open with your message to {inbox}. Press send there to finish. If nothing opened, write to us directly at',
    fields: ['inbox'],
  },
];

function preferredLanguage() {
  const requested = new URLSearchParams(location.search).get('lang');
  if (requested === 'en' || requested === 'es') return requested;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'en' || stored === 'es') return stored;
  } catch {}
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

let language = preferredLanguage();

function translate(value) {
  if (Object.hasOwn(spanish, value)) return spanish[value];
  for (const { pattern, template, fields } of messagesWithFields) {
    const match = value.match(pattern);
    if (!match || !spanish[template]) continue;
    return fields.reduce((message, field, index) =>
      message.replace(`{${field}}`, () => match[index + 1]), spanish[template]);
  }
  return null;
}

function localized(owner, slot, value) {
  const previous = sourceValues.get(owner)?.get(slot);
  const original = previous?.shown === value ? previous.original : value;
  const normalized = original.trim().replace(/\s+/gu, ' ');
  const translation = translate(normalized);
  if (translation === null) return original;
  const shown = language === 'es' ? original.replace(original.trim(), () => translation) : original;
  const slots = sourceValues.get(owner) || new Map();
  slots.set(slot, { original, shown });
  sourceValues.set(owner, slots);
  return shown;
}

function translateText(node) {
  if (node.parentElement?.closest(excluded)) return;
  const shown = localized(node, 'text', node.data);
  if (shown !== node.data) node.data = shown;
}

function translateAttributes(element) {
  if (element.closest(excluded)) return;
  for (const attribute of translatedAttributes) {
    if (attribute === 'content' && !element.matches('meta[name="description"], meta[property^="og:"]')) continue;
    const current = element.getAttribute(attribute);
    if (current === null) continue;
    const shown = localized(element, attribute, current);
    if (shown !== current) element.setAttribute(attribute, shown);
  }
}

function localizeSubtree(root) {
  if (root.nodeType === Node.TEXT_NODE) return translateText(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  translateAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) translateText(node);
    else translateAttributes(node);
  }
}

function syncControls() {
  document.documentElement.lang = language;
  document.documentElement.dataset.wmtLocale = language;
  for (const button of document.querySelectorAll('[data-wmt-language]')) {
    const label = language === 'es' ? 'English' : 'Español';
    const nextLanguage = language === 'es' ? 'en' : 'es';
    const text = button.querySelector('span');
    if (text.textContent !== label) text.textContent = label;
    text.lang = nextLanguage;
    button.setAttribute('aria-label', language === 'es' ? 'Cambiar a inglés' : 'Switch to Spanish');
    button.hidden = false;
  }
  for (const link of document.querySelectorAll('[data-wmt-portal]')) {
    const url = new URL(previewOrigin);
    url.searchParams.set('lang', language);
    link.href = url.href;
    const label = language === 'es' ? 'Portal de clientes' : 'Client portal';
    if (link.textContent !== label) link.textContent = label;
  }
}

function observePage() {
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: translatedAttributes,
  });
}

const observer = new MutationObserver(records => {
  observer.disconnect();
  for (const record of records) {
    if (record.type === 'attributes') translateAttributes(record.target);
    else if (record.type === 'characterData') translateText(record.target);
    else for (const node of record.addedNodes) localizeSubtree(node);
  }
  if (records.some(record => record.type === 'childList' && [...record.addedNodes].some(node =>
    node.nodeType === Node.ELEMENT_NODE && (node.matches('[data-wmt-language], [data-wmt-portal]') ||
      node.querySelector('[data-wmt-language], [data-wmt-portal]'))))) syncControls();
  observePage();
});

function renderLanguage() {
  observer.disconnect();
  try { localStorage.setItem(storageKey, language); } catch {}
  localizeSubtree(document.documentElement);
  for (const statement of document.querySelectorAll('[data-wmt-statement]')) {
    statement.dispatchEvent(new CustomEvent('wmt:statement', {
      detail: localized(statement, 'statement', statement.dataset.wmtStatement),
    }));
  }
  syncControls();
  observePage();
}

document.addEventListener('click', event => {
  if (!event.target.closest('[data-wmt-language]')) return;
  language = language === 'es' ? 'en' : 'es';
  const url = new URL(location.href);
  url.searchParams.set('lang', language);
  history.replaceState(null, '', url);
  renderLanguage();
});

renderLanguage();
