// Inline-клавиатура карточки заявки

function cleanPhone(phone) {
  return (phone || '').replace(/[^\d]/g, '');
}

function extractCity(country) {
  if (!country) return '';
  const parts = country.split(',');
  return parts.length > 1 ? parts[parts.length - 1].trim() : parts[0].trim();
}

function buildKeyboard(data, row) {
  const digits = cleanPhone(data.phone);
  const city   = extractCity(data.country);

  const keyboard = [
    [
      { text: '🔵 В работу',     callback_data: `s_${row}_work`   },
      { text: '📞 Позвонил',     callback_data: `s_${row}_called` },
    ],
    [
      { text: '🟢 Купил',        callback_data: `v_${row}_bought`   },
      { text: '🤔 Думает',       callback_data: `v_${row}_thinking` },
    ],
    [
      { text: '📅 Перезвонить',  callback_data: `v_${row}_callback` },
      { text: '🔧 Под заказ',    callback_data: `v_${row}_order`    },
    ],
    [
      { text: '🏦 Отказ банка',  callback_data: `v_${row}_credit`   },
      { text: '🔴 Отказ',        callback_data: `s_${row}_reject`   },
    ],
    [
      { text: '⚫ Закрыт',       callback_data: `s_${row}_done` },
    ],
    [
      { text: '──────────────────', callback_data: 'noop' },
    ],
  ];

  // Кнопки связи
  if (digits) {
    keyboard.push([
      { text: '💬 WhatsApp', url: `https://wa.me/${digits}` },
      { text: '✈️ Telegram', url: `tg://resolve?phone=${digits}` },
    ]);
  }

  // Карта + копировать номер
  const utilRow = [];
  if (city) {
    utilRow.push({ text: '🗺 Карта', url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(city)}` });
  }
  utilRow.push({ text: '📋 Копировать номер', callback_data: `copy_${row}` });
  keyboard.push(utilRow);

  return { inline_keyboard: keyboard };
}

module.exports = { buildKeyboard };
