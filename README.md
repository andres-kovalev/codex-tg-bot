# codex-tg-bot

Simple Telegram bot on TypeScript for serverless deployments (Vercel).

## Features

- Answers text questions via OpenAI **Responses API**.
- Analyzes incoming Telegram images via OpenAI **Responses API** (with optional caption as prompt).
- Generates images via OpenAI Images API using `/image` or `/img` command.
- Restricts access to a hardcoded allowlist (`ALLOWED_USER_IDS` constant in code).

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set environment variables:

- `TELEGRAM_BOT_TOKEN`
- `OPENAI_API_KEY`

3. Update allowed Telegram user IDs in `api/webhook.ts`:

```ts
const ALLOWED_USER_IDS = [123456789, 987654321] as const;
```

4. Deploy to Vercel.

5. Set Telegram webhook to your deployment URL:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<your-domain>/api/webhook"}'
```

## Bot behavior

- Any text message: sends it to `gpt-4.1-mini` using Responses API.
- Any photo (with optional caption): sends it to `gpt-4.1-mini` for image analysis.
- `/image <prompt>` or `/img <prompt>`: generates and returns an image.

## Local checks

```bash
npm run check
```
