import state from './state.js';

export function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function getLocalDate(utcDateString) {
  const date = new Date(utcDateString);
  const tz = state.eventMeta.timezone;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function formatDuration(event, duration) {
  void event;
  const hoursMatch = duration.match(/(\d+)H/);
  const minutesMatch = duration.match(/(\d+)M/);
  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;

  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  if (minutes === 30) {
    return `${hours}.5h`;
  }
  return `${hours}h${minutes}m`;
}

export function highlightKeywords(text, keywords) {
  if (!keywords || keywords.trim() === '') {
    return text;
  }
  const escapedKeywords = keywords.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedKeywords})`, 'gi');
  return text.replace(regex, '<span class="keyword-highlight">$1</span>');
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function formatDateForICS(dateString) {
  return dateString.replace(/[-:]/g, '').replace(/\.\d+/, '');
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeTracks(trackValue) {
  if (Array.isArray(trackValue)) {
    return [...new Set(trackValue.map((track) => String(track || '').trim()).filter(Boolean))];
  }
  const track = String(trackValue || '').trim();
  return track ? [track] : [];
}

export function announceStatus(message) {
  const region = document.getElementById('ariaStatus');
  if (!region) return;

  region.textContent = '';
  window.setTimeout(() => {
    region.textContent = String(message || '');
  }, 20);
}
