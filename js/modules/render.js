import state from './state.js';
import { getLocalDate, formatDuration, highlightKeywords } from './utils.js';

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
          const highlightedSpeakers = event.speakers
            ? highlightKeywords(Array.isArray(event.speakers) ? event.speakers.join(', ') : event.speakers, keywordsFilter)
            : '';
          const highlightedLocation = event.location ? highlightKeywords(event.location, keywordsFilter) : '';
          const descriptionText = event.summary || event.description || '';
          const highlightedDescription = descriptionText ? highlightKeywords(descriptionText, keywordsFilter) : '';
          const trackLabel = typeof event.track === 'string' ? event.track.trim() : '';
          const highlightedTrack = trackLabel ? highlightKeywords(trackLabel, keywordsFilter) : '';
          const durationText = formatDuration(event, event.duration);
          const [colorA, colorB] = getEventPalette(event);

          const bgColor = isSelected ? 'drupal-blue-bg-light' : timeSlotBgColor;
          const hoverColor = isSelected ? '' : 'hover:brightness-95';
          const cardStyle = isDrupalConDesign ? `style="--event-color-a: ${colorA}; --event-color-b: ${colorB};"` : '';
          const cardExtraClass = isDrupalConDesign ? 'event-card-dc' : '';
          const trackClass = isDrupalConDesign ? 'track-pill track-pill-dc' : 'track-pill text-xs text-gray-600 bg-white bg-opacity-60 px-2 py-1 rounded inline-block';

          return `
            <div class="event-card h-full p-4 rounded-md transition-colors cursor-pointer border-2 ${cardExtraClass} ${bgColor} ${hoverColor} ${
            isSelected ? 'drupal-blue-border-light' : 'border-transparent'
          }"
                 onclick="toggleEventSelection('${event.id}')"
                 ${cardStyle}>
                <div class="flex justify-between items-stretch h-full">
                    <div class="flex items-start space-x-3 flex-1 self-stretch">
                        <input type="checkbox"
                               class="mt-1 h-4 w-4 drupal-blue-text drupal-blue-focus border-gray-300 rounded cursor-pointer"
                               ${isSelected ? 'checked' : ''}
                               onclick="event.stopPropagation()"
                               onchange="toggleEventSelection('${event.id}')">
                        <div class="flex-1 flex flex-col h-full">
                            <h3 class="font-medium text-gray-900 mb-1">${highlightedSummary}</h3>
                            ${event.speakers ? `<p class="text-sm text-gray-700 mb-1">${highlightedSpeakers}</p>` : ''}
                            ${event.location ? `<p class="text-sm text-gray-500 mb-1"><i class="fas fa-map-marker-alt mr-1"></i>${highlightedLocation}</p>` : ''}
                            ${
                              event.link
                                ? `<p class="text-sm drupal-blue-text mb-1"><a href="${event.link}" target="_blank" class="hover:underline" onclick="event.stopPropagation()">View Session Details <i class="fas fa-external-link-alt ml-1"></i></a></p>`
                                : ''
                            }
                            ${
                              event.video_url
                                ? `<p class="text-sm mb-1"><a href="${event.video_url}" target="_blank" class="drupal-blue-text hover:underline inline-flex items-center" onclick="event.stopPropagation()"><i class="fab fa-youtube mr-1"></i>Watch recording</a></p>`
                                : ''
                            }
                            ${
                              isDrupalConDesign
                                ? `<p class="text-xs text-gray-500 mb-1">${timelineTime}</p>`
                                : `<p class="text-sm text-gray-600 mb-1">${fullDateTime}</p>`
                            }
                            ${
                              descriptionText
                                ? `<p class="text-sm text-gray-700 mb-1">${highlightedDescription}</p>`
                                : '<div class="mb-1"></div>'
                            }
                            ${
                              trackLabel
                                ? `<p class="${trackClass} mt-auto self-start">${highlightedTrack}</p>`
                                : ''
                            }
                        </div>
                    </div>
                    <span class="text-xs text-gray-500 ml-2 whitespace-nowrap">${durationText}</span>
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
