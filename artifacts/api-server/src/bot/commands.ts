import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";

export const commands = [
  // ── إعداد روم البث ──────────────────────────────────
  new SlashCommandBuilder()
    .setName("setbroadcast")
    .setDescription("حدد الروم الحالي كروم بث — أي رسالة تُكتب فيه تُرسل لجميع الأعضاء")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("removebroadcast")
    .setDescription("ألغِ روم البث")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── صورة -خط ────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("setimage")
    .setDescription("حدد الصورة التي تُرسل عند كتابة -خط أو استخدام /khat")
    .addStringOption((opt) =>
      opt.setName("url").setDescription("رابط الصورة").setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt.setName("image").setDescription("ارفع الصورة مباشرة").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("khat")
    .setDescription("يُرسل الصورة المحددة بأمر /setimage"),

  // ── روم الصورة التلقائية ─────────────────────────────
  new SlashCommandBuilder()
    .setName("setautoimagechannel")
    .setDescription("حدد الروم الحالي كروم تلقائي — أي رسالة تُرسل الصورة تلقائياً")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("removeautoimagechannel")
    .setDescription("ألغِ روم الصورة التلقائية")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setautoimage")
    .setDescription("حدد الصورة التي تُرسل تلقائياً في الروم المحدد")
    .addStringOption((opt) =>
      opt.setName("url").setDescription("رابط الصورة").setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt.setName("image").setDescription("ارفع الصورة مباشرة").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── البوت يتكلم بدون أثر ────────────────────────────
  new SlashCommandBuilder()
    .setName("say")
    .setDescription("البوت يرسل نص أو صورة أو كليهما بدون ما يُعرف أنك أعطيته أمراً")
    .addStringOption((opt) =>
      opt.setName("text").setDescription("النص الذي سيرسله البوت").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("url").setDescription("رابط الصورة").setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt.setName("image").setDescription("ارفع الصورة مباشرة").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── روم التقييم ──────────────────────────────────────
  new SlashCommandBuilder()
    .setName("setreviewchannel")
    .setDescription("حدد الروم الحالي كروم تقييم — أي رسالة تُكتب فيه تظهر أزرار النجوم")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("removereviewchannel")
    .setDescription("ألغِ روم التقييم")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── الحالة ───────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("botstatus")
    .setDescription("عرض إعدادات البوت الحالية")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((cmd) => cmd.toJSON());
