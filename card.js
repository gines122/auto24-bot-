// Сборка текста карточки заявки

function formatDate(dateInput) {
  if (!dateInput) return '—';
  let date;
  try {
    if (typeof dateInput === 'string' && /^\d{2}\.\d{2}\.\d{4}/.test(dateInput)) {
      const [d, m, rest] = dateInput.split('.');
      const [y, time] = rest.split(', ');
      const [h, min] = (time || '00:00').split(':');
      date = new Date(+y, +m - 1, +d, +h, +min);
    } else {
      date = new Date(dateInput);
    }
  } catch (e) { return String(dateInput); }
  if (isNaN(date.getTime())) return String(dateInput);

  const now = new Date();
  const todayStart     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const dateStart      = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const timeStr = `${hh}:${mm}`;

  if (dateStart.getTime() === todayStart.getTime())     return `Сегодня • ${timeStr}`;
  if (dateStart.getTime() === yesterdayStart.getTime()) return `Вчера • ${timeStr}`;

  const dd   = String(date.getDate()).padStart(2, '0');
  const mon  = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${dd}.${mon}.${year} • ${timeStr}`;
}

function getFlag(country) {
  if (!country) return '🌍';
  const l = country.toLowerCase();
  if (l.includes('ukraine') || l.includes('kyiv') || l.includes('харьков') || l.includes('lymanka')) return '🇺🇦';
  if (l.includes('germany') || l.includes('frankfurt') || l.includes('berlin') || l.includes('münchen') || l.includes('munich')) return '🇩🇪';
  if (l.includes('poland')) return '🇵🇱';
  if (l.includes('austria')) return '🇦🇹';
  if (l.includes('czech')) return '🇨🇿';
  if (l.includes('netherlands') || l.includes('holland')) return '🇳🇱';
  if (l.includes('france')) return '🇫🇷';
  if (l.includes('italy') || l.includes('italia')) return '🇮🇹';
  if (l.includes('spain') || l.includes('españa')) return '🇪🇸';
  return '🌍';
}

const LANG_MAP = {
  uk: 'Украинский', ru: 'Русский', de: 'Немецкий',
  en: 'Английский', pl: 'Польский', fr: 'Французский',
};

function formatLang(lang) {
  if (!lang) return '—';
  return LANG_MAP[lang] || lang;
}

function buildCard(data, leadId) {
  const id      = String(leadId || 0).padStart(6, '0');
  const phone   = (data.phone || '—').replace(/[^\d+]/g, '') || (data.phone || '—');
  const flag    = getFlag(data.country);
  const dateStr = formatDate(data.date);
  const status  = data.status  || '🟡 Новая';
  const verdict = data.verdict || '—';

  // Источник трафика
  let trafficLine = '';
  if (data.utm_source) {
    if (data.utm_source === 'google' && data.utm_medium === 'cpc') {
      trafficLine = 'Google Ads';
      if (data.utm_campaign) trafficLine += `\nКампания: ${data.utm_campaign}`;
      if (data.utm_keyword)  trafficLine += `\nКлючевое слово: ${data.utm_keyword}`;
    } else if (data.utm_source === 'google') {
      trafficLine = 'Google SEO';
    } else if (data.utm_source === 'telegram') {
      trafficLine = 'Telegram';
    } else {
      trafficLine = data.utm_source;
    }
  } else {
    trafficLine = data.traffic_source || 'Прямой переход';
  }

  const block   = data.source || '—';
  const comment = data.comment && data.comment !== '—' ? data.comment : '';
  const time    = data.time    && data.time    !== '—' ? data.time    : '';

  const lines = [
    `🚗 AUTO24 GROUP`,
    ``,
    `Заявка #${id}`,
    ``,
    `📞 ${phone}`,
    `👤 ${data.name || '—'}`,
    ``,
    `${flag} ${data.country || '—'}`,
    `🌐 ${formatLang(data.lang)}`,
    ``,
    `🕒 ${dateStr}`,
  ];

  if (time) {
    lines.push(``, `⏰ Удобное время:`, time);
  }

  if (comment) {
    lines.push(``, `💬 Комментарий:`, comment);
  }

  lines.push(``, `📣 Источник:`, trafficLine);
  lines.push(``, `📍 Блок:`, block);
  lines.push(``, `────────────────────`, ``);
  lines.push(`Статус:`, status, ``, `Вердикт:`, verdict);

  return lines.join('\n');
}

module.exports = { buildCard, formatDate };
