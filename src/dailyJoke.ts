import type { Client, GuildTextBasedChannel } from "discord.js";
import { setTimeout as delay } from "node:timers/promises";
import { fetchJoke } from "./commands/jokes.js";
import { config } from "./config.js";

const DAILY_CAPTION = "🃏 **Joke of the day**";
// JokeAPI is occasionally down; keep trying for a while rather than skip the day.
const FETCH_TRIES = 10;
const FETCH_RETRY_MS = 60_000;

/**
 * Posts a random joke (never Dark) into every server's general channel every
 * day at midnight local time. Local time follows the TZ environment
 * variable, e.g. TZ=Europe/Dublin.
 */
export async function setupDailyJoke(client: Client<true>): Promise<void> {
  const channels: GuildTextBasedChannel[] = [];
  for (const id of config.dailyJokeChannelIds) {
    const channel = await client.channels.fetch(id).catch(() => null);
    if (channel?.isTextBased() && !channel.isDMBased()) channels.push(channel);
    else console.warn(`Daily joke disabled for channel ${id}: can't see it. Is the bot in that server?`);
  }
  if (channels.length === 0) return;

  scheduleDailyJoke(channels);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log(`Posting a daily joke into ${channels.map((c) => `#${c.name}`).join(", ")} at 00:00 ${zone}.`);
}

function scheduleDailyJoke(channels: GuildTextBasedChannel[]): void {
  // Measured from a second ahead, so a timer that fires a hair early can't
  // schedule a second post for the same day. Local dates handle DST changes.
  const from = new Date(Date.now() + 1_000);
  const next = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  setTimeout(() => {
    scheduleDailyJoke(channels);
    void postDailyJoke(channels);
  }, next.getTime() - Date.now());
}

async function postDailyJoke(channels: GuildTextBasedChannel[]): Promise<void> {
  let joke: string | null = null;
  for (let tries = 1; !joke && tries <= FETCH_TRIES; tries++) {
    joke = await fetchJoke();
    if (!joke && tries < FETCH_TRIES) await delay(FETCH_RETRY_MS);
  }
  if (!joke) {
    console.error(`No daily joke today: JokeAPI failed ${FETCH_TRIES} times.`);
    return;
  }

  await Promise.all(
    channels.map((channel) =>
      channel
        .send({ content: `${DAILY_CAPTION}\n${joke}`, allowedMentions: { parse: [] } })
        .catch((error) => console.error(`Daily joke for #${channel.name} failed:`, error)),
    ),
  );
}
