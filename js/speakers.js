import { EVENT_MANIFEST } from './modules/manifest.js';
import { announceStatus, debounce, escapeHtml } from './modules/utils.js';

const RESULTS_LIMIT = 60;
const SPEAKER_QUERY_STORAGE_KEY = 'speakersPageQuery';
const SEARCH_QUERY_PARAM = 'q';
const AVATAR_CACHE_STORAGE_KEY = 'drupalOrgAvatarCacheV1';
const AVATAR_CACHE_SUCCESS_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const AVATAR_CACHE_MISS_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_AVATAR_URL =
  'https://www.drupal.org/files/styles/grid-2-2x-square/public/default-avatar.png?itok=hwYgIPvX';
const SPEAKER_TALK_MODAL_ID = 'speakerTalkDetailModal';

const state = {
  users: [],
  usersByKey: new Map(),
  talksBySpeakerKey: new Map(),
  talksById: new Map(),
  avatarCache: {},
  avatarLookupsInFlight: new Map(),
  indexed: false
};

const queryInput = document.getElementById('speakerQuery');
const clearButton = document.getElementById('clearSpeakerQuery');
const searchForm = document.getElementById('speakerSearchForm');
const shareSearchButton = document.getElementById('shareSearch');
const resultsContainer = document.getElementById('speakerResults');
const resultMeta = document.getElementById('resultMeta');

function saveQueryToStorage(query) {
  try {
    window.localStorage.setItem(SPEAKER_QUERY_STORAGE_KEY, normalizeText(query));
  } catch (error) {
    console.warn('Unable to persist speaker query', error);
  }
}

function loadQueryFromStorage() {
  try {
    return normalizeText(window.localStorage.getItem(SPEAKER_QUERY_STORAGE_KEY) || '');
  } catch (error) {
    console.warn('Unable to read persisted speaker query', error);
    return '';
  }
}

function loadQueryFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeText(params.get(SEARCH_QUERY_PARAM) || '');
  } catch (error) {
    console.warn('Unable to read query from URL', error);
    return '';
  }
}

function persistQueryToUrl(query) {
  try {
    const normalized = normalizeText(query);
    const url = new URL(window.location.href);
    if (normalized) {
      url.searchParams.set(SEARCH_QUERY_PARAM, normalized);
    } else {
      url.searchParams.delete(SEARCH_QUERY_PARAM);
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch (error) {
    console.warn('Unable to persist query to URL', error);
  }
}

function buildShareUrl(query) {
  const normalized = normalizeText(query);
  const url = new URL(window.location.href);
  if (normalized) {
    url.searchParams.set(SEARCH_QUERY_PARAM, normalized);
  } else {
    url.searchParams.delete(SEARCH_QUERY_PARAM);
  }
  return `${url.origin}${url.pathname}${url.search}`;
}

async function shareSearchQuery(query) {
  const shareUrl = buildShareUrl(query);
  try {
    await navigator.clipboard.writeText(shareUrl);
    announceStatus('Share URL copied to clipboard');
    const original = shareSearchButton.textContent;
    shareSearchButton.textContent = 'Copied';
    window.setTimeout(() => {
      shareSearchButton.textContent = original;
    }, 1200);
  } catch {
    window.prompt('Copy this search URL:', shareUrl);
  }
}

function loadAvatarCache() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AVATAR_CACHE_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Unable to load avatar cache', error);
    return {};
  }
}

function saveAvatarCache() {
  try {
    window.localStorage.setItem(AVATAR_CACHE_STORAGE_KEY, JSON.stringify(state.avatarCache));
  } catch (error) {
    console.warn('Unable to persist avatar cache', error);
  }
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function isUsernameLike(value) {
  const token = normalizeText(value);
  return /^[a-z0-9_.-]{2,}$/i.test(token) && !/\s/.test(token);
}

function parseSpeakerIdentity(value) {
  const parseBracketed = (inputName, inputUsername = '') => {
    const candidateName = normalizeText(inputName);
    const explicitUsername = normalizeText(inputUsername);
    if (!candidateName && !explicitUsername) return null;

    if (explicitUsername) {
      return {
        name: candidateName || explicitUsername,
        username: explicitUsername
      };
    }

    const bracketed = candidateName.match(/^(.+?)\s*\(([^()]{2,})\)\s*$/);
    if (bracketed) {
      const namePart = normalizeText(bracketed[1]);
      const usernamePart = normalizeText(bracketed[2]);
      if (isUsernameLike(usernamePart)) {
        return {
          name: namePart || usernamePart,
          username: usernamePart
        };
      }
    }

    if (isUsernameLike(candidateName)) {
      return { name: candidateName, username: candidateName };
    }

    return { name: candidateName, username: '' };
  };

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const objectName = normalizeText(value.name);
    const objectUsername = normalizeText(value.username);
    if (objectName || objectUsername) {
      return parseBracketed(objectName, objectUsername);
    }
  }

  const raw = normalizeText(value);
  if (!raw) return null;
  return parseBracketed(raw, '');
}

function isIgnoredSpeakerIdentity(identity) {
  const name = normalizeText(identity?.name).toLowerCase();
  if (!name) return true;
  return [
    'tba',
    'event team',
    'speaker tbc',
    'to be announced',
    'drupal association'
  ].includes(name);
}

function speakerKeys(speaker) {
  const identity = parseSpeakerIdentity(speaker);
  if (!identity || isIgnoredSpeakerIdentity(identity)) return [];
  const keys = [];
  if (identity.username) keys.push(`u:${identity.username.toLowerCase()}`);
  if (identity.name) keys.push(`n:${identity.name.toLowerCase()}`);
  return [...new Set(keys)];
}

function getItemList(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.sessions)) return payload.sessions;
  return Array.isArray(payload) ? payload : [];
}

function getSpeakerList(item) {
  if (!Array.isArray(item?.speakers)) return [];
  return item.speakers
    .flatMap((speaker) => {
      const text = normalizeText(speaker);
      if (!text) return [];
      return text
        .split(/\s*,\s*|\s+\/\s+/g)
        .map((part) => normalizeText(part))
        .filter(Boolean);
    });
}

function getSpeakerUsernames(item) {
  if (!Array.isArray(item?.speaker_usernames)) return [];
  return item.speaker_usernames
    .map((username) => normalizeText(username))
    .filter(Boolean);
}

function dateStringFromIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatTalkCard(talk) {
  const talkId = escapeHtml(talk.id || '');
  const title = escapeHtml(talk.title || 'Untitled session');
  const eventLabel = escapeHtml(talk.eventLabel || talk.eventFile || 'Unknown event');
  const dateText = escapeHtml(talk.dateText || '');
  const location = escapeHtml(talk.location || '');
  const summaryText = escapeHtml(talk.summaryText || '');
  const speakersText = escapeHtml(talk.speakersText || '');
  const speakerCount = Array.isArray(talk.speakersList) ? talk.speakersList.length : 0;
  const speakersIcon = speakerCount > 1 ? 'fa-users' : 'fa-user';
  const trackMarkup = (Array.isArray(talk.trackLabels) ? talk.trackLabels : [])
    .map((track) => `<span class="track-pill track-pill-dc">${escapeHtml(track)}</span>`)
    .join('');

  return `
    <article
      class="event-card event-card-dc relative h-full p-4 rounded-md transition-colors border-2 border-transparent cursor-pointer"
      style="--event-color-a: #3d7fc2; --event-color-b: #2e659c;"
      data-talk-id="${talkId}"
      role="button"
      tabindex="0"
      aria-haspopup="dialog"
      aria-label="${title}. Open session details."
    >
      <div class="flex items-start space-x-3 h-full">
        <div class="flex-1 flex flex-col h-full">
          <h3 class="font-medium text-gray-900 mb-1">${title}</h3>
          ${speakersText ? `<p class="text-sm text-gray-700 mb-1"><i class="fas ${speakersIcon} mr-1" aria-hidden="true"></i>${speakersText}</p>` : ''}
          <p class="text-sm text-gray-700 mb-1"><i class="fas fa-calendar-day mr-1"></i>${eventLabel}</p>
          ${dateText ? `<p class="text-xs text-gray-500 mb-1"><i class="far fa-clock mr-1" aria-hidden="true"></i>${dateText}</p>` : ''}
          ${location ? `<p class="text-sm text-gray-500 mb-1"><i class="fas fa-map-marker-alt mr-1"></i>${location}</p>` : ''}
          ${summaryText ? `<div class="session-description-preview text-sm text-gray-700 mb-1"><p>${summaryText}</p></div>` : '<div class="mb-1"></div>'}
          ${
            talk.link
              ? `<p class="text-sm mb-1"><a href="${escapeHtml(talk.link)}" target="_blank" rel="noopener noreferrer" class="schedule-link"><span>Session page</span> <i class="fas fa-external-link-alt ml-1"></i></a></p>`
              : ''
          }
          ${
            talk.videoUrl
              ? `<p class="text-sm mb-1"><a href="${escapeHtml(talk.videoUrl)}" target="_blank" rel="noopener noreferrer" class="schedule-link inline-flex items-center"><i class="fab fa-youtube mr-1"></i><span>Watch recording</span></a></p>`
              : ''
          }
          ${trackMarkup ? `<div class="mt-auto pt-[5px] flex flex-wrap gap-1">${trackMarkup}</div>` : ''}
        </div>
      </div>
    </article>
  `;
}

function renderUserCard(user, talks, grouped = false, showProfile = false) {
  const name = escapeHtml(user.name || user.username || 'Unknown');
  const username = normalizeText(user.username);
  const usernameKey = username.toLowerCase();
  const usernameMarkup = username
    ? `<div class="speaker-user-handle">@${escapeHtml(username)}</div>`
    : '';
  const cachedAvatar = username ? getAvatarCacheEntry(username)?.url || '' : '';
  const avatarSrc = normalizeText(user.avatar) || normalizeText(cachedAvatar) || DEFAULT_AVATAR_URL;
  const talksGridClass = talks.length === 1 ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-1 md:grid-cols-2 gap-2';
  const talksMarkup = talks.length
    ? `<div class="${talksGridClass}">${talks.map(formatTalkCard).join('')}</div>`
    : '<p class="text-sm text-gray-600">No talks indexed for this speaker yet.</p>';

  if (grouped || showProfile) {
    return `
      <section class="speaker-result-card rounded-lg border border-gray-300 p-3 sm:p-4" aria-label="Speaker group">
        <div class="speaker-result-head">
          <div class="speaker-user-summary">
            <img src="${escapeHtml(avatarSrc)}" alt="${name} avatar" class="speaker-user-avatar" data-speaker-username="${escapeHtml(usernameKey)}" loading="lazy" referrerpolicy="no-referrer">
            <div>
              <h3 class="speaker-user-name">${name}</h3>
              ${usernameMarkup}
            </div>
          </div>
          <div class="speaker-talk-count">${talks.length} talk${talks.length === 1 ? '' : 's'}</div>
        </div>
        ${talksMarkup}
      </section>
    `;
  }

  return talksMarkup;
}

function getTalksForUser(user) {
  const keys = [];
  const username = normalizeText(user.username).toLowerCase();
  const name = normalizeText(user.name).toLowerCase();
  if (username) keys.push(`u:${username}`);
  if (name) keys.push(`n:${name}`);

  const map = new Map();
  keys.forEach((key) => {
    const talks = state.talksBySpeakerKey.get(key) || [];
    talks.forEach((talk) => {
      const dedupeKey = `${talk.eventFile}|${talk.startTime}|${talk.title}`;
      map.set(dedupeKey, talk);
    });
  });

  return [...map.values()].sort((a, b) => {
    const at = new Date(a.startTime || '').getTime();
    const bt = new Date(b.startTime || '').getTime();
    if (Number.isNaN(at) && Number.isNaN(bt)) return (a.title || '').localeCompare(b.title || '');
    if (Number.isNaN(at)) return 1;
    if (Number.isNaN(bt)) return -1;
    return bt - at;
  });
}

function parseTrack(item) {
  if (!Array.isArray(item?.track) || item.track.length === 0) return [];
  return item.track
    .flatMap((track) => String(track || '').split(','))
    .map((track) => normalizeText(track))
    .filter(Boolean);
}

function findImageUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const text = normalizeText(value);
    if (!text) return '';
    if (/^https?:\/\//i.test(text) && text.includes('/files/user-pictures/')) {
      return text;
    }
    if (/^https?:\/\//i.test(text) && /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(text)) {
      return text;
    }
    return '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageUrl(item);
      if (found) return found;
    }
    return '';
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const found = findImageUrl(value[key]);
      if (found) return found;
    }
  }
  return '';
}

function getAvatarCacheEntry(username) {
  const uname = normalizeText(username).toLowerCase();
  if (!uname) return null;
  const entry = state.avatarCache[uname];
  if (!entry || typeof entry !== 'object') return null;
  const ts = Number(entry.ts || 0);
  const ttl = entry.url ? AVATAR_CACHE_SUCCESS_TTL_MS : AVATAR_CACHE_MISS_TTL_MS;
  if (!ts || Date.now() - ts > ttl) {
    return null;
  }
  return entry;
}

function setAvatarCacheEntry(username, url) {
  const uname = normalizeText(username).toLowerCase();
  if (!uname) return;
  state.avatarCache[uname] = {
    url: normalizeText(url),
    ts: Date.now()
  };
  saveAvatarCache();
}

function updateAvatarElements(username, avatarUrl) {
  const uname = normalizeText(username).toLowerCase();
  if (!uname || !avatarUrl) return;
  resultsContainer.querySelectorAll('img[data-speaker-username]').forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    if (String(img.dataset.speakerUsername || '').toLowerCase() !== uname) return;
    img.src = avatarUrl;
  });
}

async function fetchDrupalOrgAvatar(username) {
  const uname = normalizeText(username).toLowerCase();
  if (!uname) return '';

  const inFlight = state.avatarLookupsInFlight.get(uname);
  if (inFlight) return inFlight;

  const lookup = (async () => {
    const cached = getAvatarCacheEntry(uname);
    if (cached) return cached.url || '';

    try {
      const listRes = await fetch(`https://www.drupal.org/api-d7/user.json?name=${encodeURIComponent(uname)}`);
      if (!listRes.ok) {
        setAvatarCacheEntry(uname, '');
        return '';
      }
      const listPayload = await listRes.json();
      const first = Array.isArray(listPayload?.list) ? listPayload.list[0] : null;
      const uid = normalizeText(first?.uid);
      if (!uid) {
        setAvatarCacheEntry(uname, '');
        return '';
      }
      const detailRes = await fetch(`https://www.drupal.org/api-d7/user/${encodeURIComponent(uid)}.json`);
      if (!detailRes.ok) {
        setAvatarCacheEntry(uname, '');
        return '';
      }
      const detailPayload = await detailRes.json();
      const avatar = findImageUrl(detailPayload);
      setAvatarCacheEntry(uname, avatar || '');
      return avatar || '';
    } catch (error) {
      console.warn(`Avatar lookup failed for @${uname}`, error);
      return '';
    }
  })();

  state.avatarLookupsInFlight.set(uname, lookup);
  try {
    return await lookup;
  } finally {
    state.avatarLookupsInFlight.delete(uname);
  }
}

async function hydrateVisibleAvatars(users) {
  const usernames = [...new Set(
    users
      .map((user) => normalizeText(user?.username).toLowerCase())
      .filter(Boolean)
  )];

  await Promise.all(
    usernames.map(async (username) => {
      const cached = getAvatarCacheEntry(username);
      if (cached?.url) {
        updateAvatarElements(username, cached.url);
        return;
      }
      const avatar = await fetchDrupalOrgAvatar(username);
      if (avatar) {
        updateAvatarElements(username, avatar);
      }
    })
  );
}

function formatTextBlock(text) {
  const input = String(text || '').trim();
  if (!input) return '';

  const lines = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks = [];
  let listItems = [];
  let paragraphLines = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join('')}</ul>`);
    listItems = [];
  };

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push(`<p>${paragraphLines.join('<br>')}</p>`);
    paragraphLines = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);

    if (bulletMatch) {
      flushParagraph();
      listItems.push(escapeHtml(bulletMatch[1].trim()));
      return;
    }

    if (line.trim() === '') {
      flushList();
      flushParagraph();
      return;
    }

    flushList();
    paragraphLines.push(escapeHtml(line.trim()));
  });

  flushList();
  flushParagraph();
  return blocks.join('');
}

function ensureTalkModal() {
  let modal = document.getElementById(SPEAKER_TALK_MODAL_ID);
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = SPEAKER_TALK_MODAL_ID;
  modal.className = 'session-modal-overlay hidden';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="session-modal-card" role="dialog" aria-modal="true" aria-labelledby="speakerTalkModalTitle">
      <div class="session-modal-header">
        <button id="speakerTalkModalBack" type="button" class="session-modal-back">
          <i class="fas fa-arrow-left"></i><span>Back to speakers</span>
        </button>
        <button id="speakerTalkModalClose" type="button" class="session-modal-close" aria-label="Close session details">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="session-modal-body" id="speakerTalkModalBody"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeTalkModal();
    }
  });
  modal.querySelector('#speakerTalkModalClose').addEventListener('click', closeTalkModal);
  modal.querySelector('#speakerTalkModalBack').addEventListener('click', closeTalkModal);
  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeTalkModal();
    }
  });

  return modal;
}

function closeTalkModal() {
  const modal = ensureTalkModal();
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('session-modal-open');
}

function openTalkModal(talkId) {
  const talk = state.talksById.get(talkId);
  if (!talk) return;

  const modal = ensureTalkModal();
  const body = modal.querySelector('#speakerTalkModalBody');
  const fullText = normalizeText(talk.fullDescription || talk.descriptionText || talk.summaryText);
  const descriptionHtml = formatTextBlock(fullText) || '<em>No description available.</em>';

  const speakerCount = Array.isArray(talk.speakersList) ? talk.speakersList.length : 0;
  const speakersIcon = speakerCount > 1 ? 'fa-users' : 'fa-user';
  body.innerHTML = `
    <h2 id="speakerTalkModalTitle" class="session-modal-title">${escapeHtml(talk.title || 'Session')}</h2>
    <p class="session-modal-meta"><span class="session-modal-meta-label">Event</span><span class="session-modal-meta-value">${escapeHtml(
      talk.eventLabel || 'Unknown event'
    )}</span></p>
    ${talk.dateText ? `<p class="session-modal-meta"><span class="session-modal-meta-label">Date</span><span class="session-modal-meta-value"><i class="far fa-clock mr-1"></i>${escapeHtml(talk.dateText)}</span></p>` : ''}
    ${talk.location ? `<p class="session-modal-meta"><span class="session-modal-meta-label">Location</span><span class="session-modal-meta-value">${escapeHtml(talk.location)}</span></p>` : ''}
    ${talk.speakersText ? `<p class="session-modal-meta"><span class="session-modal-meta-label">Speakers</span><span class="session-modal-meta-value"><i class="fas ${speakersIcon} mr-1"></i>${escapeHtml(talk.speakersText)}</span></p>` : ''}
    ${
      talk.link || talk.videoUrl
        ? `<div class="session-modal-links">
            ${
              talk.link
                ? `<a class="session-modal-link" href="${escapeHtml(talk.link)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt"></i><span>Session page</span></a>`
                : ''
            }
            ${
              talk.videoUrl
                ? `<a class="session-modal-link" href="${escapeHtml(talk.videoUrl)}" target="_blank" rel="noopener noreferrer"><i class="fab fa-youtube"></i><span>Watch recording</span></a>`
                : ''
            }
          </div>`
        : ''
    }
    <div class="session-modal-description">${descriptionHtml}</div>
  `;

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('session-modal-open');
  const closeButton = modal.querySelector('#speakerTalkModalClose');
  if (closeButton) {
    closeButton.focus();
  }
}

function addTalkForSpeaker(identity, talk) {
  const keys = speakerKeys(identity);
  keys.forEach((key) => {
    if (!state.talksBySpeakerKey.has(key)) {
      state.talksBySpeakerKey.set(key, []);
    }
    state.talksBySpeakerKey.get(key).push(talk);
  });
}

function addUserForSpeaker(input) {
  const identity = parseSpeakerIdentity(input);
  if (!identity || isIgnoredSpeakerIdentity(identity)) return;
  const username = normalizeText(identity.username);
  const name = normalizeText(identity.name);
  const usernameKey = username ? `u:${username.toLowerCase()}` : '';
  const nameKey = name ? `n:${name.toLowerCase()}` : '';
  const usernameAliasNameKey = username ? `n:${username.toLowerCase()}` : '';
  const nameLooksLikeUsername = name && isUsernameLike(name);
  const nameAsUsernameKey = nameLooksLikeUsername ? `u:${name.toLowerCase()}` : '';
  if (!usernameKey && !nameKey) return;

  const existingByUsername = usernameKey ? state.usersByKey.get(usernameKey) : null;
  const existingByUsernameAlias = usernameAliasNameKey ? state.usersByKey.get(usernameAliasNameKey) : null;
  const existingByNameAsUsername = nameAsUsernameKey ? state.usersByKey.get(nameAsUsernameKey) : null;
  const existingByName = nameKey ? state.usersByKey.get(nameKey) : null;
  const existing = existingByUsername || existingByUsernameAlias || existingByNameAsUsername || existingByName;

  if (existing) {
    if (!Array.isArray(existing.aliases)) {
      existing.aliases = [];
    }
    if (name) {
      const hasAlias = existing.aliases.some((alias) => normalizeText(alias).toLowerCase() === name.toLowerCase());
      if (!hasAlias) existing.aliases.push(name);
    }

    const existingName = normalizeText(existing.name);
    const existingUsername = normalizeText(existing.username);
    const hasBetterDisplayName =
      Boolean(name) &&
      (!existingName ||
        (existingUsername &&
          existingName.toLowerCase() === existingUsername.toLowerCase() &&
          name.toLowerCase() !== existingUsername.toLowerCase()));

    if (hasBetterDisplayName) {
      existing.name = name;
    }
    if (!existing.username && username) existing.username = username;
    if (!existing.username && nameLooksLikeUsername) existing.username = name;
    if (usernameKey) state.usersByKey.set(usernameKey, existing);
    if (nameKey) state.usersByKey.set(nameKey, existing);
    if (usernameAliasNameKey) state.usersByKey.set(usernameAliasNameKey, existing);
    if (nameAsUsernameKey) state.usersByKey.set(nameAsUsernameKey, existing);
    return;
  }

  const created = {
    username: username || (nameLooksLikeUsername ? name : ''),
    name: name || username,
    avatar: '',
    aliases: name ? [name] : []
  };
  if (usernameKey) state.usersByKey.set(usernameKey, created);
  if (nameKey) state.usersByKey.set(nameKey, created);
  if (usernameAliasNameKey) state.usersByKey.set(usernameAliasNameKey, created);
  if (nameAsUsernameKey) state.usersByKey.set(nameAsUsernameKey, created);
}

function buildSpeakerIdentities(speakers, usernames) {
  const identities = [];
  const normalizeToken = (value) => normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const nameTokens = (name) =>
    normalizeText(name)
      .split(/\s+/)
      .map((part) => normalizeToken(part))
      .filter((part) => part.length >= 2);
  const likelyNameMatchesUsername = (name, username) => {
    const uname = normalizeToken(username);
    if (!uname) return false;
    const tokens = nameTokens(name);
    if (tokens.length === 0) return false;
    return tokens.some((token) => uname.startsWith(token) || token.startsWith(uname) || uname.includes(token));
  };
  const addIdentity = (name, username) => {
    const parsed = parseSpeakerIdentity({ name, username });
    if (!parsed || isIgnoredSpeakerIdentity(parsed)) return;

    // If this is effectively a username-only identity, try to merge it into an
    // existing named speaker first (common when speaker_usernames has fewer items).
    if (parsed.username && parsed.name.toLowerCase() === parsed.username.toLowerCase()) {
      const matchedByName = identities.find(
        (identity) =>
          !identity.username &&
          likelyNameMatchesUsername(identity.name, parsed.username)
      );
      if (matchedByName) {
        matchedByName.username = parsed.username;
        return;
      }
    }

    const canonical = parsed.username
      ? `u:${parsed.username.toLowerCase()}`
      : `n:${parsed.name.toLowerCase()}`;
    if (!canonical) return;
    const existing = identities.find((identity) => {
      const key = identity.username
        ? `u:${identity.username.toLowerCase()}`
        : `n:${identity.name.toLowerCase()}`;
      return key === canonical;
    });
    if (existing) {
      if (!existing.username && parsed.username) existing.username = parsed.username;
      if (
        parsed.name &&
        existing.username &&
        existing.name.toLowerCase() === existing.username.toLowerCase() &&
        parsed.name.toLowerCase() !== existing.username.toLowerCase()
      ) {
        existing.name = parsed.name;
      }
      return;
    }
    identities.push(parsed);
  };

  if (speakers.length === 1 && usernames.length >= 1) {
    addIdentity(speakers[0], usernames[0]);
    return identities;
  }

  // Ambiguous mapping (e.g. multiple speakers with fewer usernames):
  // keep all speaker names, and map usernames only when there is exactly one
  // clear name match for that username.
  speakers.forEach((name) => addIdentity(name, ''));
  const assignedSpeakers = new Set();
  usernames.forEach((username) => {
    const candidates = speakers.filter(
      (name) => !assignedSpeakers.has(name) && likelyNameMatchesUsername(name, username)
    );
    if (candidates.length === 1) {
      addIdentity(candidates[0], username);
      assignedSpeakers.add(candidates[0]);
      return;
    }

    // If we don't have speaker names (username-only events), keep the username identity.
    if (speakers.length === 0) {
      addIdentity(username, username);
    }
    // If zero or multiple candidates, skip username mapping to avoid
    // contaminating talk ownership/search results.
  });
  return identities;
}

async function loadEventTalkIndex() {
  state.usersByKey.clear();
  state.talksBySpeakerKey.clear();
  state.talksById.clear();

  const loads = EVENT_MANIFEST.map(async (entry) => {
    const response = await fetch(`./data/${entry.file}`);
    if (!response.ok) return;
    const payload = await response.json();
    const items = getItemList(payload);
    items.forEach((item) => {
      const speakers = getSpeakerList(item);
      const speakerUsernames = getSpeakerUsernames(item);
      if (speakers.length === 0 && speakerUsernames.length === 0) return;
      const speakerIdentities = buildSpeakerIdentities(speakers, speakerUsernames);
      if (speakerIdentities.length === 0) return;

      const talk = {
        id: `${entry.file}|${item?.startTime || ''}|${normalizeText(item?.title)}`,
        eventFile: entry.file,
        eventLabel: entry.label,
        title: normalizeText(item?.title),
        startTime: item?.startTime || '',
        dateText: dateStringFromIso(item?.startTime),
        location: normalizeText(item?.location),
        trackLabels: parseTrack(item),
        summaryText: normalizeText(item?.summary || ''),
        fullDescription: normalizeText(item?.full_description || ''),
        descriptionText: normalizeText(item?.description || ''),
        speakersList: (() => {
          const names = speakerIdentities
            .map((identity) => normalizeText(identity.name || identity.username))
            .filter(Boolean);
          const seen = new Set();
          const unique = [];
          names.forEach((name) => {
            const key = name.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            unique.push(name);
          });
          return unique;
        })(),
        link: normalizeText(item?.link),
        videoUrl: normalizeText(item?.video_url)
      };
      talk.speakersText = talk.speakersList.join(', ');
      state.talksById.set(talk.id, talk);

      speakerIdentities.forEach((identity) => {
        addTalkForSpeaker(identity, talk);
        addUserForSpeaker(identity);
      });
    });
  });
  await Promise.all(loads);
  state.users = [...new Set(state.usersByKey.values())].sort((a, b) => {
    const aName = normalizeText(a.name || a.username).toLowerCase();
    const bName = normalizeText(b.name || b.username).toLowerCase();
    return aName.localeCompare(bName);
  });
  state.indexed = true;
}

function setResultsMeta(message) {
  resultMeta.textContent = message;
}

function renderMessage(message) {
  resultsContainer.innerHTML = `<p class="text-sm text-gray-600">${escapeHtml(message)}</p>`;
}

function searchUsers(query) {
  const q = normalizeText(query).toLowerCase();
  if (!q) return [];
  const scoredByCanonical = new Map();

  state.users.forEach((user) => {
    const name = normalizeText(user.name);
    const username = normalizeText(user.username);
    const aliases = Array.isArray(user.aliases) ? user.aliases.map((alias) => normalizeText(alias)).filter(Boolean) : [];
    const nameLower = name.toLowerCase();
    const usernameLower = username.toLowerCase();
    const aliasLowers = aliases.map((alias) => alias.toLowerCase());

    let score = -1;
    if (usernameLower === q) score = 100;
    else if (nameLower === q) score = 95;
    else if (aliasLowers.includes(q)) score = 92;
    else if (usernameLower.startsWith(q)) score = 85;
    else if (nameLower.startsWith(q)) score = 80;
    else if (aliasLowers.some((alias) => alias.startsWith(q))) score = 78;
    else if (usernameLower.includes(q)) score = 70;
    else if (nameLower.includes(q)) score = 65;
    else if (aliasLowers.some((alias) => alias.includes(q))) score = 63;

    if (score >= 0) {
      const canonicalKey = usernameLower ? `u:${usernameLower}` : `n:${nameLower}`;
      const existing = scoredByCanonical.get(canonicalKey);
      if (!existing || score > existing.score) {
        scoredByCanonical.set(canonicalKey, { user, score });
      }
    }
  });

  return [...scoredByCanonical.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ac = getTalksForUser(a.user).length;
      const bc = getTalksForUser(b.user).length;
      if (bc !== ac) return bc - ac;
      return normalizeText(a.user.name || a.user.username).localeCompare(normalizeText(b.user.name || b.user.username));
    })
    .slice(0, RESULTS_LIMIT)
    .map((item) => item.user);
}

function renderSearchResults(query) {
  const trimmed = normalizeText(query);
  persistQueryToUrl(trimmed);
  if (!trimmed) {
    setResultsMeta('');
    renderMessage('Start typing to find speakers.');
    return;
  }

  const matchedUsers = searchUsers(trimmed);
  if (matchedUsers.length === 0) {
    setResultsMeta('0 matches');
    renderMessage(`No speakers found for "${trimmed}".`);
    announceStatus(`No speakers found for ${trimmed}`);
    return;
  }

  const grouped = matchedUsers.length > 1;
  const showSingleProfile = matchedUsers.length === 1;
  const markup = matchedUsers
    .map((user) => renderUserCard(user, getTalksForUser(user), grouped, showSingleProfile))
    .join('');
  resultsContainer.innerHTML = markup;
  void hydrateVisibleAvatars(matchedUsers);
  setResultsMeta(
    grouped
      ? `${matchedUsers.length} matches (grouped by speaker)`
      : `${matchedUsers.length} match`
  );
  announceStatus(`Found ${matchedUsers.length} speakers for ${trimmed}`);
}

function wireControls() {
  const debounced = debounce(() => renderSearchResults(queryInput.value), 120);
  queryInput.addEventListener('input', () => {
    saveQueryToStorage(queryInput.value);
    clearButton.classList.toggle('hidden', queryInput.value.trim() === '');
    debounced();
  });

  clearButton.addEventListener('click', () => {
    queryInput.value = '';
    saveQueryToStorage('');
    clearButton.classList.add('hidden');
    renderSearchResults('');
    queryInput.focus();
  });

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveQueryToStorage(queryInput.value);
    renderSearchResults(queryInput.value);
  });

  if (shareSearchButton) {
    shareSearchButton.addEventListener('click', () => {
      void shareSearchQuery(queryInput.value);
    });
  }

  document.addEventListener('keydown', (event) => {
    const isFindShortcut = (event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'f';
    if (!isFindShortcut) return;
    event.preventDefault();
    queryInput.focus();
    queryInput.select();
    announceStatus('Focused speaker search');
  });

  resultsContainer.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('a')) return;
    const card = target.closest('[data-talk-id]');
    if (!card) return;
    const talkId = card.getAttribute('data-talk-id');
    if (!talkId) return;
    openTalkModal(talkId);
  });

  resultsContainer.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const card = target.closest('[data-talk-id]');
    if (!card) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const talkId = card.getAttribute('data-talk-id');
    if (!talkId) return;
    openTalkModal(talkId);
  });
}

async function init() {
  try {
    state.avatarCache = loadAvatarCache();
    setResultsMeta('Loading talks and speaker index...');
    await loadEventTalkIndex();
    wireControls();
    setResultsMeta(`Ready: ${state.users.length} speakers indexed`);
    const urlQuery = loadQueryFromUrl();
    const persistedQuery = loadQueryFromStorage();
    const initialQuery = urlQuery || persistedQuery;
    if (initialQuery) {
      queryInput.value = initialQuery;
      clearButton.classList.remove('hidden');
      renderSearchResults(initialQuery);
    } else {
      renderSearchResults('');
    }
  } catch (error) {
    console.error(error);
    setResultsMeta('Failed to load data');
    renderMessage('Failed to load speaker data. Check console/network and reload.');
  }
}

document.addEventListener('DOMContentLoaded', init);
