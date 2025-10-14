// ================================
// 🚀 PROJECT BY XTRIMER
// ================================

const TelegramBot = require("node-telegram-bot-api");
const dotenv = require("dotenv");
const axios = require("axios");
const base64 = require("base-64");
const fs = require("fs");
const path = require("path");
const { buildPayload, headers, API_URL } = require("./api-cekpayment-orkut.js");

// ======== Konfigurasi =========
// Gunakan path absolut sesuai Termux
dotenv.config({ path: "/data/data/com.termux/files/home/botenv/.env" });

// Ambil variabel dari .env
const BOT_TOKEN = process.env.BOT_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_FILE_PATH = process.env.GITHUB_FILE_PATH;
const ADMIN_ID = parseInt(process.env.ADMIN_ID || "0");
const DATA_QRIS = process.env.DATA_QRIS || "";

// ======== Validasi Token =========
if (!BOT_TOKEN) {
  console.error("❌ ERROR: BOT_TOKEN tidak ditemukan di file .env");
  process.exit(1);
}

// ======== Variabel global ========
global.depositState = {};

// Lokasi file penyimpanan
const DEPOSIT_FILE = path.join(__dirname, "deposit_state.json");

// Load deposit state kalau ada file sebelumnya
if (fs.existsSync(DEPOSIT_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DEPOSIT_FILE, "utf-8"));
    global.depositState = data;
    console.log(`✅ Loaded ${Object.keys(global.depositState).length} pending deposit(s)`);
  } catch (err) {
    console.error("❌ Gagal load deposit_state.json:", err.message);
  }
}

// Fungsi simpan data ke file
function saveDepositState() {
  try {
    fs.writeFileSync(DEPOSIT_FILE, JSON.stringify(global.depositState, null, 2));
  } catch (err) {
    console.error("❌ Gagal simpan deposit_state.json:", err.message);
  }
}
const TEMP = {};

const GITHUB_API = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;
const HEADERS = { Authorization: `token ${GITHUB_TOKEN}` };

// ======== Inisialisasi Bot ========
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log(`🤖 Bot aktif! Admin ID: ${ADMIN_ID}`);

// ======== Helper GitHub ========
async function getFileContent() {
  try {
    const resp = await axios.get(GITHUB_API, { headers: HEADERS });
    return { content: base64.decode(resp.data.content), sha: resp.data.sha };
  } catch (err) {
    console.error("❌ Gagal ambil data GitHub:", err.message);
    return { content: null, sha: null };
  }
}

async function updateFile(content, sha, message) {
  try {
    const encoded = base64.encode(content);
    const data = { message, content: encoded, sha };
    const resp = await axios.put(GITHUB_API, data, { headers: HEADERS });
    return [200, 201].includes(resp.status);
  } catch (err) {
    console.error("❌ Gagal update GitHub:", err.message);
    return false;
  }
}
async function getPaymentQR(url, timeoutMs = 5000) {
  return Promise.race([
    axios.get(url),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
  ]);
}
function randomUsername(length = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let name = "XT";
  for (let i = 0; i < length; i++) name += chars[Math.floor(Math.random() * chars.length)];
  return name;
}

function generateRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ======== Menu Utama ========
bot.onText(/\/(start|menu)/, async (msg) => {
  const chatId = msg.chat.id;
  const keyboard = {
    inline_keyboard: [
      [{ text: "💻 Registrasi IP VPS", callback_data: "add" }],
      [{ text: "📋 List user", callback_data: "list" }],
      [{ text: "🗑️ Hapus user", callback_data: "delete" }],
    ],
  };

  await bot.sendMessage(
    chatId,
    `🌟 *Selamat datang di Autoscript Bot!*\n\n` +
    `🚀 Kami menyediakan layanan VPS dengan IP dedicated untuk kebutuhan kamu!\n\n` +
    `💰 *Harga IP VPS:*\n` +
    `- 1 IP : Rp10.000 / 1 bulan\n` +
    `- 1 IP : Rp18.000 / 2 bulan\n\n` +
    `⚡ Daftar sekarang dan nikmati kemudahan registrasi otomatis!\n\n` +
    `Silakan pilih menu di bawah untuk mulai:`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

// ======== Callback Handler ========
bot.on("callback_query", async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  // === Registrasi IP ===
  if (data === "add") {
    const username = randomUsername();
    TEMP[chatId] = { user: username };
    await bot.editMessageText(
      `📌 Username otomatis: *${username}*\nSilakan kirim IP VPS kamu:`,
      { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown" }
    );
    TEMP[chatId].step = "WAIT_IP";
  }

  // === List user (Admin Only) ===
  else if (data === "list") {
    if (userId !== ADMIN_ID)
      return bot.answerCallbackQuery(query.id, { text: "🚫 Tidak diizinkan" });

    const { content } = await getFileContent();
    if (!content) return bot.sendMessage(chatId, "❌ Gagal ambil data GitHub");

    const lines = content.split("\n").filter((l) => l.startsWith("###"));
    if (lines.length === 0) return bot.sendMessage(chatId, "📋 Tidak ada user terdaftar.");
    await bot.sendMessage(chatId, `📋 *Daftar user:*\n${lines.join("\n")}`, {
      parse_mode: "Markdown",
    });
  }

  // === Hapus user (Admin Only) ===
  else if (data === "delete") {
    if (userId !== ADMIN_ID)
      return bot.answerCallbackQuery(query.id, { text: "🚫 Tidak diizinkan" });

    const { content } = await getFileContent();
    if (!content) return bot.sendMessage(chatId, "❌ Gagal ambil data GitHub");

    const users = content
      .split("\n")
      .filter((l) => l.startsWith("###"))
      .map((l) => l.split(" ")[1]);

    if (users.length === 0)
      return bot.sendMessage(chatId, "📋 Tidak ada user untuk dihapus.");

    const keyboard = {
      inline_keyboard: users.map((u) => [{ text: u, callback_data: `delete_${u}` }]),
    };
    await bot.sendMessage(chatId, "📋 Pilih user untuk dihapus:", {
      reply_markup: keyboard,
    });
  }

  // === Pilih user yang akan dihapus ===
  else if (data.startsWith("delete_")) {
    if (userId !== ADMIN_ID)
      return bot.answerCallbackQuery(query.id, { text: "🚫 Tidak diizinkan" });
    const user = data.replace("delete_", "");
    TEMP[chatId] = { delete_user: user };
    const keyboard = {
      inline_keyboard: [
        [{ text: "✅ Ya, hapus", callback_data: "confirm_delete" }],
        [{ text: "❌ Batal", callback_data: "cancel_delete" }],
      ],
    };
    await bot.sendMessage(chatId, `⚠️ Yakin hapus user *${user}*?`, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }

  // === Konfirmasi hapus ===
  else if (data === "confirm_delete") {
    if (userId !== ADMIN_ID)
      return bot.answerCallbackQuery(query.id, { text: "🚫 Tidak diizinkan" });

    const user = TEMP[chatId]?.delete_user;
    if (!user) return;
    const { content, sha } = await getFileContent();
    if (!content) return bot.sendMessage(chatId, "❌ Gagal ambil data GitHub");

    const newLines = content
      .split("\n")
      .filter((l) => !l.startsWith(`### ${user} `));
    const ok = await updateFile(newLines.join("\n"), sha, `Delete ${user}`);

    if (ok)
      bot.sendMessage(chatId, `✅ User *${user}* berhasil dihapus`, {
        parse_mode: "Markdown",
      });
    else bot.sendMessage(chatId, "❌ Gagal update GitHub");
  }

  // === Batal hapus ===
  else if (data === "cancel_delete") {
    await bot.sendMessage(chatId, "↩️ Dibatalkan.");
  }

 // === Pilih durasi registrasi IP ===
else if (["30", "60"].includes(data)) {
  const days = parseInt(data);
  const info = TEMP[chatId];
  if (!info || !info.user || !info.ip)
    return bot.sendMessage(chatId, "⚠️ Data belum lengkap!");

  const basePrice = days === 30 ? 10000 : 18000;
  const rand = generateRandomNumber(1, 300);
  const total = basePrice + rand;
  const userId = query.from.id;
  const uniqueCode = `regip-${userId}-${Date.now()}`;

  global.depositState[chatId] = {
    userId,
    username: info.user,
    ip: info.ip,
    days,
    total,
    status: "WAIT_PAYMENT",
    uniqueCode,
    timestamp: Date.now(),
  };

  // 💬 Langsung kasih feedback cepat ke user
  await bot.sendMessage(chatId, "⏳ Sedang membuat QRIS kamu, tunggu sebentar ya...");

  // 🔧 Fungsi pembatas timeout API supaya gak nunggu lama
  async function getPaymentQR(url, timeoutMs = 7000) {
    return Promise.race([
      axios.get(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
    ]);
  }

  try {
    const bayar = await getPaymentQR(
      `https://api.serverpremium.web.id/orderkuota/createpayment?apikey=AriApiPaymetGetwayMod&amount=${total}&codeqr=${DATA_QRIS}`
    );

    const get = bayar.data;
    if (!get || get.status !== "success") throw new Error(JSON.stringify(get));

    const qrUrl = get.result.imageqris.url;

    const caption = `🧾 *Detail Pembayaran:*\n\n` +
      `👤 Username: *${info.user}*\n🌐 IP: *${info.ip}*\n📆 Durasi: *${days} hari*\n\n` +
      `💰 Nominal: *Rp${total.toLocaleString()}*\n\n` +
      `⚠️ *Penting:* Bayar sesuai nominal!\n\n` +
      `⏱️ Waktu: 5 menit\n🔄 Pembayaran dicek otomatis.`;

    // 🧾 Kirim QR ke user
    const sent = await bot.sendPhoto(chatId, qrUrl, { caption, parse_mode: "Markdown" });
    global.depositState[chatId].qrMessageId = sent.message_id;
    saveDepositState(); // simpan data ke file

    // Jalankan loop pengecekan pembayaran
    checkPaymentLoop(bot, chatId);
  } catch (err) {
    console.error("❌ Gagal generate QR:", err.message);
    if (err.message === "timeout") {
      await bot.sendMessage(
        chatId,
        "⚠️ Server pembayaran sedang lambat, coba lagi beberapa saat lagi ya."
      );
    } else {
      await bot.sendMessage(chatId, "❌ Gagal membuat QRIS. Coba lagi nanti.");
    }
  }
}
});

// ======== Input IP VPS ========
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const info = TEMP[chatId];
  if (info && info.step === "WAIT_IP") {
    TEMP[chatId].ip = text;
    TEMP[chatId].step = "WAIT_DAYS";
    const keyboard = {
      inline_keyboard: [
        [{ text: "30 hari - Rp10.000", callback_data: "30" }],
        [{ text: "60 hari - Rp18.000", callback_data: "60" }],
      ],
    };
    await bot.sendMessage(chatId, "📅 Pilih durasi registrasi:", {
      reply_markup: keyboard,
    });
  }
});

// ======== Cek Pembayaran ========
async function checkPaymentLoop(bot, chatId) {
  const info = global.depositState[chatId];
  if (!info || info.status !== "WAIT_PAYMENT") return;

  const data = buildPayload();
  try {
    const res = await axios.post(API_URL, data, { headers, timeout: 7000 });
    const response = res.data;

    const blocks = response.split('------------------------').filter(Boolean);
    for (const block of blocks) {
      const kreditMatch = block.match(/Kredit\s*:\s*([\d.]+)/);
      if (kreditMatch) {
        const kredit = Number(kreditMatch[1].replace(/\./g, ''));
        if (kredit === info.total) {
          info.status = "PAID";

          // ================================
          // 🗑️ Hapus QRIS otomatis
          // ================================
          if (info.qrMessageId) {
            try {
              await bot.deleteMessage(chatId, info.qrMessageId);
            } catch (err) {
              console.error("❌ Gagal hapus QRIS setelah pembayaran:", err.message);
            }
          }

          await bot.sendMessage(chatId, "✅ Pembayaran diterima! Mendaftarkan IP kamu...");

          const { content, sha } = await getFileContent();
          if (!content) return bot.sendMessage(chatId, "❌ Gagal ambil data GitHub");

          const expire = new Date(Date.now() + info.days * 86400000)
            .toISOString()
            .slice(0, 10);
          const newLine = `### ${info.username} ${expire} ${info.ip}`;
          const updated = content.trim() + "\n" + newLine;
          const ok = await updateFile(updated, sha, `Add ${info.username}`);

          if (ok) {
            await bot.sendMessage(
              chatId,
              `✅ *Registrasi Berhasil!*\n\n👤 *${info.username}*\n🌐 *${info.ip}*\n📆 Exp: *${expire}*`,
              { parse_mode: "Markdown" }
            );

            // ================================
            // 🌀 Xtrimer Tunneling Auto Installer Info
            // ================================
            const installText = `
🌀 *Xtrimer Tunneling Auto Installer*

Support OS: *Debian 10/11/12* & *Ubuntu 20/22/24*
Instalasi otomatis untuk VPS — setup cepat, aman, dan full dependensi.

*Perintah Install:*
\`\`\`bash
sysctl -w net.ipv6.conf.all.disable_ipv6=1 && \\
sysctl -w net.ipv6.conf.default.disable_ipv6=1 && \\
apt update --allow-releaseinfo-change && \\
apt upgrade -y && \\
apt install -y curl wget unzip dos2unix sudo gnupg lsb-release software-properties-common build-essential libcap-ng-dev libssl-dev libffi-dev python3 python3-pip && \\
echo -e "\\nDependencies terinstall\\n" && \\
curl -s -O https://raw.githubusercontent.com/joytun21/schaya/main/mahbub && \\
chmod +x mahbub && \\
./mahbub
\`\`\`
`;
            await bot.sendMessage(chatId, installText, { parse_mode: "Markdown" });
          } else {
            await bot.sendMessage(chatId, "❌ Gagal update GitHub");
          }

          delete global.depositState[chatId];
          saveDepositState(); // update file
          return;
        }
      }
    }

    // Belum ada pembayaran → ulangi cek
    setTimeout(() => checkPaymentLoop(bot, chatId), 20000);
  } catch (err) {
    console.error("❌ Error cek payment:", err.message);
    setTimeout(() => checkPaymentLoop(bot, chatId), 30000);
  }
}

// ======== Loop Auto Delete QRIS Expired (5 menit) ========
setInterval(async () => {
  const now = Date.now();

  for (const [chatId, deposit] of Object.entries(global.depositState)) {
    if (deposit.status === "WAIT_PAYMENT" && deposit.timestamp) {
      const depositAge = now - deposit.timestamp;
      if (depositAge > 5 * 60 * 1000) {
        try {
          if (deposit.qrMessageId) {
            await bot.deleteMessage(chatId, deposit.qrMessageId);
          }
          await bot.sendMessage(
            chatId,
            "❌ *Pembayaran Expired!*\n\nWaktu pembayaran telah habis. Silakan klik kembali menu untuk membuat QR baru.",
            { parse_mode: "Markdown" }
          );
          delete global.depositState[chatId];
saveDepositState(); // update file

          if (ADMIN_ID) {
            await bot.sendMessage(
              ADMIN_ID,
              `⚠️ *QRIS Expired* untuk user ID *${chatId}* (${deposit.username || "unknown"})`,
              { parse_mode: "Markdown" }
            );
          }
        } catch (error) {
          console.error("❌ Error hapus QRIS expired:", error.message);
        }
      }
    }
  }
}, 30000); // cek tiap 30 detik
