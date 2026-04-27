import state, { getStorageKey } from './state.js';
import { formatDateForICS, escapeHtml, announceStatus } from './utils.js';

function getCalendarDescriptionText(event) {
  return event.full_description || event.description || event.summary || '';
}

function escapeIcsText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function updateDownloadButton() {
  const downloadButton = document.getElementById('downloadIcs');
  const googleButton = document.getElementById('addGoogleCalendar');
  const hasSelections = state.selectedEvents.size > 0;

  downloadButton.disabled = !hasSelections;
  googleButton.disabled = !hasSelections;
}

export function generateIcsContent(events) {
  const selectedEvents = events.filter((event) => state.selectedEvents.has(event.id));
  const icsEvents = selectedEvents
    .map((event) => {
      const start = formatDateForICS(event.startTime);
      const end = formatDateForICS(event.endTime);
      const uid = `${event.id}@${state.currentEventFile.replace('.json', '')}`;
      const urlPart = event.link ? `${event.link}\n\n` : '';
      const description = escapeIcsText(urlPart + getCalendarDescriptionText(event));

      return `BEGIN:VEVENT
UID:${uid}
DTSTART:${start}
DTEND:${end}
SUMMARY:${event.title}
LOCATION:${event.location}
DESCRIPTION:${description}
END:VEVENT`;
    })
    .join('\n');

  const eventDisplayName = `${state.eventMeta.designation} ${state.eventMeta.location} ${state.eventMeta.year}`;
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//${eventDisplayName}//EN
X-WR-CALNAME:${eventDisplayName}
X-WR-TIMEZONE:${state.eventMeta.timezone}
${icsEvents}
END:VCALENDAR`;
}

export function triggerIcsDownload(events, filename, eventName) {
  const metadata = {
    total_events: events.length,
    total_duration: events.reduce(
      (sum, event) => sum + parseInt(event.duration.replace('PT', '').replace('H', ''), 10),
      0
    )
  };
  window.sa_event?.(eventName, metadata);

  const icsContent = generateIcsContent(events);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadSelectedEvents(events) {
  const filename = state.currentEventFile.replace('.json', '') + '-selected-events.ics';
  triggerIcsDownload(events, filename, 'download_ics');
}

export function buildGoogleCalendarEventUrl(event) {
  const start = formatDateForICS(event.startTime);
  const end = formatDateForICS(event.endTime);
  const details = [getCalendarDescriptionText(event), event.link || ''].filter(Boolean).join('\n\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title || 'Session',
    dates: `${start}/${end}`,
    details,
    location: event.location || ''
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function addSelectedEventsToGoogleCalendar(events) {
  const selectedEvents = events
    .filter((event) => state.selectedEvents.has(event.id))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  if (selectedEvents.length === 0) {
    return;
  }

  if (selectedEvents.length === 1) {
    window.sa_event?.('google_calendar_single_event');
    window.open(buildGoogleCalendarEventUrl(selectedEvents[0]), '_blank', 'noopener,noreferrer');
    return;
  }

  window.sa_event?.('google_calendar_multi_event', { count: selectedEvents.length });

  const linkRows = selectedEvents
    .map(
      (event, idx) => `
                <li style="margin-bottom:10px;">
                    <a href="${buildGoogleCalendarEventUrl(event)}" target="_blank" rel="noopener noreferrer">
                        ${idx + 1}. ${escapeHtml(event.title)}
                    </a>
                </li>
            `
    )
    .join('');

  const helperHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Add Sessions to Google Calendar</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; line-height: 1.5; }
    h1 { margin-top: 0; }
  </style>
</head>
<body>
  <h1>Add Selected Sessions</h1>
  <p>Google Calendar event links (open each in a new tab):</p>
  <ol>${linkRows}</ol>
</body>
</html>`;

  const blob = new Blob([helperHtml], { type: 'text/html;charset=utf-8' });
  const helperUrl = URL.createObjectURL(blob);
  window.open(helperUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(helperUrl), 60000);
}

export function toggleEventSelection(eventId, applyFilterFn, updateSelectionOverviewFn) {
  const event = state.allEvents.find((item) => item.id === eventId);
  if (!event) return;
  const sessionMetadata = { session: event.title };
  const trackMetadata = { track: event.track };

  if (state.selectedEvents.has(eventId)) {
    state.selectedEvents.delete(eventId);
    window.sa_event?.('removeSession', sessionMetadata);
    window.sa_event?.('removeFromTrack', trackMetadata);
    announceStatus(`Removed: ${event.title}. ${state.selectedEvents.size} selected.`);
  } else {
    state.selectedEvents.add(eventId);
    window.sa_event?.('addSession', sessionMetadata);
    window.sa_event?.('addToTrack', trackMetadata);
    announceStatus(`Selected: ${event.title}. ${state.selectedEvents.size} selected.`);
  }

  localStorage.setItem(getStorageKey(), JSON.stringify([...state.selectedEvents]));
  updateDownloadButton();
  updateSelectionOverviewFn(state.allEvents);
  applyFilterFn(state.allEvents, null, true, false);
}
