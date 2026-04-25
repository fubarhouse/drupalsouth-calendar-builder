const state = {
  currentEventFile: null,
  currentEventCategory: null,
  eventMeta: null,
  eventColumns: 3,
  selectedEvents: new Set(),
  allEvents: [],
  displayedEvents: []
};

export function getStorageKey() {
  return `drupalconSelectedEvents_${state.currentEventFile || 'events.json'}`;
}

export default state;
