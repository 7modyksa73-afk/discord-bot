import {
  Client,
  GatewayIntentBits,
  Partials,
  type Message,
  type TextChannel,
  type DMChannel,
  EmbedBuilder,
} from "discord.js";
import { loadConfig, getConfig, saveConfig } from "./config.js";
import { logger } from "../lib/logger.js";

const ADMIN_COMMANDS = [
  "!setbroadcast",
  "!removebroadcast",
  "!setimage",
  "!setautoimagechannel",
  "!removeautoimagechannel",
  "!setautoimage",
  "!say",
  "!sayimage",
  "!botstatus",
];

function isAdmin(message: Message): boolean {
  if (!message.member) return false;
  return (
    message.member.permissions.has("Administrator") ||
    message.member.permissions.has("ManageGuild") ||
    message.member.permissions.has("ManageChannels")
  );
}

function getImageUrl(message: Message, args: string[]): string | undefined {
  // Check attachments first
  const attachment = message.attachments.first();
  if (attachment && attachment.contentType?.startsWith("image/")) {
    return attachment.url;
  }
  // Then check args
  const url = args[0];
  if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
    return url;
  }
  return undefined;
}

async function dmAllMembers(
  message: Message,
  content: string
): Promise<void> {
  if (!message.guild) return;

  // Fetch all members
  const members = await message.guild.members.fetch();
  let sent = 0;
  let failed = 0;

  for (const [, member] of members) {
    if (member.user.bot) continue;
    try {
      await member.send(content);
      sent++;
    } catch {
      failed++;
    }
  }

  await message.channel.send(
    `✅ تم الإرسال لـ **${sent}** عضو${failed > 0 ? ` (فشل: ${failed})` : ""}`
  );
}

export function startBot(): void {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.error("DISCORD_BOT_TOKEN is not set — Discord bot will not start");
    return;
  }

  loadConfig();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.once("ready", () => {
    logger.info({ tag: client.user?.tag }, "Discord bot is online");
  });

  client.on("messageCreate", async (message: Message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    const config = getConfig();
    const content = message.content.trim();
    const isDM = message.channel.type === 1; // DMChannel

    // ─── BROADCAST CHANNEL ───────────────────────────────────────────────────
    // Any message in the broadcast channel → DM all members
    if (
      !isDM &&
      config.broadcastChannelId &&
      message.channelId === config.broadcastChannelId &&
      !ADMIN_COMMANDS.some((cmd) => content.startsWith(cmd))
    ) {
      try {
        const broadcastText =
          `📢 **رسالة من ${message.guild?.name ?? "السيرفر"}**\n` +
          `👤 ${message.author.displayName ?? message.author.username}:\n\n` +
          content;

        await dmAllMembers(message, broadcastText);

        // Also forward any images
        if (message.attachments.size > 0) {
          for (const [, att] of message.attachments) {
            await dmAllMembers(message, att.url);
          }
        }
      } catch (err) {
        logger.error({ err }, "Error broadcasting message");
      }
    }

    // ─── AUTO-IMAGE CHANNEL ───────────────────────────────────────────────────
    // Any message in the auto-image channel → send the configured image
    if (
      !isDM &&
      config.autoImageChannelId &&
      message.channelId === config.autoImageChannelId &&
      config.autoImageUrl &&
      !ADMIN_COMMANDS.some((cmd) => content.startsWith(cmd))
    ) {
      try {
        await message.channel.send({ files: [config.autoImageUrl] });
      } catch (err) {
        logger.error({ err }, "Error sending auto-image");
      }
    }

    // ─── -خط TRIGGER ─────────────────────────────────────────────────────────
    if (content === "-خط" || content.startsWith("-خط ")) {
      if (config.khatImageUrl) {
        try {
          await message.channel.send({ files: [config.khatImageUrl] });
        } catch (err) {
          logger.error({ err }, "Error sending khat image");
        }
      } else {
        await message.channel.send(
          "⚠️ لم يتم تحديد صورة بعد. استخدم `!setimage <رابط_الصورة>`"
        );
      }
      return;
    }

    // ─── ADMIN COMMANDS ───────────────────────────────────────────────────────
    if (!content.startsWith("!")) return;

    const parts = content.split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    // --- !botstatus
    if (cmd === "!botstatus") {
      const cfg = getConfig();
      const lines = [
        "**⚙️ حالة البوت:**",
        `• روم البث: ${cfg.broadcastChannelId ? `<#${cfg.broadcastChannelId}>` : "❌ غير محدد"}`,
        `• صورة -خط: ${cfg.khatImageUrl ? "✅ محددة" : "❌ غير محددة"}`,
        `• روم الصورة التلقائية: ${cfg.autoImageChannelId ? `<#${cfg.autoImageChannelId}>` : "❌ غير محدد"}`,
        `• صورة الروم التلقائي: ${cfg.autoImageUrl ? "✅ محددة" : "❌ غير محددة"}`,
      ];
      await message.channel.send(lines.join("\n"));
      return;
    }

    // All commands below require admin
    if (!isAdmin(message)) {
      await message.reply("❌ هذا الأمر للمشرفين فقط.");
      return;
    }

    // --- !setbroadcast
    if (cmd === "!setbroadcast") {
      saveConfig({
        broadcastChannelId: message.channelId,
        broadcastGuildId: message.guildId ?? undefined,
      });
      await message.reply(
        `✅ تم تحديد هذا الروم كـ **روم البث**.\nأي رسالة تُكتب هنا ستُرسل لجميع الأعضاء عبر الخاص.`
      );
      return;
    }

    // --- !removebroadcast
    if (cmd === "!removebroadcast") {
      saveConfig({ broadcastChannelId: undefined, broadcastGuildId: undefined });
      await message.reply("✅ تم إلغاء روم البث.");
      return;
    }

    // --- !setimage <url>
    if (cmd === "!setimage") {
      const url = getImageUrl(message, args);
      if (!url) {
        await message.reply(
          "❌ الرجاء إرفاق صورة أو كتابة رابط الصورة.\nمثال: `!setimage https://...`"
        );
        return;
      }
      saveConfig({ khatImageUrl: url });
      await message.reply(`✅ تم تحديد صورة \`-خط\`.\nسترسل هذه الصورة عند كتابة \`-خط\` في أي روم.`);
      return;
    }

    // --- !setautoimagechannel
    if (cmd === "!setautoimagechannel") {
      saveConfig({
        autoImageChannelId: message.channelId,
        autoImageGuildId: message.guildId ?? undefined,
      });
      await message.reply(
        `✅ تم تحديد هذا الروم كـ **روم الصورة التلقائية**.\nأي رسالة تُكتب هنا ستُرسل الصورة المحددة تلقائياً.\nاستخدم \`!setautoimage <رابط>\` لتحديد الصورة.`
      );
      return;
    }

    // --- !removeautoimagechannel
    if (cmd === "!removeautoimagechannel") {
      saveConfig({ autoImageChannelId: undefined, autoImageGuildId: undefined });
      await message.reply("✅ تم إلغاء روم الصورة التلقائية.");
      return;
    }

    // --- !setautoimage <url>
    if (cmd === "!setautoimage") {
      const url = getImageUrl(message, args);
      if (!url) {
        await message.reply(
          "❌ الرجاء إرفاق صورة أو كتابة رابط الصورة.\nمثال: `!setautoimage https://...`"
        );
        return;
      }
      saveConfig({ autoImageUrl: url });
      await message.reply(`✅ تم تحديد صورة الروم التلقائية.`);
      return;
    }

    // --- !say <text>  (bot speaks without command indicator)
    if (cmd === "!say") {
      const text = args.join(" ");
      if (!text) {
        await message.reply("❌ اكتب النص بعد الأمر.\nمثال: `!say مرحبا بالجميع`");
        return;
      }
      try {
        // Delete the original command message so it looks invisible
        await message.delete();
      } catch {
        /* no permission to delete — ignore */
      }
      await message.channel.send(text);
      return;
    }

    // --- !sayimage <url>  (bot sends image without command indicator)
    if (cmd === "!sayimage") {
      const url = getImageUrl(message, args);
      if (!url) {
        await message.reply(
          "❌ الرجاء إرفاق صورة أو كتابة رابط الصورة.\nمثال: `!sayimage https://...`"
        );
        return;
      }
      try {
        await message.delete();
      } catch {
        /* no permission to delete — ignore */
      }
      await message.channel.send({ files: [url] });
      return;
    }
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to login to Discord");
  });
}
