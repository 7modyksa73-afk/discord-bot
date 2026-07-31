import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  WebhookClient,
  type Message,
  type ChatInputCommandInteraction,
  type TextChannel,
  type ButtonInteraction,
} from "discord.js";
import { commands } from "./commands.js";
import { loadConfig, getConfig, saveConfig } from "./config.js";
import { logger } from "../lib/logger.js";

// ─── rating state ─────────────────────────────────────────────────────────────

interface PendingRating {
  reviewMessage: Message;
  botMessage: Message;
  timeout: ReturnType<typeof setTimeout>;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
}

const pendingRatings = new Map<string, PendingRating>();

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

function buildStarRow(reviewMsgId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rating_1_${reviewMsgId}`)
      .setLabel("⭐")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rating_2_${reviewMsgId}`)
      .setLabel("⭐⭐")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rating_3_${reviewMsgId}`)
      .setLabel("⭐⭐⭐")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rating_4_${reviewMsgId}`)
      .setLabel("⭐⭐⭐⭐")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rating_5_${reviewMsgId}`)
      .setLabel("⭐⭐⭐⭐⭐")
      .setStyle(ButtonStyle.Secondary)
  );
}

function starsLabel(n: number): string {
  return "⭐".repeat(n);
}

async function safeDelete(msg: Message): Promise<void> {
  try {
    await msg.delete();
  } catch {
    /* already deleted or no permission */
  }
}

// ─── bot bootstrap ────────────────────────────────────────────────────────────

export function startBot(): void {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.error("DISCORD_BOT_TOKEN is not set — Discord bot will not start");
    return;
  }

  loadConfig();

  const rest = new REST().setToken(token);

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
    try {
      await rest.put(Routes.applicationCommands(readyClient.user.id), {
        body: commands,
      });
      logger.info("Slash commands registered globally");
    } catch (err) {
      logger.error({ err }, "Failed to register slash commands");
    }
  });

  // ── messageCreate ─────────────────────────────────────────────────────────
  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;

    const config = getConfig();
    const content = message.content.trim();
    const isDM = message.channel.type === 1;

    // ── Broadcast channel ────────────────────────────────────────────────────
    if (
      !isDM &&
      config.broadcastChannelId &&
      message.channelId === config.broadcastChannelId
    ) {
      try {
        if (message.guild) {
          const members = await message.guild.members.fetch();
          let sent = 0;
          let failed = 0;
          for (const [, member] of members) {
            if (member.user.bot) continue;
            try {
              if (content) await member.send(content);
              for (const [, att] of message.attachments) {
                await member.send(att.url);
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

    // ── Auto-image channel ───────────────────────────────────────────────────
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

    // ── Review channel ───────────────────────────────────────────────────────
    if (
      !isDM &&
      config.reviewChannelId &&
      message.channelId === config.reviewChannelId
    ) {
      try {
        const row = buildStarRow(message.id);
        const botMsg = await message.channel.send({
          content: `**التقييم** — <@${message.author.id}>، اختر عدد النجوم:`,
          components: [row],
        });

        const timeout = setTimeout(async () => {
          pendingRatings.delete(message.id);
          await safeDelete(message);
          await safeDelete(botMsg);
        }, 10_000);

        pendingRatings.set(message.id, {
          reviewMessage: message,
          botMessage: botMsg,
          timeout,
          authorId: message.author.id,
          authorName: message.member?.displayName ?? message.author.username,
          authorAvatar:
            message.author.displayAvatarURL({ size: 128 }),
          content,
        });
      } catch (err) {
        logger.error({ err }, "Error handling review channel message");
      }
    }

    // ── -خط text trigger ─────────────────────────────────────────────────────
    if (content === "-خط" || content.startsWith("-خط ")) {
      const cfg = getConfig();
      if (cfg.khatImageUrl) {
        try {
          await message.channel.send({ files: [cfg.khatImageUrl] });
        } catch (err) {
          logger.error({ err }, "Error sending khat image");
        }
      }
    }
  });

  // ── interactionCreate ─────────────────────────────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    // ── Button: star rating ─────────────────────────────────────────────────
    if (interaction.isButton()) {
      const btn = interaction as ButtonInteraction;
      const customId = btn.customId; // e.g. "rating_3_1234567890"

      if (customId.startsWith("rating_")) {
        const parts = customId.split("_");
        const stars = parseInt(parts[1] ?? "0", 10);
        const reviewMsgId = parts.slice(2).join("_");
        const pending = pendingRatings.get(reviewMsgId);

        if (!pending) {
          // Expired — silently ack
          await btn.deferUpdate().catch(() => undefined);
          return;
        }

        // Only the original author can rate
        if (btn.user.id !== pending.authorId) {
          await btn.reply({
            content: "❌ فقط صاحب الرسالة يقدر يختار التقييم.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        clearTimeout(pending.timeout);
        pendingRatings.delete(reviewMsgId);

        await btn.deferUpdate().catch(() => undefined);

        // Delete both original messages
        await safeDelete(pending.reviewMessage);
        await safeDelete(pending.botMessage);

        // Build embed
        const embed = new EmbedBuilder()
          .setDescription(pending.content)
          .setColor(0xf5c518)
          .addFields({
            name: "التقييم",
            value: `${starsLabel(stars)} **(${stars}/5)**`,
          })
          .setTimestamp();

        // Send via webhook to impersonate the reviewer
        const config = getConfig();
        if (config.reviewWebhookUrl) {
          try {
            const wh = new WebhookClient({ url: config.reviewWebhookUrl });
            await wh.send({
              username: pending.authorName,
              avatarURL: pending.authorAvatar,
              embeds: [embed],
            });
            return;
          } catch (err) {
            logger.error({ err }, "Webhook send failed, falling back to normal send");
          }
        }

        // Fallback: normal embed with author info
        embed.setAuthor({
          name: pending.authorName,
          iconURL: pending.authorAvatar,
        });
        await (btn.channel as TextChannel).send({ embeds: [embed] });
        return;
      }
    }

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
        `• روم التقييم: ${cfg.reviewChannelId ? `<#${cfg.reviewChannelId}>` : "❌ غير محدد"}`,
      ];
      await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
      return;
    }

    // /setbroadcast
    if (commandName === "setbroadcast") {
      saveConfig({
        broadcastChannelId: interaction.channelId,
        broadcastGuildId: interaction.guildId ?? undefined,
      });
      await interaction.reply({
        content: `✅ تم تحديد <#${interaction.channelId}> كـ **روم البث**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // /removebroadcast
    if (commandName === "removebroadcast") {
      saveConfig({ broadcastChannelId: undefined, broadcastGuildId: undefined });
      await interaction.reply({ content: "✅ تم إلغاء روم البث.", flags: MessageFlags.Ephemeral });
      return;
    }

    // /setimage
    if (commandName === "setimage") {
      const url = getImageFromInteraction(interaction);
      if (!url) {
        await interaction.reply({
          content: "❌ الرجاء إرفاق صورة أو كتابة رابط في خانة `url`.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      saveConfig({ khatImageUrl: url });
      await interaction.reply({ content: "✅ تم تحديد صورة `/khat` و `-خط`.", flags: MessageFlags.Ephemeral });
      return;
    }

    // /khat
    if (commandName === "khat") {
      const cfg = getConfig();
      if (!cfg.khatImageUrl) {
        await interaction.reply({
          content: "⚠️ لم يتم تحديد صورة. استخدم `/setimage` أولاً.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.reply({ content: "✅", flags: MessageFlags.Ephemeral });
      await (interaction.channel as TextChannel).send({ files: [cfg.khatImageUrl] });
      return;
    }

    // /setautoimagechannel
    if (commandName === "setautoimagechannel") {
      saveConfig({
        autoImageChannelId: interaction.channelId,
        autoImageGuildId: interaction.guildId ?? undefined,
      });
      await interaction.reply({
        content: `✅ تم تحديد <#${interaction.channelId}> كـ **روم الصورة التلقائية**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // /removeautoimagechannel
    if (commandName === "removeautoimagechannel") {
      saveConfig({ autoImageChannelId: undefined, autoImageGuildId: undefined });
      await interaction.reply({ content: "✅ تم إلغاء روم الصورة التلقائية.", flags: MessageFlags.Ephemeral });
      return;
    }

    // /setautoimage
    if (commandName === "setautoimage") {
      const url = getImageFromInteraction(interaction);
      if (!url) {
        await interaction.reply({
          content: "❌ الرجاء إرفاق صورة أو كتابة رابط في خانة `url`.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      saveConfig({ autoImageUrl: url });
      await interaction.reply({ content: "✅ تم تحديد صورة الروم التلقائية.", flags: MessageFlags.Ephemeral });
      return;
    }

    // /say
    if (commandName === "say") {
      const text = interaction.options.getString("text") ?? undefined;
      const imageUrl = getImageFromInteraction(interaction);
      if (!text && !imageUrl) {
        await interaction.reply({
          content: "❌ الرجاء كتابة نص أو إرفاق صورة أو كليهما.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.reply({ content: "✅", flags: MessageFlags.Ephemeral });
      await (interaction.channel as TextChannel).send({
        ...(text ? { content: text } : {}),
        ...(imageUrl ? { files: [imageUrl] } : {}),
      });
      return;
    }

    // /sayimage
    if (commandName === "sayimage") {
      const url = getImageFromInteraction(interaction);
      if (!url) {
        await interaction.reply({
          content: "❌ الرجاء إرفاق صورة أو كتابة رابط في خانة `url`.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.reply({ content: "✅", flags: MessageFlags.Ephemeral });
      await (interaction.channel as TextChannel).send({ files: [url] });
      return;
    }

    // /setreviewchannel
    if (commandName === "setreviewchannel") {
      const channel = interaction.channel as TextChannel;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        // Create a webhook for impersonation
        const webhook = await channel.createWebhook({
          name: "Review Bot",
          reason: "تقييمات البوت",
        });
        saveConfig({
          reviewChannelId: interaction.channelId,
          reviewGuildId: interaction.guildId ?? undefined,
          reviewWebhookUrl: webhook.url,
        });
        await interaction.editReply(
          `✅ تم تحديد <#${interaction.channelId}> كـ **روم التقييم**.\nأي رسالة تُكتب فيه ستظهر أزرار النجوم (⭐ إلى ⭐⭐⭐⭐⭐).`
        );
      } catch (err) {
        logger.error({ err }, "Failed to create webhook");
        await interaction.editReply(
          "❌ فشل إنشاء الـ webhook. تأكد أن البوت يملك صلاحية **Manage Webhooks** في هذا الروم."
        );
      }
      return;
    }

    // /removereviewchannel
    if (commandName === "removereviewchannel") {
      saveConfig({
        reviewChannelId: undefined,
        reviewGuildId: undefined,
        reviewWebhookUrl: undefined,
      });
      await interaction.reply({ content: "✅ تم إلغاء روم التقييم.", flags: MessageFlags.Ephemeral });
      return;
    }
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to login to Discord");
  });
}
