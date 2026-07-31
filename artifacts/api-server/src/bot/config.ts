import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "..", "..", "bot-config.json");

export interface BotConfig {
  // Broadcast channel: any message → DM all members
  broadcastChannelId?: string;
  broadcastGuildId?: string;

  // -خط image trigger
  khatImageUrl?: string;

  // Auto-image channel: any message → sends configured image
  autoImageChannelId?: string;
  autoImageGuildId?: string;
  autoImageUrl?: string;

  // Review channel: any message → star rating buttons → embed via webhook
  reviewChannelId?: string;
  reviewGuildId?: string;
  reviewWebhookUrl?: string;
}

let config: BotConfig = {};

export function loadConfig(): BotConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      config = JSON.parse(raw) as BotConfig;
    }
  } catch {
    config = {};
  }
  return config;
}

export function getConfig(): BotConfig {
  return config;
}

export function saveConfig(updates: Partial<BotConfig>): void {
  config = { ...config, ...updates };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}
