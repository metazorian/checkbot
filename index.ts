import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
console.log("🟢 Бот запущен и слушает сообщения");
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpaGNyemdlZGJ5bGdqc3Rkd3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4MzM0MjMsImV4cCI6MjA2NDQwOTQyM30.SyXqN_NKs-HW-neYSXMVmHtQ14a7QXLvCqd8Yn8mYuU";
const supabase = createClient(
  "https://rihcrzgedbylgjstdwrf.supabase.co",
  SUPABASE_KEY
);
import { Bot } from "https://deno.land/x/grammy@v1.16.2/mod.ts";
import Ably from "https://esm.sh/ably";

const bot = new Bot("7583331035:AAGNqiVo5kDqdUN0t9WJNrlmW9L8yfyCljc");

// ID твоей группы (форум)
const FORUM_CHAT_ID = -1002558761909;
// ID нужного топика (нужно узнать заранее)
const TARGET_TOPIC_ID = 3;

bot.on("message:video", async (ctx) => {
  const msg = ctx.message;
  if (
    msg.chat.id === FORUM_CHAT_ID &&
    msg.message_thread_id === TARGET_TOPIC_ID
  ) {
    const userId = msg.from?.id;
    console.log("📛 userId:", userId);
    const uploadedAt = new Date();
    const uploadedISO = uploadedAt.toISOString();

    console.log(`🎥 Видео от ${msg.from?.username} (${userId}) в ${uploadedISO}`);

    console.log("🔍 Поиск в Supabase по telegram_id =", userId);
    // Получаем данные пользователя
    const residentRes = await fetch(`https://rihcrzgedbylgjstdwrf.supabase.co/rest/v1/Residents?telegram_id=eq.${userId}`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      }
    });

    const residents = await residentRes.json();
    console.log("👥 Найдено:", residents);
    const resident = residents[0];
    if (residents.length > 0) {
      console.log("✅ Пользователь найден:", resident.username || resident.name || resident.telegram_id);
    }
    if (!resident) return console.log("❌ Пользователь не найден");

    const deadline = new Date(resident.day_started_at);
    deadline.setHours(deadline.getHours() + 2); // допустимый лимит — 2 часа

    const onTime = uploadedAt <= deadline;
    const status = onTime ? "on_time" : "late";

    const newMissionEntry = {
      day: resident.day,
      mission: "upload_video", // в будущем будет динамически задаваться
      status,
      timestamp: uploadedISO
    };

    const missionInsertRes = await fetch("https://rihcrzgedbylgjstdwrf.supabase.co/rest/v1/Missions", {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        telegram_id: userId,
        day: newMissionEntry.day,
        mission: newMissionEntry.mission,
        status: newMissionEntry.status,
        timestamp: newMissionEntry.timestamp,
        // created_at не нужен — Supabase ставит сам
      })
    });
    const missionInsertJson = await missionInsertRes.json().catch(() => "no json");
    console.log("📘 Новая миссия добавлена:", missionInsertRes.status, missionInsertJson);

    const updatePayload: any = {
      last_video_at: uploadedISO
    };

    if (onTime) {
      updatePayload.srost = (resident.srost || 0) + 1;
      updatePayload.streak = (resident.streak || 0) + 1;
    }

    console.log("📤 Отправка PATCH с payload:", updatePayload);

    console.log("🛠 Обновление записи для telegram_id =", userId);
    const patchRes = await fetch(`https://rihcrzgedbylgjstdwrf.supabase.co/rest/v1/Residents?telegram_id=eq.${userId}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(updatePayload)
    });
    const patchJson = await patchRes.json().catch(() => "no json");
    console.log("📬 Ответ Supabase:", patchRes.status, patchJson);

    console.log(`✅ ${status === "on_time" ? "Засчитано вовремя" : "Опоздание"} — обновления внесены`);

    const ably = new Ably.Realtime("-lCLiw.nUWtfg:YxyYa23PsliG29gIzfYPTN52ZyrfR_7GfHXg2SNuQHg");
    const ablyChannel = ably.channels.get(`user.${userId}`);

    await ablyChannel.publish("mission_completed", {
      mission_id: "upload_video",
      growth: updatePayload.srost || resident.srost || 0,
    });
    console.log("📡 Ably ивент отправлен ✅");
  }
});

bot.start();

console.log("🚀 Бот стартовал");
