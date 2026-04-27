import state from './state.js';
import { getLocalDate, formatDuration, highlightKeywords, escapeHtml } from './utils.js';

const SESSION_MODAL_ID = 'sessionDetailModal';
let lastFocusedElementBeforeModal = null;

function formatTextBlock(text, keywords = '') {
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
      const highlighted = highlightKeywords(escapeHtml(bulletMatch[1].trim()), keywords);
      listItems.push(highlighted);
      return;
    }

    if (line.trim() === '') {
      flushList();
      flushParagraph();
      return;
    }

    flushList();
    paragraphLines.push(highlightKeywords(escapeHtml(line.trim()), keywords));
  });

  flushList();
  flushParagraph();

  return blocks.join('');
}

function getSessionDescription(event) {
  return event.full_description || event.description || '';
}

function hasSessionDescription(event) {
  return Boolean(String(event.full_description || event.description || event.summary || '').trim());
}

function getCardSummary(event) {
  if (Object.prototype.hasOwnProperty.call(event, 'summary')) {
    return String(event.summary || '').trim();
  }
  return String(event.description || '').trim();
}

function getEventById(eventId) {
  return state.allEvents.find((event) => event.id === eventId) || null;
}

function getSpeakersInfo(speakers) {
  if (!speakers) {
    return { text: '', isMultiple: false };
  }

  if (Array.isArray(speakers)) {
    const cleaned = speakers.map((speaker) => String(speaker || '').trim()).filter(Boolean);
    return {
      text: cleaned.join(', '),
      isMultiple: cleaned.length > 1
    };
  }

  const text = String(speakers).trim();
  if (!text) {
    return { text: '', isMultiple: false };
  }

  return {
    text,
    isMultiple: text.includes(',')
  };
}

function ensureSessionModal() {
  let modal = document.getElementById(SESSION_MODAL_ID);
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = SESSION_MODAL_ID;
  modal.className = 'session-modal-overlay hidden';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="session-modal-card" role="dialog" aria-modal="true" aria-labelledby="sessionModalTitle">
      <div class="session-modal-header">
        <button id="sessionModalBack" type="button" class="session-modal-back">
          <i class="fas fa-arrow-left"></i><span>Back to schedule</span>
        </button>
        <button id="sessionModalClose" type="button" class="session-modal-close" aria-label="Close session details">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="session-modal-body" id="sessionModalBody"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeSessionModal();
    }
  });
  modal.querySelector('#sessionModalClose').addEventListener('click', closeSessionModal);
  modal.querySelector('#sessionModalBack').addEventListener('click', closeSessionModal);
  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSessionModal();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = getFocusableElements(modal);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  return modal;
}

function getFocusableElements(container) {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ];
  return [...container.querySelectorAll(selectors.join(','))].filter((element) => !element.hasAttribute('disabled'));
}

function renderSessionModalContent(event) {
  const startDate = new Date(event.startTime);
  const endDate = new Date(event.endTime);
  const dayDate = startDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: state.eventMeta.timezone
  });
  const startTime = startDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: state.eventMeta.timezone
  });
  const endTime = endDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: state.eventMeta.timezone
  });

  const isSelected = state.selectedEvents.has(event.id);
  const description = getSessionDescription(event);
  const descriptionHtml = formatTextBlock(description);
  const hasDescription = hasSessionDescription(event);
  const speakersInfo = getSpeakersInfo(event.speakers);
  const speakersIcon = speakersInfo.isMultiple ? 'fa-users' : 'fa-user';
  const whenValue = `${escapeHtml(dayDate)}, ${escapeHtml(startTime)} - ${escapeHtml(endTime)}`;
  const body = ensureSessionModal().querySelector('#sessionModalBody');

  body.innerHTML = `
    <h2 id="sessionModalTitle" class="session-modal-title">${escapeHtml(event.title || 'Session')}</h2>
    ${
      speakersInfo.text
        ? `<p class="session-modal-meta"><span class="session-modal-meta-label">Speakers</span><span class="session-modal-meta-value"><i class="fas ${speakersIcon} mr-1" aria-hidden="true"></i>${escapeHtml(
            speakersInfo.text
          )}</span></p>`
        : ''
    }
    <p class="session-modal-meta"><span class="session-modal-meta-label">When</span><span class="session-modal-meta-value"><i class="far fa-clock mr-1" aria-hidden="true"></i>${whenValue}</span></p>
    ${
      event.location
        ? `<p class="session-modal-meta"><span class="session-modal-meta-label">Location</span><span class="session-modal-meta-value">${escapeHtml(event.location)}</span></p>`
        : ''
    }
    ${
      event.track
        ? `<p class="session-modal-meta"><span class="session-modal-meta-label">Track</span><span class="session-modal-meta-value">${escapeHtml(event.track)}</span></p>`
        : ''
    }
    ${
      event.duration
        ? `<p class="session-modal-meta"><span class="session-modal-meta-label">Duration</span><span class="session-modal-meta-value">${escapeHtml(
            formatDuration(event, event.duration)
          )}</span></p>`
        : ''
    }
    ${
      event.video_url || (event.link && hasDescription)
        ? `<div class="session-modal-links">
            ${
              event.link && hasDescription
                ? `<a class="session-modal-link" href="${event.link}" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt"></i><span>Session page</span></a>`
                : ''
            }
            ${
              event.video_url
                ? `<a class="session-modal-link" href="${event.video_url}" target="_blank" rel="noopener noreferrer"><i class="fab fa-youtube"></i><span>Watch recording</span></a>`
                : ''
            }
          </div>`
        : ''
    }
    <div class="session-modal-description">${descriptionHtml || '<em>No description available.</em>'}</div>
    <div class="session-modal-actions">
      <button id="sessionModalToggleSelection" type="button" aria-pressed="${isSelected ? 'true' : 'false'}" class="session-modal-toggle ${isSelected ? 'is-selected' : ''}">
        ${isSelected ? 'Remove from selection' : 'Add to selection'}
      </button>
    </div>
  `;

  const toggleButton = body.querySelector('#sessionModalToggleSelection');
  toggleButton.addEventListener('click', () => {
    if (window.toggleEventSelection) {
      window.toggleEventSelection(event.id);
    }
    const selected = state.selectedEvents.has(event.id);
    toggleButton.classList.toggle('is-selected', selected);
    toggleButton.setAttribute('aria-pressed', selected ? 'true' : 'false');
    toggleButton.textContent = selected ? 'Remove from selection' : 'Add to selection';
  });
}

export function openSessionModal(eventId) {
  const event = getEventById(eventId);
  if (!event) return;
  const modal = ensureSessionModal();
  lastFocusedElementBeforeModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  renderSessionModalContent(event);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('session-modal-open');
  const closeButton = modal.querySelector('#sessionModalClose');
  if (closeButton) {
    closeButton.focus();
  }
}

export function closeSessionModal() {
  const modal = ensureSessionModal();
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('session-modal-open');
  if (lastFocusedElementBeforeModal && document.contains(lastFocusedElementBeforeModal)) {
    lastFocusedElementBeforeModal.focus();
  }
  lastFocusedElementBeforeModal = null;
}

export function handleSessionCardKeydown(event, eventId) {
  if (event.target !== event.currentTarget) {
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openSessionModal(eventId);
  }
}

export function groupEventsByDate(events) {
  return events.reduce((groups, event) => {
    const date = getLocalDate(event.startTime);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(event);
    return groups;
  }, {});
}

export function groupEventsByStartTime(events) {
  const grouped = {};
  events.forEach((event) => {
    const startTime = event.startTime;
    if (!grouped[startTime]) {
      grouped[startTime] = [];
    }
    grouped[startTime].push(event);
  });
  return grouped;
}

function hashString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getEventPalette(event) {
  const palettePairs = [
    ['#0ea5e9', '#2563eb'],
    ['#f97316', '#ea580c'],
    ['#16a34a', '#0d9488'],
    ['#d946ef', '#9333ea'],
    ['#ef4444', '#dc2626'],
    ['#14b8a6', '#0891b2'],
    ['#f59e0b', '#d97706'],
    ['#22c55e', '#15803d']
  ];
  const seed = `${event.track || ''}|${event.title || ''}|${event.location || ''}`;
  return palettePairs[hashString(seed) % palettePairs.length];
}

export function displayListView(events, container) {
  const groupedEvents = groupEventsByDate(events);
  container.innerHTML = '';

  const keywordsFilter = document.getElementById('keywordsFilter').value;
  const isDrupalConDesign = state.designMode === 'drupalcon';

  Object.entries(groupedEvents).forEach(([date, dateEvents]) => {
    const dateSection = document.createElement('div');
    dateSection.className = isDrupalConDesign ? 'mb-8 schedule-day' : 'mb-6';
    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });

    const sortedDateEvents = [...dateEvents].sort((a, b) => {
      const byTime = new Date(a.startTime) - new Date(b.startTime);
      if (byTime !== 0) return byTime;
      const byLocation = String(a.location || '').localeCompare(String(b.location || ''));
      if (byLocation !== 0) return byLocation;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
    const eventsByStartTime = groupEventsByStartTime(sortedDateEvents);
    const startTimeEntries = Object.entries(eventsByStartTime).sort((a, b) => new Date(a[0]) - new Date(b[0]));
    let dateHtml = isDrupalConDesign
      ? `<h2 class="schedule-day-heading text-xl font-semibold text-gray-800 mb-4">${formattedDate}</h2>`
      : `<h2 class="text-xl font-semibold text-gray-800 mb-3">${formattedDate}</h2>`;

    const timeSlotColors = ['slot-bg-a', 'slot-bg-b'];

    startTimeEntries.forEach(([startTime, timeSlotEvents], index) => {
      const startDate = new Date(startTime);
      const displayDate = startDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: state.eventMeta.timezone
      });
      const displayTime = startDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: state.eventMeta.timezone
      });

      const maxColumns = Math.max(1, Math.min(6, state.eventColumns || 3));
      const designColumnsCap = isDrupalConDesign ? Math.max(maxColumns, 4) : maxColumns;
      const slotColumns = Math.min(timeSlotEvents.length, designColumnsCap);
      const gridCols = 'grid grid-cols-1 md:grid-cols-2 lg:[grid-template-columns:repeat(var(--slot-columns),minmax(0,1fr))] gap-2';

      const timeSlotBgColor = timeSlotColors[index % timeSlotColors.length];
      const sortedSlotEvents = [...timeSlotEvents].sort((a, b) => {
        const byLocation = String(a.location || '').localeCompare(String(b.location || ''));
        if (byLocation !== 0) return byLocation;
        return String(a.title || '').localeCompare(String(b.title || ''));
      });
      const slotCardsHtml = sortedSlotEvents
        .map((event) => {
          const isSelected = state.selectedEvents.has(event.id);
          const startDateItem = new Date(event.startTime);
          const endDateItem = new Date(event.endTime);

          const dayDate = startDateItem.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            timeZone: state.eventMeta.timezone
          });

          const startTimeItem = startDateItem.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: state.eventMeta.timezone
          });

          const endTimeItem = endDateItem.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: state.eventMeta.timezone
          });

          const fullDateTime = `${dayDate}.<br><strong>${startTimeItem} - ${endTimeItem}</strong>`;
          const timelineTime = `${startTimeItem} - ${endTimeItem}`;
          const highlightedSummary = highlightKeywords(event.title, keywordsFilter);
          const speakersInfo = getSpeakersInfo(event.speakers);
          const highlightedSpeakers = speakersInfo.text ? highlightKeywords(speakersInfo.text, keywordsFilter) : '';
          const speakersIcon = speakersInfo.isMultiple ? 'fa-users' : 'fa-user';
          const highlightedLocation = event.location ? highlightKeywords(event.location, keywordsFilter) : '';
          const descriptionText = getCardSummary(event);
          const hasDescription = hasSessionDescription(event);
          const highlightedDescription = descriptionText ? formatTextBlock(descriptionText, keywordsFilter) : '';
          const trackLabel = typeof event.track === 'string' ? event.track.trim() : '';
          const highlightedTrack = trackLabel ? highlightKeywords(trackLabel, keywordsFilter) : '';
          const durationText = formatDuration(event, event.duration);
          const [colorA, colorB] = getEventPalette(event);

          const bgColor = isSelected ? 'drupal-blue-bg-light' : timeSlotBgColor;
          const hoverColor = isSelected ? '' : 'hover:brightness-95';
          const cardStyle = isDrupalConDesign ? `style="--event-color-a: ${colorA}; --event-color-b: ${colorB};"` : '';
          const cardExtraClass = isDrupalConDesign ? 'event-card-dc' : '';
          const trackClass = isDrupalConDesign ? 'track-pill track-pill-dc' : 'track-pill text-xs text-gray-600 bg-white bg-opacity-60 px-2 py-1 rounded inline-block';
          const selectedBadge = isSelected ? '<span class="session-selected-indicator" aria-hidden="true">Selected</span>' : '';

          return `
            <div class="event-card relative h-full p-4 rounded-md transition-colors cursor-pointer border-2 ${cardExtraClass} ${bgColor} ${hoverColor} ${
            isSelected ? 'drupal-blue-border-light' : 'border-transparent'
          }"
                 role="button"
                 tabindex="0"
                 aria-haspopup="dialog"
                 aria-label="${escapeHtml(event.title || 'Session')}. Open session details."
                 onclick="openSessionModal('${event.id}')"
                 onkeydown="handleSessionCardKeydown(event, '${event.id}')"
                 ${cardStyle}>
                <div class="absolute top-3 right-3 flex flex-col items-end gap-1">
                    <label class="schedule-select-label inline-flex items-center justify-center cursor-pointer select-none" title="Add or remove from selection">
                      <input
                        type="checkbox"
                        class="h-4 w-4 schedule-select-checkbox"
                        ${isSelected ? 'checked' : ''}
                        onclick="event.stopPropagation()"
                        onchange="window.toggleEventSelection && window.toggleEventSelection('${event.id}')"
                        aria-label="${isSelected ? 'Remove session from selection' : 'Add session to selection'}: ${escapeHtml(
                          event.title || 'Session'
                        )}"
                      />
                    </label>
                    ${selectedBadge}
                </div>
                <span class="absolute bottom-3 right-3 text-xs text-gray-500 whitespace-nowrap">${durationText}</span>
                <div class="flex items-start space-x-3 flex-1 self-stretch">
                        <div class="flex-1 flex flex-col h-full pr-16">
                            <h3 class="font-medium text-gray-900 mb-1">${highlightedSummary}</h3>
                            ${
                              speakersInfo.text
                                ? `<p class="text-sm text-gray-700 mb-1"><i class="fas ${speakersIcon} mr-1" aria-hidden="true"></i>${highlightedSpeakers}</p>`
                                : ''
                            }
                            ${event.location ? `<p class="text-sm text-gray-500 mb-1"><i class="fas fa-map-marker-alt mr-1"></i>${highlightedLocation}</p>` : ''}
                            ${
                              isDrupalConDesign
                                ? `<p class="text-xs text-gray-500 mb-1"><i class="far fa-clock mr-1" aria-hidden="true"></i>${timelineTime}</p>`
                                : `<p class="text-sm text-gray-600 mb-1"><i class="far fa-clock mr-1" aria-hidden="true"></i>${fullDateTime}</p>`
                            }
                            ${
                              descriptionText
                                ? `<div class="session-description-preview text-sm text-gray-700 mb-1">${highlightedDescription}</div>`
                                : '<div class="mb-1"></div>'
                            }
                            ${
                              event.link && hasDescription
                                ? `<p class="text-sm mb-1"><a href="${event.link}" target="_blank" class="schedule-link" onclick="event.stopPropagation()"><span>View Session Details</span> <i class="fas fa-external-link-alt ml-1"></i></a></p>`
                                : ''
                            }
                            ${
                              event.video_url
                                ? `<p class="text-sm mb-1"><a href="${event.video_url}" target="_blank" class="schedule-link inline-flex items-center" onclick="event.stopPropagation()"><i class="fab fa-youtube mr-1"></i><span>Watch recording</span></a></p>`
                                : ''
                            }
                            ${
                              trackLabel
                                ? `<div class="mt-auto pt-[5px]"><p class="${trackClass} self-start">${highlightedTrack}</p></div>`
                                : ''
                            }
                        </div>
                </div>
            </div>
          `;
        })
        .join('');

      if (isDrupalConDesign) {
        dateHtml += `
          <div class="timeline-row mb-3">
            <div class="timeline-time">
              <div class="timeline-time-hour">${displayTime}</div>
              <div class="timeline-time-date">${displayDate}</div>
            </div>
            <div class="timeline-events ${gridCols}" style="--slot-columns: ${slotColumns};">
              ${slotCardsHtml}
            </div>
          </div>
        `;
      } else {
        dateHtml += `
          <div class="mb-4">
            <div class="slot-heading sticky top-0 z-10 bg-gray-100 text-sm font-semibold text-gray-600 mb-2 py-2 -mx-4 px-4">${displayDate}, from ${displayTime}</div>
            <div class="${gridCols}" style="--slot-columns: ${slotColumns};">
              ${slotCardsHtml}
            </div>
          </div>
        `;
      }
    });

    dateSection.innerHTML = dateHtml;
    container.appendChild(dateSection);
  });
}

export function displayEvents(events) {
  const container = document.getElementById('eventsContainer');
  displayListView(events, container);
}

window.openSessionModal = openSessionModal;
window.closeSessionModal = closeSessionModal;
window.handleSessionCardKeydown = handleSessionCardKeydown;
