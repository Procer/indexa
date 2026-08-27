/**
 * Aviso best-effort por Telegram para los scripts de sync (no para el sitio).
 * Si TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID no están configurados, no hace nada —
 * así el sync nunca se rompe por esto, y activarlo es solo cargar el .env.
 */
export async function notifyTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
  } catch (err) {
    console.warn("No se pudo avisar por Telegram:", (err as Error).message ?? err);
  }
}
