import state, { getStorageKey } from './state.js';
import { debounce, getLocalDate } from './utils.js';
import { displayEvents } from './render.js';
import { updateDownloadButton } from './calendar.js';

let updateSelectionOverviewFn = () => {};

export function setSelectionOverviewUpdater(fn) {
  updateSelectionOverviewFn = fn;
}

export function toggleClearButton() {
  const keywordsFilter = document.getElementById('keywordsFilter');
  const clearButton = document.getElementById('clearKeywords');

  if (keywordsFilter.value.trim() !== '') {
    clearButton.classList.remove('hidden');
  } else {
    clearButton.classList.add('hidden');
  }
}

export function filterEvents(events, clickedFilterName, skipAnalytics = false) {
  if (clickedFilterName && !skipAnalytics) {
    const filterValue = document.getElementById(clickedFilterName).value;
    window.sa_event?.(clickedFilterName, {
      filter_value: filterValue
    });
  }

  const dateFilter = document.getElementById('dateFilter').value;
  const trackFilter = document.getElementById('trackFilter').value;
  const keywordsFilter = document.getElementById('keywordsFilter').value.toLowerCase();
  const selectionFilter = document.getElementById('selectionFilter').value;

  const filteredEvents = events.filter((event) => {
    const matchesDate = !dateFilter || getLocalDate(event.startTime) === dateFilter;
    const matchesTrack = !trackFilter || event.track === trackFilter;
    const normalizedTrack = typeof event.track === 'string' ? event.track : '';
    const speakersText = Array.isArray(event.speakers)
      ? event.speakers.join(' ')
      : typeof event.speakers === 'string'
        ? event.speakers
        : '';

    const matchesKeywords =
      !keywordsFilter ||
      event.title.toLowerCase().includes(keywordsFilter) ||
      (event.description && event.description.toLowerCase().includes(keywordsFilter)) ||
      normalizedTrack.toLowerCase().includes(keywordsFilter) ||
      event.location.toLowerCase().includes(keywordsFilter) ||
      speakersText.toLowerCase().includes(keywordsFilter);

    const matchesSelection =
      selectionFilter === 'all' ||
      (selectionFilter === 'selected' && state.selectedEvents.has(event.id)) ||
      (selectionFilter === 'unselected' && !state.selectedEvents.has(event.id));

    return matchesDate && matchesTrack && matchesKeywords && matchesSelection;
  });

  state.displayedEvents = filteredEvents;
  displayEvents(filteredEvents);
}

export const debouncedFilterEvents = debounce((events) => {
  filterEvents(events, 'keywordsFilter');
}, 2000);

export function clearKeywordsFilter(events) {
  const keywordsFilter = document.getElementById('keywordsFilter');
  keywordsFilter.value = '';
  toggleClearButton();
  filterEvents(events, null, true);
}

export function resetFilters(events) {
  window.sa_event?.('reset_filters');
  document.getElementById('dateFilter').value = '';
  document.getElementById('trackFilter').value = '';
  document.getElementById('keywordsFilter').value = '';
  document.getElementById('selectionFilter').value = 'all';
  toggleClearButton();
  filterEvents(events, null, true);
}

export function selectAllDisplayed(events) {
  const displayedEvents = state.displayedEvents || events;
  let addedCount = 0;

  displayedEvents.forEach((event) => {
    if (!state.selectedEvents.has(event.id)) {
      state.selectedEvents.add(event.id);
      addedCount++;
    }
  });

  if (addedCount > 0) {
    window.sa_event?.('select_all_displayed', {
      count: addedCount
    });

    localStorage.setItem(getStorageKey(), JSON.stringify([...state.selectedEvents]));

    updateDownloadButton();
    updateSelectionOverviewFn(state.allEvents);
    filterEvents(state.allEvents);
  }
}

export function deselectAllDisplayed(events) {
  const displayedEvents = state.displayedEvents || events;
  let removedCount = 0;

  displayedEvents.forEach((event) => {
    if (state.selectedEvents.has(event.id)) {
      state.selectedEvents.delete(event.id);
      removedCount++;
    }
  });

  if (removedCount > 0) {
    window.sa_event?.('deselect_all_displayed', {
      count: removedCount
    });

    localStorage.setItem(getStorageKey(), JSON.stringify([...state.selectedEvents]));

    updateDownloadButton();
    updateSelectionOverviewFn(state.allEvents);
    filterEvents(state.allEvents);
  }
}
