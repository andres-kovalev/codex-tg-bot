import OpenAI from "openai";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

// Список Telegram user_id, которым разрешено пользоваться ботом.
const ALLOWED_USER_IDS = new Set<number>([
  123456789,
  987654321,
]);

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
  file_size?: number;
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

type TelegramFileResponse = {
  ok: boolean;
  result?: {
    file_path: string;
  };
};

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
}

async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`,
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as TelegramFileResponse;
  if (!data.ok || !data.result?.file_path) {
    return null;
  }

  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
}

function extractBestPhoto(photos: TelegramPhotoSize[]): TelegramPhotoSize {
  return [...photos].sort((a, b) => {
    const aSize = a.file_size ?? a.width * a.height;
    const bSize = b.file_size ?? b.width * b.height;
    return bSize - aSize;
  })[0];
}

async function answerWithOpenAI(message: TelegramMessage): Promise<string> {
  const text = message.text ?? message.caption ?? "";

  if (message.photo && message.photo.length > 0) {
    const bestPhoto = extractBestPhoto(message.photo);
    const photoUrl = await getTelegramFileUrl(bestPhoto.file_id);

    if (!photoUrl) {
      return "Не удалось получить изображение из Telegram.";
    }

    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: text || "Опиши изображение" },
            { type: "input_image", image_url: photoUrl },
          ],
        },
      ],
    });

    return response.output_text || "Не удалось сформировать ответ.";
  }

  if (!text.trim()) {
    return "Пришли текст или изображение с подписью/вопросом.";
  }

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    input: text,
  });

  return response.output_text || "Не удалось сформировать ответ.";
}

export default async function handler(req: any, res: any): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !OPENAI_API_KEY) {
    res.status(500).json({ error: "Missing TELEGRAM_BOT_TOKEN or OPENAI_API_KEY" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const update = req.body as TelegramUpdate;
    const message = update.message;

    if (!message?.from) {
      res.status(200).json({ ok: true });
      return;
    }

    const userId = message.from.id;

    if (!ALLOWED_USER_IDS.has(userId)) {
      await sendTelegramMessage(message.chat.id, "У вас нет доступа к этому боту.");
      res.status(200).json({ ok: true });
      return;
    }

    const answer = await answerWithOpenAI(message);
    await sendTelegramMessage(message.chat.id, answer);

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram handler error", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
