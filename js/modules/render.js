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

export function displayListView(events, container) {
  const groupedEvents = groupEventsByDate(events);
  container.innerHTML = '';

  const keywordsFilter = document.getElementById('keywordsFilter').value;

  Object.entries(groupedEvents).forEach(([date, dateEvents]) => {
    const dateSection = document.createElement('div');
    dateSection.className = 'mb-6';
    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });

    const eventsByStartTime = groupEventsByStartTime(dateEvents);
    let dateHtml = `<h2 class="text-xl font-semibold text-gray-800 mb-3">${formattedDate}</h2>`;

    const timeSlotColors = ['slot-bg-a', 'slot-bg-b'];

    Object.entries(eventsByStartTime).forEach(([startTime, timeSlotEvents], index) => {
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
      const slotColumns = Math.min(timeSlotEvents.length, maxColumns);
      const gridCols = 'grid grid-cols-1 md:grid-cols-2 lg:[grid-template-columns:repeat(var(--slot-columns),minmax(0,1fr))] gap-2';

      const timeSlotBgColor = timeSlotColors[index % timeSlotColors.length];

      dateHtml += `
                        <div class="mb-4">
                            <div class="slot-heading sticky top-0 z-10 bg-gray-100 text-sm font-semibold text-gray-600 mb-2 py-2 -mx-4 px-4">${displayDate}, from ${displayTime}</div>
                            <div class="${gridCols}" style="--slot-columns: ${slotColumns};">
                                ${timeSlotEvents
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

                                    const highlightedSummary = highlightKeywords(event.title, keywordsFilter);
                                    const highlightedSpeakers = event.speakers
                                      ? highlightKeywords(
                                          Array.isArray(event.speakers) ? event.speakers.join(', ') : event.speakers,
                                          keywordsFilter
                                        )
                                      : '';
                                    const highlightedLocation = event.location
                                      ? highlightKeywords(event.location, keywordsFilter)
                                      : '';
                                    const highlightedDescription = event.description
                                      ? highlightKeywords(event.description, keywordsFilter)
                                      : '';
                                    const trackLabel = typeof event.track === 'string' ? event.track.trim() : '';
                                    const highlightedTrack = trackLabel ? highlightKeywords(trackLabel, keywordsFilter) : '';

                                    const bgColor = isSelected ? 'drupal-blue-bg-light' : timeSlotBgColor;
                                    const hoverColor = isSelected ? '' : 'hover:brightness-95';

                                    return `
                                    <div class="event-card p-4 rounded-md transition-colors cursor-pointer border-2 ${bgColor} ${hoverColor} ${
                                      isSelected ? 'drupal-blue-border-light' : 'border-transparent'
                                    }"
                                         onclick="toggleEventSelection('${event.id}')">
                                        <div class="flex justify-between items-start">
                                            <div class="flex items-start space-x-3 flex-1">
                                                <input type="checkbox" 
                                                       class="mt-1 h-4 w-4 drupal-blue-text drupal-blue-focus border-gray-300 rounded cursor-pointer"
                                                       ${isSelected ? 'checked' : ''}
                                                       onclick="event.stopPropagation()"
                                                       onchange="toggleEventSelection('${event.id}')">
                                                <div class="flex-1">
                                                    <h3 class="font-medium text-gray-900 mb-1">${highlightedSummary}</h3>
                                                    ${event.speakers ? `<p class="text-sm text-gray-700 mb-1">${highlightedSpeakers}</p>` : ''}
                                                    ${
                                                      event.location
                                                        ? `<p class="text-sm text-gray-500 mb-1"><i class="fas fa-map-marker-alt mr-1"></i>${highlightedLocation}</p>`
                                                        : ''
                                                    }
                                                    ${
                                                      event.link
                                                        ? `<p class="text-sm drupal-blue-text mb-1"><a href="${event.link}" target="_blank" class="hover:underline" onclick="event.stopPropagation()">View Session Details <i class="fas fa-external-link-alt ml-1"></i></a></p>`
                                                        : ''
                                                    }
                                                    <p class="text-sm text-gray-600 mb-1">${fullDateTime}</p>
                                                    ${event.description ? `<p class="text-sm text-gray-700 mb-1">${highlightedDescription}</p>` : ''}
                                                    ${
                                                      trackLabel
                                                        ? `<p class="track-pill text-xs text-gray-600 bg-white bg-opacity-60 px-2 py-1 rounded inline-block">${highlightedTrack}</p>`
                                                        : ''
                                                    }
                                                </div>
                                            </div>
                                            <span class="text-sm text-gray-500 ml-4">${formatDuration(event, event.duration)}</span>
                                        </div>
                                    </div>`;
                                  })
                                  .join('')}
                            </div>
                        </div>
                    `;
    });

    dateSection.innerHTML = dateHtml;
    container.appendChild(dateSection);
  });
}

export function displayEvents(events) {
  const container = document.getElementById('eventsContainer');
  displayListView(events, container);
}
