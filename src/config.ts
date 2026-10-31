import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/** Reads a comma-separated list, e.g. "123, 456". */
function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * One server's channels. /repost picks from `receiptsChannelId`, and a daily
 * receipt from there is posted into `generalChannelId` at 00:00 UTC.
 */
export interface ServerChannels {
  name: string;
  receiptsChannelId: string;
  generalChannelId?: string;
}

function server(name: string, receiptsVar: string, generalVar?: string): ServerChannels[] {
  const receiptsChannelId = process.env[receiptsVar];
  if (!receiptsChannelId) return [];
  return [{ name, receiptsChannelId, generalChannelId: (generalVar && process.env[generalVar]) || undefined }];
}

export const config = {
  token: required("DISCORD_TOKEN"),
  clientId: required("CLIENT_ID"),
  guildIds: list("GUILD_ID"),
  // Only anon gets the daily receipt; pass HANGOUT_GENERAL / GFORCE_GENERAL back
  // in below to turn it on for those servers too.
  servers: [
    ...server("anon", "DISCORD_RECEIPTS_ID", "ANON_GENERAL"),
    ...server("hangout", "FUNNIES_ID"),
    ...server("gforce", "RECEIPTS_OF_SHAME_ID"),
  ],
  // Every server's general channel gets a random joke daily at midnight local time (TZ).
  dailyJokeChannelIds: ["ANON_GENERAL", "HANGOUT_GENERAL", "GFORCE_GENERAL"]
    .map((name) => process.env[name])
    .filter((id): id is string => !!id),
  dataDir: process.env.DATA_DIR || "data",
  // Members who can use emojis from any server the bot is in.
  emojiRelayUserIds: list("EMOJI_RELAY_USER_IDS"),
};
