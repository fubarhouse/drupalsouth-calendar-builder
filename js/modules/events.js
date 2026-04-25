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

let updateSelectionOverview = () => {};
let updateStageStats = () => {};

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

export function getHeaderBranding(category) {
  if (category === 'DrupalSouth Community Day') {
    return {
      kicker: 'DrupalSouth Community Day',
      iconClass: 'fas fa-users',
      brandClass: 'brand-community',
      logoUrl: 'https://drupalsouth.org/sites/default/files/logo_0.png'
    };
  }
  if (category === 'DrupalSouth') {
    return {
      kicker: 'DrupalSouth Schedule',
      iconClass: 'fas fa-water',
      brandClass: 'brand-drupalsouth',
      logoUrl: 'https://drupalsouth.org/sites/default/files/logo_0.png'
    };
  }
  return {
    kicker: 'DrupalCon Schedule',
    iconClass: 'fas fa-globe',
    brandClass: 'brand-drupalcon',
    logoUrl: ''
  };
}

export function updateHeaderBranding(category) {
  const logo = document.getElementById('headerLogo');
  const logoImage = document.getElementById('headerLogoImage');
  const logoIcon = document.getElementById('headerLogoIcon');
  const kicker = document.getElementById('headerKicker');
  const branding = getHeaderBranding(category);

  logo.classList.remove('brand-drupalsouth', 'brand-community', 'brand-drupalcon');
  logo.classList.add(branding.brandClass);
  logoIcon.className = branding.iconClass;
  kicker.textContent = branding.kicker;

  if (branding.logoUrl) {
    logoImage.src = branding.logoUrl;
    logoImage.classList.remove('hidden');
    logoIcon.classList.add('hidden');
  } else {
    logoImage.classList.add('hidden');
    logoIcon.classList.remove('hidden');
  }
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
  const events = await fetchEvents(filename);
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
  const eventSelector = document.getElementById('eventSelector');
  const savedEvent = localStorage.getItem('selectedEventFile');
  const savedEventIsValid = savedEvent && EVENT_MANIFEST.some((e) => e.file === savedEvent);
  const defaultEvent = EVENT_MANIFEST.find((e) => e.default) || EVENT_MANIFEST[0];
  const initialFile = savedEventIsValid ? savedEvent : defaultEvent.file;
  const initialManifestItem = EVENT_MANIFEST.find((e) => e.file === initialFile) || defaultEvent;
  const initialCategory = getEventCategory(initialManifestItem);
  const safeInitialCategory = ENABLED_EVENT_CATEGORIES.includes(initialCategory) ? initialCategory : 'DrupalSouth';

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
