import OpenAI from "openai";
import type { IncomingMessage, ServerResponse } from "node:http";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}

const ALLOWED_USER_IDS = [123456789, 987654321] as const;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

type TelegramUser = {
  id: number;
};

type TelegramChat = {
  id: number;
};

type TelegramPhotoSize = {
  file_id: string;
  width: number;
  height: number;
};

type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

async function readJsonBody(req: IncomingMessage): Promise<TelegramUpdate> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw) as TelegramUpdate;
}

async function telegramApi<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Telegram API error (${method}): ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { ok: boolean; result: T };
  if (!data.ok) {
    throw new Error(`Telegram API returned ok=false for ${method}`);
  }

  return data.result;
}

async function telegramGetFile(fileId: string): Promise<ArrayBuffer> {
  const fileMeta = await telegramApi<{ file_path: string }>("getFile", { file_id: fileId });
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileMeta.file_path}`;
  const response = await fetch(fileUrl);

  if (!response.ok) {
    throw new Error(`Unable to download Telegram file: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

async function sendText(chatId: number, text: string): Promise<void> {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text
  });
}

async function sendGeneratedImage(chatId: number, prompt: string): Promise<void> {
  const result = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024"
  });

  const b64 = result.data[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI image generation returned no b64_json");
  }

  const buffer = Buffer.from(b64, "base64");
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", new Blob([buffer], { type: "image/png" }), "generated.png");

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    throw new Error(`Telegram sendPhoto failed: ${response.status} ${response.statusText}`);
  }
}

async function answerTextQuestion(chatId: number, question: string): Promise<void> {
  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: question
  });

  await sendText(chatId, response.output_text || "Не удалось получить ответ от модели.");
}

async function analyzeImage(chatId: number, imageData: ArrayBuffer, prompt: string): Promise<void> {
  const dataUrl = `data:image/jpeg;base64,${Buffer.from(imageData).toString("base64")}`;

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl }
        ]
      }
    ]
  });

  await sendText(chatId, response.output_text || "Не удалось проанализировать изображение.");
}

function isAllowedUser(userId: number | undefined): boolean {
  return userId !== undefined && ALLOWED_USER_IDS.includes(userId as (typeof ALLOWED_USER_IDS)[number]);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method === "GET") {
      res.statusCode = 200;
      res.end("ok");
      return;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }

    const update = await readJsonBody(req);
    const message = update.message;

    if (!message) {
      res.statusCode = 200;
      res.end("ignored");
      return;
    }

    const userId = message.from?.id;
    if (!isAllowedUser(userId)) {
      await sendText(message.chat.id, "Доступ запрещён.");
      res.statusCode = 200;
      res.end("forbidden user");
      return;
    }

    if (message.photo?.length) {
      const largest = [...message.photo].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
      const bytes = await telegramGetFile(largest.file_id);
      const prompt = message.caption?.trim() || "Опиши, что изображено на картинке.";
      await analyzeImage(message.chat.id, bytes, prompt);
      res.statusCode = 200;
      res.end("ok");
      return;
    }

    const text = message.text?.trim();
    if (!text) {
      await sendText(message.chat.id, "Отправьте текст или изображение.");
      res.statusCode = 200;
      res.end("ok");
      return;
    }

    if (text.startsWith("/image") || text.startsWith("/img")) {
      const prompt = text.replace(/^\/(image|img)\s*/i, "").trim();
      if (!prompt) {
        await sendText(message.chat.id, "Использование: /image <описание>");
      } else {
        await sendGeneratedImage(message.chat.id, prompt);
      }
      res.statusCode = 200;
      res.end("ok");
      return;
    }

    await answerTextQuestion(message.chat.id, text);
    res.statusCode = 200;
    res.end("ok");
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
}
