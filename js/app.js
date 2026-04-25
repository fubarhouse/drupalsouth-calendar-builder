import { init, toggleEventSelectionPublic, wireStatsHandlers } from './modules/events.js';
import { updateSelectionOverview, updateStageStats, toggleDayExpansion, toggleTrackExpansion } from './modules/stats.js';

wireStatsHandlers(updateSelectionOverview, updateStageStats);

window.toggleEventSelection = toggleEventSelectionPublic;
window.toggleDayExpansion = toggleDayExpansion;
window.toggleTrackExpansion = toggleTrackExpansion;

document.addEventListener('DOMContentLoaded', init);
