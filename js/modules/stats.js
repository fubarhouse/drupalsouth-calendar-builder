import state from './state.js';
import { getLocalDate, normalizeTracks } from './utils.js';

function parseDurationHours(duration = '') {
  const hoursMatch = String(duration).match(/(\d+)H/);
  const minutesMatch = String(duration).match(/(\d+)M/);
  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
  return hours + minutes / 60;
}

export function updateSelectionOverview(events, updateStageStats) {
  const overviewPanel = document.getElementById('selectionOverview');
  const selectedEvents = events.filter((event) => state.selectedEvents.has(event.id));

  if (selectedEvents.length === 0) {
    overviewPanel.classList.add('translate-y-full');
    return;
  }

  overviewPanel.classList.remove('translate-y-full');

  const trackStats = {};
  selectedEvents.forEach((event) => {
    const trackValues = normalizeTracks(event.track);
    const durationHours = parseDurationHours(event.duration);

    trackValues.forEach((track) => {
      if (!trackStats[track]) {
        trackStats[track] = { count: 0, duration: 0 };
      }
      trackStats[track].count++;
      trackStats[track].duration += durationHours;
    });
  });

  updateStageStats(trackStats);

  const totalEvents = selectedEvents.length;
  const totalDuration = selectedEvents.reduce((sum, event) => sum + parseDurationHours(event.duration), 0);

  document.getElementById('totalEvents').textContent = totalEvents;
  document.getElementById('totalDuration').textContent = `${totalDuration.toFixed(1)} hours`;
}

export function updateStageStats() {
  const stageStatsContainer = document.getElementById('stageStats');
  const selectedEvents = state.allEvents.filter((event) => state.selectedEvents.has(event.id));

  const dailyStats = {};
  selectedEvents.forEach((event) => {
    const date = getLocalDate(event.startTime);
    const trackValues = normalizeTracks(event.track);
    const durationHours = parseDurationHours(event.duration);
    if (!dailyStats[date]) {
      dailyStats[date] = { count: 0, duration: 0, tracks: {} };
    }
    dailyStats[date].count++;
    dailyStats[date].duration += durationHours;

    trackValues.forEach((track) => {
      if (!dailyStats[date].tracks[track]) {
        dailyStats[date].tracks[track] = { count: 0, duration: 0 };
      }
      dailyStats[date].tracks[track].count++;
      dailyStats[date].tracks[track].duration += durationHours;
    });
  });

  const trackStats = {};
  selectedEvents.forEach((event) => {
    const trackValues = normalizeTracks(event.track);
    const date = getLocalDate(event.startTime);
    const durationHours = parseDurationHours(event.duration);

    trackValues.forEach((track) => {
      if (!trackStats[track]) {
        trackStats[track] = { count: 0, duration: 0, days: {} };
      }
      trackStats[track].count++;
      trackStats[track].duration += durationHours;

      if (!trackStats[track].days[date]) {
        trackStats[track].days[date] = { count: 0, duration: 0 };
      }
      trackStats[track].days[date].count++;
      trackStats[track].days[date].duration += durationHours;
    });
  });

  const sortedDates = Object.keys(dailyStats).sort();

  stageStatsContainer.innerHTML = `
                <div class="space-y-4">
                    <div>
                        <h4 class="text-white font-medium mb-2">By Track</h4>
                        <table class="text-sm text-white">
                            <tbody>
                                ${Object.entries(trackStats)
                                  .sort((a, b) => b[1].count - a[1].count)
                                  .map(([track, stats], index) => {
                                    const hours = Math.floor(stats.duration);
                                    const minutes = Math.round((stats.duration - hours) * 60);
                                    let durationText = '';

                                    if (hours === 0) {
                                      durationText = `${minutes}m`;
                                    } else if (minutes === 0) {
                                      durationText = `${hours}h`;
                                    } else {
                                      durationText = `${hours}h${minutes}m`;
                                    }

                                    const dayBreakdown = Object.entries(stats.days)
                                      .sort((a, b) => a[0].localeCompare(b[0]))
                                      .map(([date, dayStats]) => {
                                        const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                                          weekday: 'long'
                                        });
                                        const dayHours = Math.floor(dayStats.duration);
                                        const dayMinutes = Math.round((dayStats.duration - dayHours) * 60);
                                        let dayDurationText = '';

                                        if (dayHours === 0) {
                                          dayDurationText = `${dayMinutes}m`;
                                        } else if (dayMinutes === 0) {
                                          dayDurationText = `${dayHours}h`;
                                        } else {
                                          dayDurationText = `${dayHours}h${dayMinutes}m`;
                                        }

                                        return `
                                                    <tr>
                                                        <td class="pr-3 pl-6">${formattedDate}</td>
                                                        <td class="pr-3 font-mono text-right">${dayDurationText}</td>
                                                        <td>${dayStats.count} ${dayStats.count === 1 ? 'event' : 'events'}</td>
                                                    </tr>
                                                `;
                                      })
                                      .join('');

                                    return `
                                            <tr class="cursor-pointer hover:bg-gray-700 hover:bg-opacity-30 transition-colors" onclick="toggleTrackExpansion('track-${index}')">
                                                <td class="pr-3">
                                                    <i id="track-${index}-icon" class="fas fa-chevron-right mr-2 text-xs transition-transform"></i>
                                                    ${track}
                                                </td>
                                                <td class="pr-3 font-mono text-right">${durationText}</td>
                                                <td>${stats.count} ${stats.count === 1 ? 'event' : 'events'}</td>
                                            </tr>
                                            <tr id="track-${index}-details" class="hidden">
                                                <td colspan="3">
                                                    <table class="w-full">
                                                        <tbody>
                                                            ${dayBreakdown}
                                                        </tbody>
                                                    </table>
                                                </td>
                                            </tr>
                                        `;
                                  })
                                  .join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="border-t border-gray-700 pt-4">
                        <h4 class="text-white font-medium mb-2">By Day</h4>
                        <table class="text-sm text-white">
                            <tbody>
                                ${sortedDates
                                  .map((date, index) => {
                                    const stats = dailyStats[date];
                                    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                                      weekday: 'long'
                                    });
                                    const hours = Math.floor(stats.duration);
                                    const minutes = Math.round((stats.duration - hours) * 60);
                                    let durationText = '';

                                    if (hours === 0) {
                                      durationText = `${minutes}m`;
                                    } else if (minutes === 0) {
                                      durationText = `${hours}h`;
                                    } else {
                                      durationText = `${hours}h${minutes}m`;
                                    }

                                    const trackBreakdown = Object.entries(stats.tracks)
                                      .sort((a, b) => b[1].count - a[1].count)
                                      .map(([track, dayTrackStats]) => {
                                        const trackHours = Math.floor(dayTrackStats.duration);
                                        const trackMinutes = Math.round((dayTrackStats.duration - trackHours) * 60);
                                        let trackDurationText = '';

                                        if (trackHours === 0) {
                                          trackDurationText = `${trackMinutes}m`;
                                        } else if (trackMinutes === 0) {
                                          trackDurationText = `${trackHours}h`;
                                        } else {
                                          trackDurationText = `${trackHours}h${trackMinutes}m`;
                                        }

                                        return `
                                                    <tr>
                                                        <td class="pr-3 pl-6">${track}</td>
                                                        <td class="pr-3 font-mono text-right">${trackDurationText}</td>
                                                        <td>${dayTrackStats.count} ${dayTrackStats.count === 1 ? 'event' : 'events'}</td>
                                                    </tr>
                                                `;
                                      })
                                      .join('');

                                    return `
                                            <tr class="cursor-pointer hover:bg-gray-700 hover:bg-opacity-30 transition-colors" onclick="toggleDayExpansion('day-${index}')">
                                                <td class="pr-3">
                                                    <i id="day-${index}-icon" class="fas fa-chevron-right mr-2 text-xs transition-transform"></i>
                                                    ${formattedDate}
                                                </td>
                                                <td class="pr-3 font-mono text-right">${durationText}</td>
                                                <td>${stats.count} ${stats.count === 1 ? 'event' : 'events'}</td>
                                            </tr>
                                            <tr id="day-${index}-details" class="hidden">
                                                <td colspan="3">
                                                    <table class="w-full">
                                                        <tbody>
                                                            ${trackBreakdown}
                                                        </tbody>
                                                    </table>
                                                </td>
                                            </tr>
                                        `;
                                  })
                                  .join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
}

export function toggleDayExpansion(dayId) {
  const detailsDiv = document.getElementById(`${dayId}-details`);
  const icon = document.getElementById(`${dayId}-icon`);

  if (detailsDiv.classList.contains('hidden')) {
    detailsDiv.classList.remove('hidden');
    icon.classList.add('rotate-90');
  } else {
    detailsDiv.classList.add('hidden');
    icon.classList.remove('rotate-90');
  }
}

export function toggleTrackExpansion(trackId) {
  const detailsDiv = document.getElementById(`${trackId}-details`);
  const icon = document.getElementById(`${trackId}-icon`);

  if (detailsDiv.classList.contains('hidden')) {
    detailsDiv.classList.remove('hidden');
    icon.classList.add('rotate-90');
  } else {
    detailsDiv.classList.add('hidden');
    icon.classList.remove('rotate-90');
  }
}
