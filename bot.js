const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fetch = require('node-fetch');

const TOKEN    = process.env.TG_TOKEN;
const CHAT_ID  = process.env.TG_CHAT_ID;
const GAS_URL  = process.env.GAS_URL;
const HOOK_URL = process.env.WEBHOOK_URL;
const PORT     = process.env.PORT || 3000;

const bot = new TelegramBot(TOKEN);
const app = express();
app.use(express.json());

bot.setWebHook(`${HOOK_URL}/bot${TOKEN}`);
app.post(`/bot${TOKEN}`, (req, res) => { bot.processUpdate(req.body); res.sendStatus(200); });
app.get('/', (req, res) => res.send('Auto24 Bot running'));

// ── КОМАНДЫ ────────────────────────────────────────────────────────────
bot.onText(/^\/start/, msg => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  bot.sendMessage(CHAT_ID, 'Бот Auto24 активен.\n\n/zayavki — последние 10\n/stat — статистика');
});

bot.onText(/^\/zayavki|^\/заявки/, async msg => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  try {
    const data = await fetch(`${GAS_URL}?action=leads&n=10`).then(r => r.json());
    if (!data.length) { bot.sendMessage(CHAT_ID, 'Заявок пока нет.'); return; }
    let text = '📋 Последние заявки:\n\n';
    data.forEach((l, i) => {
      text += `${i+1}. ${l.name||'—'} · ${l.phone||'—'}\n`;
      text += `   Статус: ${l.status} · Вердикт: ${l.verdict}\n`;
      text += `   ${l.date}\n\n`;
    });
    bot.sendMessage(CHAT_ID, text);
  } catch(e) { bot.sendMessage(CHAT_ID, 'Ошибка.'); }
});

bot.onText(/^\/stat|^\/стат/, async msg => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  try {
    const s = await fetch(`${GAS_URL}?action=stats`).then(r => r.json());
    let text = `📊 Статистика Auto24\n\nВсего: ${s.total}\n\nСтатусы:\n`;
    Object.entries(s.statuses||{}).forEach(([k,v]) => { text += `${k}: ${v}\n`; });
    text += '\nВердикты:\n';
    Object.entries(s.verdicts||{}).forEach(([k,v]) => { text += `${k}: ${v}\n`; });
    bot.sendMessage(CHAT_ID, text);
  } catch(e) { bot.sendMessage(CHAT_ID, 'Ошибка.'); }
});

// ── КНОПКИ ─────────────────────────────────────────────────────────────
const STATUS_MAP  = {
  work:   '🔄 В работе',
  called: '📞 Позвонил',
  done:   '✔️ Закрыт',
  reject: '❌ Отказ'
};
const VERDICT_MAP = {
  bought:   '🟢 Купил',
  thinking: '🤔 Думает',
  callback: '📲 Перезвонить',
  order:    '🔧 Под заказ',
  credit:   '🏦 Отказ в кредите',
  minus:    '👎 Минус'
};

bot.on('callback_query', async cb => {
  const parts = cb.data.split('_');
  const type  = parts[0];
  if (type === 'noop') { bot.answerCallbackQuery(cb.id); return; }
  if (type !== 's' && type !== 'v') return;

  const row   = parseInt(parts[1]);
  const key   = parts[2];
  const label = type === 's' ? STATUS_MAP[key] : VERDICT_MAP[key];
  if (!label) return;

  try {
    await fetch(`${GAS_URL}?action=update&row=${row}&col=${type==='s'?10:11}&value=${encodeURIComponent(label)}`);

    let newText = cb.message.text;
    if (type === 's') newText = newText.replace(/📊 Статус: .+/, '📊 Статус: ' + label);
    if (type === 'v') newText = newText.replace(/🏁 Вердикт: .+/, '🏁 Вердикт: ' + label);

    await bot.editMessageText(newText, {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      reply_markup: cb.message.reply_markup
    });
    bot.answerCallbackQuery(cb.id, {text: 'Сохранено!'});
  } catch(e) {
    bot.answerCallbackQuery(cb.id, {text: 'Ошибка'});
  }
});

app.listen(PORT, () => console.log(`Running on port ${PORT}`));
