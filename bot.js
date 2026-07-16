const TelegramBot = require('node-telegram-bot-api');
const express    = require('express');
const fetch      = require('node-fetch');
const { buildCard } = require('./card');
const { buildKeyboard } = require('./keyboard');

const TOKEN    = process.env.TG_TOKEN;
const CHAT_ID  = process.env.TG_CHAT_ID;
const GAS_URL  = process.env.GAS_URL;
const HOOK_URL = process.env.WEBHOOK_URL;
const PORT     = process.env.PORT || 3000;
const BOT_VER  = '2.0';

const bot = new TelegramBot(TOKEN);
const app = express();
app.use(express.json());

bot.setWebHook(`${HOOK_URL}/bot${TOKEN}`);
app.post(`/bot${TOKEN}`, (req, res) => { bot.processUpdate(req.body); res.sendStatus(200); });
app.get('/', (req, res) => res.send('Auto24 Bot running'));

// ── REPLY KEYBOARD ──────────────────────────────────────────────────────
const MAIN_MENU = {
  keyboard: [
    ['📥 Новые заявки', '📋 Последние'],
    ['📊 Статистика',   '🔍 Поиск'],
    ['📈 Источники',    '⚙️ Настройки'],
  ],
  resize_keyboard: true,
  is_persistent:   true,
};

const SETTINGS_MENU = {
  keyboard: [
    ['ℹ️ Версия бота',      '🧪 Тест уведомления'],
    ['📋 Информация',       '⬅️ Назад'],
  ],
  resize_keyboard: true,
  is_persistent:   true,
};

// ── SEARCH STATE ────────────────────────────────────────────────────────
const searchPending = new Set(); // chat_ids ожидающих ввода поиска

// ── УТИЛИТЫ ─────────────────────────────────────────────────────────────
function formatPhone(phone) {
  return (phone || '').toString().replace("'", '').replace(/[^\d+]/g, '');
}

function guard(msg) {
  return msg.chat.id.toString() !== CHAT_ID;
}

// ── КОМАНДЫ (оставлены для совместимости) ──────────────────────────────
bot.onText(/^\/start/, msg => {
  if (guard(msg)) return;
  bot.sendMessage(CHAT_ID, '🚗 Auto24 Bot активен. Выберите действие:', { reply_markup: MAIN_MENU });
});

bot.onText(/^\/zayavki|^\/заявки/, msg => {
  if (guard(msg)) return;
  sendLastLeads(10);
});

bot.onText(/^\/stat|^\/стат/, msg => {
  if (guard(msg)) return;
  sendStats();
});

// ── REPLY KEYBOARD HANDLERS ─────────────────────────────────────────────
bot.on('message', async msg => {
  if (guard(msg)) return;
  const text = (msg.text || '').trim();
  if (!text || text.startsWith('/')) return;

  // Если ожидаем поисковый запрос
  if (searchPending.has(msg.chat.id)) {
    searchPending.delete(msg.chat.id);
    await handleSearch(text);
    return;
  }

  switch (text) {
    case '📥 Новые заявки':    await sendNewLeads();     break;
    case '📋 Последние':       await sendLastLeads(10);  break;
    case '📊 Статистика':      await sendStats();        break;
    case '🔍 Поиск':           await startSearch(msg);   break;
    case '📈 Источники':       await sendSources();      break;
    case '⚙️ Настройки':      sendSettingsMenu();       break;
    case 'ℹ️ Версия бота':     sendVersion();            break;
    case '🧪 Тест уведомления': sendTestNotification();  break;
    case '📋 Информация':      sendInfo();               break;
    case '⬅️ Назад':           sendMainMenu();           break;
  }
});

// ── ОБРАБОТЧИКИ РАЗДЕЛОВ ────────────────────────────────────────────────
async function sendNewLeads() {
  try {
    const data = await fetch(`${GAS_URL}?action=leads&n=50`).then(r => r.json());
    const fresh = data.filter(l => {
      const s = (l.status || '').trim();
      return s === '🟡 Новая' || s === 'Новая' || s === '';
    });
    if (!fresh.length) {
      bot.sendMessage(CHAT_ID, 'Сегодня новых заявок нет.', { reply_markup: MAIN_MENU });
      return;
    }
    let text = `📥 Новые заявки: ${fresh.length}\n\n`;
    fresh.forEach((l, i) => {
      const id    = String(l.leadId || l.row || 0).padStart(6, '0');
      const phone = formatPhone(l.phone);
      text += `${i + 1}. #${id} ${l.name || '—'} · ${phone}\n`;
      text += `   ${l.date || ''}\n\n`;
    });
    bot.sendMessage(CHAT_ID, text, { reply_markup: MAIN_MENU });
  } catch (e) {
    bot.sendMessage(CHAT_ID, 'Ошибка при загрузке заявок.', { reply_markup: MAIN_MENU });
  }
}

async function sendLastLeads(n) {
  try {
    const data = await fetch(`${GAS_URL}?action=leads&n=${n}`).then(r => r.json());
    if (!data.length) {
      bot.sendMessage(CHAT_ID, 'Заявок пока нет.', { reply_markup: MAIN_MENU });
      return;
    }
    let text = `📋 Последние ${data.length} заявок:\n\n`;
    data.forEach((l, i) => {
      const id    = String(l.leadId || l.row || 0).padStart(6, '0');
      const phone = formatPhone(l.phone);
      text += `${i + 1}. #${id} ${l.name || '—'} · ${phone}\n`;
      text += `   ${l.status || '—'} · ${l.verdict || '—'}\n`;
      text += `   ${l.date || ''}\n\n`;
    });
    bot.sendMessage(CHAT_ID, text, { reply_markup: MAIN_MENU });
  } catch (e) {
    bot.sendMessage(CHAT_ID, 'Ошибка при загрузке заявок.', { reply_markup: MAIN_MENU });
  }
}

async function sendStats() {
  try {
    const s = await fetch(`${GAS_URL}?action=stats`).then(r => r.json());

    // Считаем конверсию (Купил / всего * 100)
    const bought     = s.verdicts?.['🟢 Купил'] || 0;
    const conversion = s.total ? Math.round((bought / s.total) * 100) : 0;

    let text = `📊 Статистика Auto24\n\nВсего заявок: ${s.total}\n`;

    // Сегодня
    const today = s.today || {};
    if (today.total) {
      text += `\n📅 Сегодня: ${today.total}\n`;
      if (today.statuses) {
        const map = {
          '🟡 Новая':    'Новых',
          '🔵 В работе': 'В работе',
          '📞 Позвонил': 'Позвонили',
          '🟢 Купил':    'Купили',
          '🔴 Отказ':    'Отказ',
        };
        Object.entries(map).forEach(([k, label]) => {
          if (today.statuses[k]) text += `  ${label}: ${today.statuses[k]}\n`;
        });
      }
    }

    text += `\nВсе статусы:\n`;
    Object.entries(s.statuses || {}).forEach(([k, v]) => { text += `${k}: ${v}\n`; });

    text += `\nВердикты:\n`;
    Object.entries(s.verdicts || {}).forEach(([k, v]) => { text += `${k}: ${v}\n`; });

    text += `\n📈 Конверсия: ${conversion}%`;

    bot.sendMessage(CHAT_ID, text, { reply_markup: MAIN_MENU });
  } catch (e) {
    bot.sendMessage(CHAT_ID, 'Ошибка при загрузке статистики.', { reply_markup: MAIN_MENU });
  }
}

async function sendSources() {
  try {
    const s = await fetch(`${GAS_URL}?action=sources`).then(r => r.json());

    if (!s.total) {
      bot.sendMessage(CHAT_ID, 'Данных по источникам нет.', { reply_markup: MAIN_MENU });
      return;
    }

    let text = `📈 Источники трафика\n\n`;
    text += `Всего заявок: ${s.total}\n`;

    if (s.today_total) text += `Сегодня: ${s.today_total}\n`;

    text += `\n`;
    Object.entries(s.sources || {})
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => { text += `${k} — ${v}\n`; });

    if (Object.keys(s.campaigns || {}).length) {
      text += `\nКампании (Google Ads):\n`;
      Object.entries(s.campaigns)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([k, v]) => { text += `  ${k} — ${v}\n`; });
    }

    bot.sendMessage(CHAT_ID, text, { reply_markup: MAIN_MENU });
  } catch (e) {
    bot.sendMessage(CHAT_ID, 'Ошибка при загрузке источников.', { reply_markup: MAIN_MENU });
  }
}

async function startSearch(msg) {
  searchPending.add(msg.chat.id);
  bot.sendMessage(CHAT_ID, '🔍 Введите телефон, имя или номер заявки (#000001):', { reply_markup: MAIN_MENU });
}

async function handleSearch(query) {
  try {
    const q = encodeURIComponent(query.trim());
    const results = await fetch(`${GAS_URL}?action=search&q=${q}`).then(r => r.json());

    if (!results.length) {
      bot.sendMessage(CHAT_ID, `По запросу «${query}» ничего не найдено.`, { reply_markup: MAIN_MENU });
      return;
    }

    for (const l of results) {
      const card = buildCard(l, l.leadId || l.row);
      const kb   = buildKeyboard(l, l.row);
      bot.sendMessage(CHAT_ID, card, { reply_markup: kb });
    }
  } catch (e) {
    bot.sendMessage(CHAT_ID, 'Ошибка поиска.', { reply_markup: MAIN_MENU });
  }
}

function sendSettingsMenu() {
  bot.sendMessage(CHAT_ID, '⚙️ Настройки', { reply_markup: SETTINGS_MENU });
}

function sendMainMenu() {
  bot.sendMessage(CHAT_ID, 'Главное меню:', { reply_markup: MAIN_MENU });
}

function sendVersion() {
  bot.sendMessage(CHAT_ID, `ℹ️ Auto24 Bot v${BOT_VER}`, { reply_markup: SETTINGS_MENU });
}

function sendInfo() {
  const text = [
    '📋 Auto24 Group — CRM-бот',
    '',
    'Бот принимает заявки с сайта, сохраняет в Google Sheets и позволяет управлять статусами прямо из Telegram.',
    '',
    `Версия: ${BOT_VER}`,
    'Сервер: Render',
    'База данных: Google Sheets',
  ].join('\n');
  bot.sendMessage(CHAT_ID, text, { reply_markup: SETTINGS_MENU });
}

function sendTestNotification() {
  bot.sendMessage(CHAT_ID,
    `🧪 Тестовое уведомление\n\nБот работает корректно.\n${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kyiv' })}`,
    { reply_markup: SETTINGS_MENU }
  );
}

// ── INLINE КНОПКИ ────────────────────────────────────────────────────────
const STATUS_MAP = {
  work:   '🔵 В работе',
  called: '📞 Позвонил',
  done:   '⚫ Закрыт',
  reject: '🔴 Отказ',
};
const VERDICT_MAP = {
  bought:   '🟢 Купил',
  thinking: '🤔 Думает',
  callback: '📅 Перезвонить',
  order:    '🔧 Под заказ',
  credit:   '🏦 Отказ банка',
};

bot.on('callback_query', async cb => {
  const parts = cb.data.split('_');
  const type  = parts[0];

  if (type === 'noop') { bot.answerCallbackQuery(cb.id).catch(() => {}); return; }

  if (type !== 's' && type !== 'v') return;

  const row   = parseInt(parts[1]);
  const key   = parts.slice(2).join('_');
  const label = type === 's' ? STATUS_MAP[key] : VERDICT_MAP[key];
  if (!label) {
    bot.answerCallbackQuery(cb.id, { text: 'Неизвестное действие' }).catch(() => {});
    return;
  }

  // Сначала отвечаем Telegram — до любых async операций (60 сек лимит)
  bot.answerCallbackQuery(cb.id, { text: '⏳ Сохраняю...' }).catch(() => {});

  try {
    // Сохранить в Google Sheets
    const gasRes = await fetch(
      `${GAS_URL}?action=update&row=${row}&col=${type === 's' ? 10 : 11}&value=${encodeURIComponent(label)}`
    ).then(r => r.json()).catch(() => null);

    // Обновить текст карточки (поддерживаем оба формата: "Статус: X" и "Статус:\nX")
    let newText = cb.message.text || '';
    if (type === 's') {
      newText = newText
        .replace(/Статус: [^\n]+/,        `Статус: ${label}`)   // формат GAS (одна строка)
        .replace(/^(Статус:)\n[^\n]+/m,   `$1\n${label}`);      // формат bot (две строки)
    }
    if (type === 'v') {
      newText = newText
        .replace(/Вердикт: [^\n]+/,       `Вердикт: ${label}`)  // формат GAS
        .replace(/^(Вердикт:)\n[^\n]+/m,  `$1\n${label}`);      // формат bot
    }

    await bot.editMessageText(newText, {
      chat_id:      cb.message.chat.id,
      message_id:   cb.message.message_id,
      reply_markup: cb.message.reply_markup,
    }).catch(() => {});


  } catch (e) {
    bot.sendMessage(CHAT_ID, `❌ Ошибка сохранения: ${e.message}`).catch(() => {});
  }
});

// ── НАПОМИНАНИЕ О ЗАЯВКАХ БЕЗ СТАТУСА (каждый час) ────────────────────
async function checkStaleLeads() {
  try {
    const data = await fetch(`${GAS_URL}?action=stale`).then(r => r.json());
    if (!data.length) return;
    data.forEach(l => {
      const phone = formatPhone(l.phone);
      bot.sendMessage(
        CHAT_ID,
        `⚠️ Заявка без статуса более 24 часов!\n\n👤 ${l.name || '—'}\n📞 ${phone}\n🕐 ${l.date || ''}`
      );
    });
  } catch (e) {}
}

setInterval(checkStaleLeads, 60 * 60 * 1000);

module.exports = { buildCard, buildKeyboard };

app.listen(PORT, () => console.log(`Auto24 Bot v${BOT_VER} running on port ${PORT}`));
