# codex-tg-bot

Простой Telegram-бот на TypeScript для serverless-развертывания (например, Vercel).

## Возможности

- Отвечает на **текстовые сообщения** через OpenAI API.
- Поддерживает **изображения** (и подписи к ним) через vision-модель OpenAI.
- Ограничивает доступ по **списку разрешённых Telegram user_id** в коде.

## Структура

- `api/telegram.ts` — serverless webhook-обработчик Telegram update.
- `vercel.json` — конфигурация serverless функции.
- `.env.example` — пример env-переменных.

## Быстрый старт

1. Установи зависимости:

```bash
npm install
```

2. Скопируй `.env.example` в `.env` и задай значения:

- `TELEGRAM_BOT_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (опционально, по умолчанию `gpt-4.1-mini`)

3. В `api/telegram.ts` обнови список разрешённых пользователей:

```ts
const ALLOWED_USER_IDS = new Set<number>([
  123456789,
  987654321,
]);
```

4. Задеплой проект на Vercel.

5. Установи webhook в Telegram:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<your-domain>/api/telegram"}'
```

## Как это работает

- Telegram шлёт update на `/api/telegram`.
- Бот проверяет `message.from.id` в `ALLOWED_USER_IDS`.
- Если в сообщении есть фото, бот берёт лучшее по размеру, получает `file_path` через `getFile`, формирует прямой URL и отправляет в OpenAI Responses API вместе с текстом/подписью.
- Для чисто текстовых сообщений бот отправляет текст в OpenAI и возвращает ответ.

## Проверка типов

```bash
npm run build
```
