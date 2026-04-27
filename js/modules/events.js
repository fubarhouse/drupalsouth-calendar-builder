import state, { getStorageKey } from './state.js';
import { EVENT_MANIFEST, ENABLED_EVENT_CATEGORIES } from './manifest.js';
import { getLocalDate } from './utils.js';
import {
  filterEvents,
  debouncedFilterEvents,
  toggleClearButton,
  clearKeywordsFilter,
  resetFilters,
  selectAllDisplayed,
  deselectAllDisplayed,
  setSelectionOverviewUpdater
} from './filters.js';
import { displayEvents } from './render.js';
import {
  updateDownloadButton,
  downloadSelectedEvents,
  addSelectedEventsToGoogleCalendar,
  toggleEventSelection
} from './calendar.js';

const DRUPALSOUTH_LOGO_URL = new URL('../../img/drupalsouth-logo.png', import.meta.url).toString();
const DRUPALGOV_LOGO_URL = new URL('../../img/drupalgov-logo.png', import.meta.url).toString();
const DRUPALCON_LOGO_URL = new URL('../../img/drupalcon-logo.svg', import.meta.url).toString();
const DRUPALCON_SINGAPORE_LOGO_URL = new URL('../../img/drupalcon-singapore-logo.png', import.meta.url).toString();
const DESIGN_STORAGE_KEY = 'scheduleDesignMode';
const THEME_STORAGE_KEY = 'scheduleThemeMode';
// Hard-coded default layout mode. Toggle this between 'drupalsouth' and 'drupalcon'.
const DEFAULT_DESIGN_MODE = 'drupalsouth';

let updateSelectionOverview = () => {};
let updateStageStats = () => {};

function parseModeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const design = String(params.get('design') || params.get('layout') || '').toLowerCase();
  const theme = String(params.get('theme') || '').toLowerCase();
  return { design, theme };
}

function normalizeDesignMode(design) {
  if (design === 'drupalcon') return 'drupalcon';
  if (design === 'drupalsouth') return 'drupalsouth';
  if (design === 'default') return 'drupalsouth';
  return 'drupalcon';
}

function normalizeThemeMode(theme) {
  return theme === 'light' ? 'light' : 'dark';
}

function applyDesignClass(designMode) {
  const body = document.body;
  body.classList.toggle('design-drupalcon', designMode === 'drupalcon');
  body.classList.toggle('design-drupalsouth', designMode === 'drupalsouth');
}

function applyThemeClass(themeMode) {
  const body = document.body;
  body.classList.toggle('theme-dark', themeMode === 'dark');
}

export function wireStatsHandlers(selectionOverviewFn, stageStatsFn) {
  updateSelectionOverview = selectionOverviewFn;
  updateStageStats = stageStatsFn;
  setSelectionOverviewUpdater(selectionOverviewFn);
}

export function getEventCategory(eventManifestItem) {
  if (eventManifestItem.file.startsWith('drupalsouth-community-day-')) {
    return 'DrupalSouth Community Day';
  }
  if (
    eventManifestItem.file.startsWith('drupalsouth-') ||
    eventManifestItem.file.startsWith('drupalgov-') ||
    eventManifestItem.file.startsWith('drupalcon-au-')
  ) {
    return 'DrupalSouth';
  }
  if (eventManifestItem.file.startsWith('drupalcon-eu-')) {
    return 'DrupalCon EU';
  }
  if (eventManifestItem.file.startsWith('drupalcon-asia-')) {
    return 'DrupalCon Asia';
  }
  return 'DrupalCon US';
}

export function getManifestForCategory(category) {
  return EVENT_MANIFEST.filter(
    (evt) => ENABLED_EVENT_CATEGORIES.includes(getEventCategory(evt)) && getEventCategory(evt) === category
  );
}

function getAvailableEnabledCategories() {
  return ENABLED_EVENT_CATEGORIES.filter((category) => getManifestForCategory(category).length > 0);
}

function renderCategoryTabs(categories) {
  const tabsContainer = document.getElementById('eventTabs');
  if (!tabsContainer) return;

  tabsContainer.innerHTML = '';

  categories.forEach((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.category = category;
    button.className =
      'event-tab px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 transition-colors';
    button.textContent = category;
    tabsContainer.appendChild(button);
  });
}

export function getHeaderBranding(category, eventMeta = null) {
  const isDrupalGov =
    eventMeta?.designation === 'DrupalGov' || (state.currentEventFile || '').startsWith('drupalgov-');
  const isDrupalConSingapore = (state.currentEventFile || '') === 'drupalcon-asia-singapore-2024.json';
  if (category === 'DrupalSouth Community Day') {
    return {
      kicker: 'DrupalSouth Community Day',
      iconClass: 'fas fa-users',
      brandClass: 'brand-community',
      logoUrl: DRUPALSOUTH_LOGO_URL,
      logoAlt: 'DrupalSouth logo'
    };
  }
  if (category === 'DrupalSouth') {
    if (isDrupalGov) {
      return {
        kicker: 'DrupalGov Schedule',
        iconClass: 'fas fa-landmark',
        brandClass: 'brand-drupalsouth',
        logoUrl: DRUPALGOV_LOGO_URL,
        logoAlt: 'DrupalGov logo'
      };
    }
    return {
      kicker: 'DrupalSouth Schedule',
      iconClass: 'fas fa-water',
      brandClass: 'brand-drupalsouth',
      logoUrl: DRUPALSOUTH_LOGO_URL,
      logoAlt: 'DrupalSouth logo'
    };
  }
  return {
    kicker: 'DrupalCon Schedule',
    iconClass: 'fas fa-globe',
    brandClass: 'brand-drupalcon',
    logoUrl: isDrupalConSingapore ? DRUPALCON_SINGAPORE_LOGO_URL : DRUPALCON_LOGO_URL,
    logoAlt: isDrupalConSingapore ? 'DrupalCon Singapore logo' : 'DrupalCon logo'
  };
}

export function updateHeaderBranding(category) {
  const logo = document.getElementById('headerLogo');
  const logoImage = document.getElementById('headerLogoImage');
  const logoIcon = document.getElementById('headerLogoIcon');
  const kicker = document.getElementById('headerKicker');
  const branding = getHeaderBranding(category, state.eventMeta);

  logo.classList.remove('brand-drupalsouth', 'brand-community', 'brand-drupalcon');
  logo.classList.add(branding.brandClass);
  logoIcon.className = branding.iconClass;
  kicker.textContent = branding.kicker;

  if (branding.logoUrl) {
    logoImage.src = branding.logoUrl;
    logoImage.alt = branding.logoAlt || 'Event logo';
    logoImage.classList.remove('hidden');
    logoIcon.classList.add('hidden');
  } else {
    logoImage.classList.add('hidden');
    logoIcon.classList.remove('hidden');
  }
}

function renderEventMediaPromo(eventMeta = null) {
  const container = document.getElementById('eventMediaPromo');
  if (!container) return;

  const promo = eventMeta?.mediaPromo;
  if (!promo || !promo.groupUrl) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  const isFutureEvent = Boolean(eventMeta?.startDate && new Date(eventMeta.startDate) > new Date());
  const mode = promo.mode || (isFutureEvent ? 'cta' : 'archive');
  const title = promo.title || (mode === 'cta' ? 'Share Your Event Photos' : 'Event Photos');
  const text =
    promo.text ||
    (mode === 'cta'
      ? 'Join the photo group and share your shots from the event.'
      : 'Explore photos shared by the community.');
  const buttonLabel = promo.buttonLabel || (mode === 'cta' ? 'Open Flickr Group' : 'View Photos');
  const platformLabel = (promo.platform || 'media').toUpperCase();

  const card = document.createElement('div');
  card.className =
    'rounded-lg border border-gray-300 bg-white p-3 sm:p-4 flex gap-3 sm:gap-4 items-start';

  if (promo.image) {
    const image = document.createElement('img');
    image.src = promo.image;
    image.alt = promo.imageAlt || `${platformLabel} promo image`;
    image.className = 'w-[142px] h-[106px] rounded-md object-cover border border-gray-300 bg-white shrink-0';
    card.appendChild(image);
  }

  const body = document.createElement('div');
  body.className = 'min-w-0 flex-1';

  const platform = document.createElement('div');
  platform.className = 'text-xs font-semibold tracking-wide text-gray-600';
  platform.textContent = platformLabel;
  body.appendChild(platform);

  const heading = document.createElement('h3');
  heading.className = 'text-sm sm:text-base font-semibold text-gray-900 mt-0.5';
  heading.textContent = title;
  body.appendChild(heading);

  const copy = document.createElement('p');
  copy.className = 'text-sm text-gray-700 mt-1';
  copy.textContent = text;
  body.appendChild(copy);

  const action = document.createElement('a');
  action.href = promo.groupUrl;
  action.target = '_blank';
  action.rel = 'noopener noreferrer';
  action.className =
    'inline-flex items-center mt-2 px-3 py-1.5 rounded-md text-sm font-medium text-white drupal-blue drupal-blue-hover transition-colors';
  action.textContent = buttonLabel;
  body.appendChild(action);

  card.appendChild(body);
  container.innerHTML = '';
  container.appendChild(card);
  container.classList.remove('hidden');
}

export function setActiveTab(category) {
  document.querySelectorAll('.event-tab').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.category === category);
  });
  updateHeaderBranding(category);
}

export function populateEventSelector(category, preferredFile) {
  const eventSelector = document.getElementById('eventSelector');
  const categoryEvents = getManifestForCategory(category);
  eventSelector.innerHTML = '';

  categoryEvents.forEach((evt) => {
    const option = document.createElement('option');
    option.value = evt.file;
    option.textContent = evt.label;
    eventSelector.appendChild(option);
  });

  const hasPreferred = preferredFile && categoryEvents.some((evt) => evt.file === preferredFile);
  if (hasPreferred) {
    eventSelector.value = preferredFile;
    return;
  }

  const categoryDefault = categoryEvents.find((evt) => evt.default);
  if (categoryDefault) {
    eventSelector.value = categoryDefault.file;
    return;
  }

  if (categoryEvents.length > 0) {
    eventSelector.value = categoryEvents[0].file;
  }
}

function getManifestItemByFile(file) {
  return EVENT_MANIFEST.find((item) => item.file === file) || null;
}

function updateHeaderFlag(manifestItem = null) {
  const flag = document.getElementById('headerFlag');
  if (!flag) return;
  const src = manifestItem?.flagImage || '';
  const alt = manifestItem?.flagAlt || 'Event country flag';
  if (!src) {
    flag.classList.add('hidden');
    flag.removeAttribute('src');
    flag.removeAttribute('alt');
    return;
  }
  flag.src = src;
  flag.alt = alt;
  flag.classList.remove('hidden');
}

export async function fetchEvents(filename) {
  try {
    const response = await fetch(`./data/${filename}`);
    const data = await response.json();
    state.eventMeta = data.event;
    data.items.forEach((event) => {
      event.clean_title = event.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    });
    return data.items;
  } catch {
    return [];
  }
}

export async function loadEvent(filename) {
  state.currentEventFile = filename;
  const manifestItem = getManifestItemByFile(filename);
  updateHeaderFlag(manifestItem);
  const events = await fetchEvents(filename);
  if (state.currentEventCategory) {
    updateHeaderBranding(state.currentEventCategory);
  }
  const meta = state.eventMeta;
  state.eventColumns = Number(meta.columns) > 0 ? Number(meta.columns) : 3;
  const eventDisplayName = `${meta.designation} ${meta.location} ${meta.year}`;

  document.title = `${eventDisplayName} - Custom Schedule Builder`;
  document.getElementById('pageTitle').innerHTML = `
                <span class="header-event">${eventDisplayName}</span>
                <span class="header-suffix">Planner</span>
            `;

  const websiteURL = meta.website.replace('/schedule', '');
  document.getElementById('creditsEventLink').innerHTML =
    `This is a custom schedule builder for <a href="${websiteURL}" target="_blank" class="drupal-blue-text">${eventDisplayName}</a>. It is not affiliated with ${eventDisplayName}.`;
  renderEventMediaPromo(meta);

  events.forEach((event) => {
    event.id = `${event.startTime}-${event.location}-${event.title}`.replace(/[^a-zA-Z0-9-]/g, '-');
  });
  const uniqueDates = [...new Set(events.map((event) => getLocalDate(event.startTime)))];
  const uniqueTracks = [...new Set(events.map((event) => event.track))];

  const dateFilter = document.getElementById('dateFilter');
  dateFilter.innerHTML = '<option value="">All Days</option>';
  uniqueDates.sort().forEach((date) => {
    const option = document.createElement('option');
    option.value = date;
    option.textContent = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    dateFilter.appendChild(option);
  });

  const trackFilter = document.getElementById('trackFilter');
  trackFilter.innerHTML = '<option value="">All Tracks</option>';
  uniqueTracks.sort().forEach((track) => {
    const option = document.createElement('option');
    option.value = track;
    option.textContent = track;
    trackFilter.appendChild(option);
  });

  const savedSelections = localStorage.getItem(getStorageKey());
  state.selectedEvents = new Set(savedSelections ? JSON.parse(savedSelections) : []);
  state.allEvents = events;
  state.displayedEvents = events;

  const overviewPanel = document.getElementById('selectionOverview');
  if (state.selectedEvents.size > 0) {
    overviewPanel.classList.remove('translate-y-full');
    updateSelectionOverview(events, updateStageStats);
    updateDownloadButton();
  } else {
    overviewPanel.classList.add('translate-y-full');
    updateDownloadButton();
  }

  displayEvents(events);

  document.getElementById('dateFilter').value = '';
  document.getElementById('trackFilter').value = '';
  document.getElementById('keywordsFilter').value = '';
  document.getElementById('selectionFilter').value = 'all';
  toggleClearButton();
}

export function setupEventListeners() {
  document.getElementById('dateFilter').addEventListener('change', () => filterEvents(state.allEvents, 'dateFilter'));
  document.getElementById('trackFilter').addEventListener('change', () => filterEvents(state.allEvents, 'trackFilter'));
  document.getElementById('keywordsFilter').addEventListener('input', () => {
    toggleClearButton();
    filterEvents(state.allEvents, null, true);
    debouncedFilterEvents(state.allEvents);
  });
  document.getElementById('clearKeywords').addEventListener('click', () => clearKeywordsFilter(state.allEvents));
  document.getElementById('selectionFilter').addEventListener('change', () => filterEvents(state.allEvents, 'selectionFilter'));
  document.getElementById('downloadIcs').addEventListener('click', () => downloadSelectedEvents(state.allEvents));
  document
    .getElementById('addGoogleCalendar')
    .addEventListener('click', () => addSelectedEventsToGoogleCalendar(state.allEvents));

  document.getElementById('resetFilters').addEventListener('click', () => resetFilters(state.allEvents));
  document.getElementById('selectAllDisplayed').addEventListener('click', () => selectAllDisplayed(state.allEvents));
  document
    .getElementById('deselectAllDisplayed')
    .addEventListener('click', () => deselectAllDisplayed(state.allEvents));

  document.getElementById('toggleDetails').addEventListener('click', () => {
    const detailsSection = document.getElementById('stageDetails');
    const toggleIcon = document.querySelector('#toggleDetails i');
    if (detailsSection.classList.contains('hidden')) {
      window.sa_event?.('selection_details_opened');
      detailsSection.classList.remove('hidden');
      toggleIcon.classList.add('rotate-180');
    } else {
      window.sa_event?.('selection_details_closed');
      detailsSection.classList.add('hidden');
      toggleIcon.classList.remove('rotate-180');
    }
  });
}

export async function init() {
  const urlModes = parseModeFromUrl();
  const savedDesign = localStorage.getItem(DESIGN_STORAGE_KEY) || '';
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || '';
  state.designMode = normalizeDesignMode(urlModes.design || savedDesign || DEFAULT_DESIGN_MODE);
  state.themeMode = normalizeThemeMode(urlModes.theme || savedTheme || 'dark');
  localStorage.setItem(DESIGN_STORAGE_KEY, state.designMode);
  localStorage.setItem(THEME_STORAGE_KEY, state.themeMode);
  applyDesignClass(state.designMode);
  applyThemeClass(state.themeMode);

  const eventSelector = document.getElementById('eventSelector');
  const savedEvent = localStorage.getItem('selectedEventFile');
  const savedEventIsValid = savedEvent && EVENT_MANIFEST.some((e) => e.file === savedEvent);
  const defaultEvent = EVENT_MANIFEST.find((e) => e.default) || EVENT_MANIFEST[0];
  const initialFile = savedEventIsValid ? savedEvent : defaultEvent.file;
  const initialManifestItem = EVENT_MANIFEST.find((e) => e.file === initialFile) || defaultEvent;
  const initialCategory = getEventCategory(initialManifestItem);
  const availableCategories = getAvailableEnabledCategories();
  const safeInitialCategory = availableCategories.includes(initialCategory)
    ? initialCategory
    : availableCategories[0] || '';

  renderCategoryTabs(availableCategories);

  if (!safeInitialCategory) {
    eventSelector.innerHTML = '';
    return;
  }

  state.currentEventCategory = safeInitialCategory;
  setActiveTab(safeInitialCategory);
  populateEventSelector(safeInitialCategory, initialFile);

  if (eventSelector.value) {
    localStorage.setItem('selectedEventFile', eventSelector.value);
  }

  eventSelector.addEventListener('change', () => {
    localStorage.setItem('selectedEventFile', eventSelector.value);
    loadEvent(eventSelector.value);
  });

  document.querySelectorAll('.event-tab').forEach((button) => {
    button.addEventListener('click', async () => {
      const category = button.dataset.category;
      if (category === state.currentEventCategory) {
        return;
      }

      state.currentEventCategory = category;
      setActiveTab(category);

      const currentSavedEvent = localStorage.getItem('selectedEventFile');
      populateEventSelector(category, currentSavedEvent);

      if (eventSelector.value) {
        localStorage.setItem('selectedEventFile', eventSelector.value);
        await loadEvent(eventSelector.value);
      }
    });
  });

  setupEventListeners();

  if (eventSelector.value) {
    await loadEvent(eventSelector.value);
  }
}

export function toggleEventSelectionPublic(eventId) {
  toggleEventSelection(eventId, filterEvents, (events) => updateSelectionOverview(events, updateStageStats));
}
