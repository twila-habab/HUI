import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function positiveNumber(name: string): number | undefined {
  const value = Number(process.env[name]);
  return value > 0 ? value : undefined;
}

/** Reads a comma-separated list, e.g. "123, 456". */
function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** One server's channels: random reposts go from `receiptsChannelId` into `generalChannelId`. */
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
  // /repost works in any channel. ANON_GENERAL and HANGOUT_GENERAL stay in
  // .env but aren't read; pass them back in here to also get scheduled reposts
  // (REPOST_INTERVAL_MINUTES) in those channels.
  servers: [...server("anon", "DISCORD_RECEIPTS_ID"), ...server("hangout", "FUNNIES_ID")],
  repostIntervalMinutes: positiveNumber("REPOST_INTERVAL_MINUTES"),
  dataDir: process.env.DATA_DIR || "data",
};
