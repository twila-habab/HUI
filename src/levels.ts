import { Events, type Client, type Message } from "discord.js";
import { pool } from "./db.js";

// Each message earns a random amount of XP, at most once a minute per person,
// so spamming doesn't level anyone up faster than chatting normally.
const XP_MIN = 15;
const XP_MAX = 25;
const COOLDOWN_MS = 60_000;

/** Last time each member earned XP, keyed by "guildId:userId". */
const lastAwarded = new Map<string, number>();

export interface Rank {
  userId: string;
  xp: number;
  level: number;
  /** XP earned since reaching the current level. */
  progress: number;
  /** XP needed to go from the current level to the next. */
  needed: number;
}

/** XP needed to go from `level` to `level + 1`. Each level takes a bit longer than the last. */
export function xpToNextLevel(level: number): number {
  return 5 * level ** 2 + 50 * level + 100;
}

export function rankFromXp(userId: string, xp: number): Rank {
  let level = 0;
  let progress = xp;
  while (progress >= xpToNextLevel(level)) {
    progress -= xpToNextLevel(level);
    level++;
  }
  return { userId, xp, level, progress, needed: xpToNextLevel(level) };
}

/** Creates the levels table if needed and starts awarding XP for messages. */
export async function setupLevels(client: Client<true>): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS levels (
      guild_id text NOT NULL,
      user_id text NOT NULL,
      xp integer NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `);
  client.on(Events.MessageCreate, (message) => {
    awardXp(message).catch((error) => console.error("Awarding XP failed:", error));
  });
  console.log("Levels: awarding XP for messages.");
}

async function awardXp(message: Message): Promise<void> {
  if (!message.inGuild() || message.author.bot || message.system) return;

  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  if (now - (lastAwarded.get(key) ?? 0) < COOLDOWN_MS) return;
  lastAwarded.set(key, now);

  const gained = XP_MIN + Math.floor(Math.random() * (XP_MAX - XP_MIN + 1));
  const { rows } = await pool.query<{ xp: number }>(
    `INSERT INTO levels (guild_id, user_id, xp) VALUES ($1, $2, $3)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET xp = levels.xp + EXCLUDED.xp
     RETURNING xp`,
    [message.guildId, message.author.id, gained],
  );
  const after = rankFromXp(message.author.id, rows[0].xp).level;
  const before = rankFromXp(message.author.id, rows[0].xp - gained).level;
  if (after > before) {
    await message.channel.send({
      content: `🎉 <@${message.author.id}> reached **level ${after}**!`,
      allowedMentions: { users: [message.author.id] },
    });
  }
}

/** A member's rank and their position on the server leaderboard (1 = top). */
export async function getRank(guildId: string, userId: string): Promise<{ rank: Rank; position: number }> {
  const { rows } = await pool.query<{ xp: number }>(
    "SELECT xp FROM levels WHERE guild_id = $1 AND user_id = $2",
    [guildId, userId],
  );
  const xp = rows[0]?.xp ?? 0;
  const ahead = await pool.query<{ count: string }>(
    "SELECT count(*) FROM levels WHERE guild_id = $1 AND xp > $2",
    [guildId, xp],
  );
  return { rank: rankFromXp(userId, xp), position: Number(ahead.rows[0].count) + 1 };
}

/** The server's top members by XP. */
export async function getLeaderboard(guildId: string, limit: number): Promise<Rank[]> {
  const { rows } = await pool.query<{ user_id: string; xp: number }>(
    "SELECT user_id, xp FROM levels WHERE guild_id = $1 ORDER BY xp DESC LIMIT $2",
    [guildId, limit],
  );
  return rows.map((row) => rankFromXp(row.user_id, row.xp));
}
