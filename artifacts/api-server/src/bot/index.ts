import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  type Message,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { commands } from "./commands.js";
import { loadConfig, getConfig, saveConfig } from "./config.js";
import { logger } from "../lib/logger.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function getImageFromInteraction(
  interaction: ChatInputCommandInteraction
): string | undefined {
  const attachment = interaction.options.getAttachment("image");
  if (attachment && attachment.contentType?.startsWith("image/")) {
    return attachment.url;
  }
  const url = interaction.options.getString("url");
  if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
    return url;
  }
  return undefined;
}

async function dmAllMembers(
  interaction: ChatInputCommandInteraction,
  content: string
): Promise<{ sent: number; failed: number }> {
  if (!interaction.guild) return { sent: 0, failed: 0 };
  const members = await interaction.guild.members.fetch();
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
  return { sent, failed };
}

// ─── bot bootstrap ────────────────────────────────────────────────────────────

export function startBot(): void {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.error("DISCORD_BOT_TOKEN is not set — Discord bot will not start");
    return;
  }

  loadConfig();

  // Register slash commands globally
  const rest = new REST().setToken(token);
  rest
    .put(Routes.applicationCommands(process.env["DISCORD_CLIENT_ID"] ?? ""), {
      body: commands,
    })
    .catch(() => {
      // Client ID not set yet — will register after ready using client.user.id
    });

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

  // ── ready ──────────────────────────────────────────────────────────────────
  client.once("clientReady", async (readyClient) => {
    logger.info({ tag: readyClient.user.tag }, "Discord bot is online");

    // Register slash commands now that we have the application ID
    try {
      await rest.put(Routes.applicationCommands(readyClient.user.id), {
        body: commands,
      });
      logger.info("Slash commands registered globally");
    } catch (err) {
      logger.error({ err }, "Failed to register slash commands");
    }
  });

  // ── messageCreate — broadcast & auto-image & -خط text trigger ────────────
  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;

    const config = getConfig();
    const content = message.content.trim();
    const isDM = message.channel.type === 1;

    // Broadcast channel
    if (
      !isDM &&
      config.broadcastChannelId &&
      message.channelId === config.broadcastChannelId
    ) {
      try {
        const broadcastText =
          `📢 **رسالة من ${message.guild?.name ?? "السيرفر"}**\n` +
          `👤 ${message.member?.displayName ?? message.author.username}:\n\n` +
          content;

        if (message.guild) {
          const members = await message.guild.members.fetch();
          let sent = 0;
          let failed = 0;
          for (const [, member] of members) {
            if (member.user.bot) continue;
            try {
              await member.send(broadcastText);
              if (message.attachments.size > 0) {
                for (const [, att] of message.attachments) {
                  await member.send(att.url);
                }
              }
              sent++;
            } catch {
              failed++;
            }
          }
          await message.channel.send(
            `✅ تم الإرسال لـ **${sent}** عضو${failed > 0 ? ` (تعذّر الإرسال لـ ${failed})` : ""}`
          );
        }
      } catch (err) {
        logger.error({ err }, "Error broadcasting message");
      }
    }

    // Auto-image channel
    if (
      !isDM &&
      config.autoImageChannelId &&
      message.channelId === config.autoImageChannelId &&
      config.autoImageUrl
    ) {
      try {
        await message.channel.send({ files: [config.autoImageUrl] });
      } catch (err) {
        logger.error({ err }, "Error sending auto-image");
      }
    }

    // -خط text trigger (kept for convenience alongside /khat)
    if (content === "-خط" || content.startsWith("-خط ")) {
      if (config.khatImageUrl) {
        try {
          await message.channel.send({ files: [config.khatImageUrl] });
        } catch (err) {
          logger.error({ err }, "Error sending khat image");
        }
      }
    }
  });

  // ── interactionCreate — slash commands ────────────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // /botstatus
    if (commandName === "botstatus") {
      const cfg = getConfig();
      const lines = [
        "**⚙️ حالة البوت:**",
        `• روم البث: ${cfg.broadcastChannelId ? `<#${cfg.broadcastChannelId}>` : "❌ غير محدد"}`,
        `• صورة /khat أو -خط: ${cfg.khatImageUrl ? "✅ محددة" : "❌ غير محددة"}`,
        `• روم الصورة التلقائية: ${cfg.autoImageChannelId ? `<#${cfg.autoImageChannelId}>` : "❌ غير محدد"}`,
        `• صورة الروم التلقائي: ${cfg.autoImageUrl ? "✅ محددة" : "❌ غير محددة"}`,
      ];
      await interaction.reply({ content: lines.join("\n"), ephemeral: true });
      return;
    }

    // /setbroadcast
    if (commandName === "setbroadcast") {
      saveConfig({
        broadcastChannelId: interaction.channelId,
        broadcastGuildId: interaction.guildId ?? undefined,
      });
      await interaction.reply({
        content: `✅ تم تحديد <#${interaction.channelId}> كـ **روم البث**.\nأي رسالة تُكتب فيه ستُرسل لجميع الأعضاء عبر الخاص.`,
        ephemeral: true,
      });
      return;
    }

    // /removebroadcast
    if (commandName === "removebroadcast") {
      saveConfig({ broadcastChannelId: undefined, broadcastGuildId: undefined });
      await interaction.reply({ content: "✅ تم إلغاء روم البث.", ephemeral: true });
      return;
    }

    // /setimage
    if (commandName === "setimage") {
      const url = getImageFromInteraction(interaction);
      if (!url) {
        await interaction.reply({
          content: "❌ الرجاء إرفاق صورة أو كتابة رابط الصورة في خانة `url`.",
          ephemeral: true,
        });
        return;
      }
      saveConfig({ khatImageUrl: url });
      await interaction.reply({
        content: "✅ تم تحديد صورة `/khat` و `-خط`.",
        ephemeral: true,
      });
      return;
    }

    // /khat
    if (commandName === "khat") {
      const cfg = getConfig();
      if (!cfg.khatImageUrl) {
        await interaction.reply({
          content: "⚠️ لم يتم تحديد صورة بعد. استخدم `/setimage` أولاً.",
          ephemeral: true,
        });
        return;
      }
      // Reply ephemerally (only caller sees it) then send image publicly
      await interaction.reply({ content: "✅", ephemeral: true });
      await (interaction.channel as TextChannel).send({
        files: [cfg.khatImageUrl],
      });
      return;
    }

    // /setautoimagechannel
    if (commandName === "setautoimagechannel") {
      saveConfig({
        autoImageChannelId: interaction.channelId,
        autoImageGuildId: interaction.guildId ?? undefined,
      });
      await interaction.reply({
        content: `✅ تم تحديد <#${interaction.channelId}> كـ **روم الصورة التلقائية**.\nاستخدم \`/setautoimage\` لتحديد الصورة.`,
        ephemeral: true,
      });
      return;
    }

    // /removeautoimagechannel
    if (commandName === "removeautoimagechannel") {
      saveConfig({ autoImageChannelId: undefined, autoImageGuildId: undefined });
      await interaction.reply({
        content: "✅ تم إلغاء روم الصورة التلقائية.",
        ephemeral: true,
      });
      return;
    }

    // /setautoimage
    if (commandName === "setautoimage") {
      const url = getImageFromInteraction(interaction);
      if (!url) {
        await interaction.reply({
          content: "❌ الرجاء إرفاق صورة أو كتابة رابط الصورة في خانة `url`.",
          ephemeral: true,
        });
        return;
      }
      saveConfig({ autoImageUrl: url });
      await interaction.reply({
        content: "✅ تم تحديد صورة الروم التلقائية.",
        ephemeral: true,
      });
      return;
    }

    // /say  — bot speaks, only caller sees the confirmation
    if (commandName === "say") {
      const text = interaction.options.getString("text", true);
      // Ephemeral ack so only the caller sees anything from the interaction
      await interaction.reply({ content: "✅", ephemeral: true });
      await (interaction.channel as TextChannel).send(text);
      return;
    }

    // /sayimage — bot sends image, only caller sees the confirmation
    if (commandName === "sayimage") {
      const url = getImageFromInteraction(interaction);
      if (!url) {
        await interaction.reply({
          content: "❌ الرجاء إرفاق صورة أو كتابة رابط الصورة في خانة `url`.",
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({ content: "✅", ephemeral: true });
      await (interaction.channel as TextChannel).send({ files: [url] });
      return;
    }
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to login to Discord");
  });
}
