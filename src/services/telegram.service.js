const axios = require("axios");

/**
 * Gửi tin nhắn đến Telegram sử dụng Bot Token và Chat ID lấy từ .env
 * @param {string} text Nội dung tin nhắn (hỗ trợ định dạng HTML)
 * @returns {Promise<boolean>} Trả về true nếu gửi thành công
 */
async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[TelegramService] Bỏ qua gửi Telegram do thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID trong .env");
    console.log("[TelegramService Message]:\n", text);
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await axios.post(url, {
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
    });
    return response.data?.ok || false;
  } catch (error) {
    console.error("[TelegramService] Lỗi gửi tin nhắn Telegram:", error.message);
    if (error.response && error.response.data) {
      console.error("[TelegramService Error Details]:", error.response.data);
    }
    return false;
  }
}

module.exports = {
  sendTelegramMessage,
};
