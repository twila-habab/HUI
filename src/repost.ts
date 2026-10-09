import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  DiscordAPIError,
  Events,
  RESTJSONErrorCodes,
  type Client,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "./config.js";
import { isNewer, MessageStore } from "./messageStore.js";

// Bots can upload up to 10 MB per file in unboosted servers.
const MAX_UPLOAD_BYTES = 10_000_000;
const SAVE_INTERVAL_MS = 30_000;

/**
 * One server's repost setup: random messages are picked from `source`. /repost
 * posts them wherever it's used; `general`, if set, also gets a daily one.
 */
interface Feed {
  name: string;
  source: GuildTextBasedChannel;
  general?: GuildTextBasedChannel;
  // Only IDs are kept; the full message is fetched when picked, so edits and
  // deletions are always reflected.
  store: MessageStore;
  /** Live messages only advance newestId once catch-up has finished; otherwise
   * a save during catch-up could record a gap as already scanned. */
  caughtUp: boolean;
  ready: boolean;
}

/** Keyed by source channel ID. */
const feeds = new Map<string, Feed>();

function postableImages(message: Message) {
  return message.attachments.filter((a) => a.contentType?.startsWith("image/") && a.size <= MAX_UPLOAD_BYTES);
}

/** Reposts are just the screenshot, so only messages with an image count. */
function isRepostable(message: Message): boolean {
  return (
    // The bot's own posts there are receipts, which should be repostable.
    (!message.author.bot || message.author.id === message.client.user.id) &&
    !message.system &&
    postableImages(message).size > 0
  );
}

function feedFor(guildId: string): Feed | undefined {
  for (const feed of feeds.values()) if (feed.source.guildId === guildId) return feed;
  return undefined;
}

export function repostStatus(guildId: string): "disabled" | "indexing" | "ready" {
  const feed = feedFor(guildId);
  if (!feed) return "disabled";
  return feed.ready ? "ready" : "indexing";
}

async function fetchGuildTextChannel(client: Client<true>, id: string): Promise<GuildTextBasedChannel | null> {
  const channel = await client.channels.fetch(id).catch(() => null);
  return channel?.isTextBased() && !channel.isDMBased() ? channel : null;
}

export async function setupRepost(client: Client<true>): Promise<void> {
  for (const server of config.servers) {
    const source = await fetchGuildTextChannel(client, server.receiptsChannelId);
    // Skip rather than fail, so one broken server doesn't stop the others.
    if (!source) {
      console.warn(`Reposting disabled for ${server.name}: can't see channel ${server.receiptsChannelId}. Is the bot in that server?`);
      continue;
    }
    const general = server.generalChannelId
      ? ((await fetchGuildTextChannel(client, server.generalChannelId)) ?? undefined)
      : undefined;
    const store = await MessageStore.open(source.id, config.dataDir);
    feeds.set(source.id, { name: server.name, source, general, store, caughtUp: false, ready: false });
    console.log(`${server.name}: reposting from #${source.name} (${source.guild.name}).`);
  }
  if (feeds.size === 0) return;

  client.on(Events.MessageCreate, (message) => {
    const feed = feeds.get(message.channelId);
    if (!feed) return;
    if (isRepostable(message)) feed.store.add(message.id);
    if (feed.caughtUp) feed.store.markNewest(message.id);
  });
  client.on(Events.MessageDelete, (message) => feeds.get(message.channelId)?.store.delete(message.id));
  client.on(Events.MessageBulkDelete, (deleted, channel) => {
    const feed = feeds.get(channel.id);
    if (feed) for (const id of deleted.keys()) feed.store.delete(id);
  });

  const saveAll = () =>
    Promise.all(
      [...feeds.values()].map((feed) =>
        feed.store.save().catch((error) => console.error(`Saving ${feed.name}'s message index failed:`, error)),
      ),
    );
  setInterval(saveAll, SAVE_INTERVAL_MS);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void saveAll().finally(() => process.exit(0)));
  }

  if ([...feeds.values()].some((feed) => feed.general)) {
    scheduleDailyReceipts();
    console.log("Posting a daily receipt into the general channels at 23:10 UTC.");
  }

  // One at a time, so the servers don't compete for the same rate limit.
  for (const feed of feeds.values()) {
    try {
      console.log(`Loaded ${feed.store.size} saved message(s) for #${feed.source.name}.`);
      await catchUp(feed.source, feed.store);
      feed.caughtUp = true;
      await backfill(feed.source, feed.store);
      await feed.store.save();
      feed.ready = true;
      console.log(`#${feed.source.name} is indexed: ${feed.store.size} repostable message(s).`);
    } catch (error) {
      console.error(`Indexing #${feed.source.name} failed:`, error);
    }
  }
}

/** Fetches messages posted since the last saved run, oldest first. */
async function catchUp(channel: GuildTextBasedChannel, messages: MessageStore): Promise<void> {
  if (!messages.newestId) return;
  let after = messages.newestId;
  let scanned = 0;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, after, cache: false });
    for (const message of batch.values()) {
      if (isRepostable(message)) messages.add(message.id);
      if (isNewer(message.id, after)) after = message.id;
    }
    messages.markNewest(after);
    scanned += batch.size;
    if (batch.size < 100) break;
  }
  if (scanned > 0) console.log(`Caught up on ${scanned} new message(s) in #${channel.name}.`);
}

/** Walks backwards through history until it reaches the start of the channel. Resumable. */
async function backfill(channel: GuildTextBasedChannel, messages: MessageStore): Promise<void> {
  if (messages.complete) return;
  console.log(
    messages.oldestId
      ? `Resuming history scan of #${channel.name}...`
      : `Scanning history of #${channel.name} (first run, this can take a while)...`,
  );
  let scanned = 0;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before: messages.oldestId, cache: false });
    for (const message of batch.values()) {
      if (isRepostable(message)) messages.add(message.id);
      messages.markOldest(message.id);
      messages.markNewest(message.id);
    }
    scanned += batch.size;
    if (scanned % 5000 < batch.size) {
      console.log(`  scanned ${scanned} messages this run, ${messages.size} repostable so far...`);
    }
    if (batch.size < 100) break;
  }
  messages.markComplete();
}

async function pickMessage(channel: GuildTextBasedChannel, messages: MessageStore): Promise<Message | null> {
  for (let id = messages.random(); id; id = messages.random()) {
    try {
      const message = await channel.messages.fetch(id);
      if (isRepostable(message)) return message;
    } catch (error) {
      if (!(error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMessage)) {
        throw error;
      }
    }
    messages.delete(id);
  }
  return null;
}

function buildRepost(message: Message) {
  return {
    files: postableImages(message).map((a) => new AttachmentBuilder(a.url, { name: a.name })),
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("View original").setURL(message.url),
      ),
    ],
  };
}

/**
 * Throws away this server's saved message list and rescans the receipts
 * channel. Returns how many repostable messages it found, or a reason it
 * couldn't run.
 */
export async function reindex(guildId: string): Promise<number | "disabled" | "busy"> {
  const feed = feedFor(guildId);
  if (!feed) return "disabled";
  if (!feed.ready) return "busy";

  feed.ready = false;
  feed.store.reset();
  try {
    // Messages posted during the rescan are still added live, since caughtUp
    // stays true; the rescan walks back from the newest message it sees.
    await backfill(feed.source, feed.store);
    await feed.store.save();
    console.log(`Reindexed #${feed.source.name}: ${feed.store.size} repostable message(s).`);
    return feed.store.size;
  } finally {
    // Even after a failure, a partial list is better than /repost being stuck.
    feed.ready = true;
  }
}

export type Repost = ReturnType<typeof buildRepost>;

/** A random message from this server's receipts channel, ready to post. */
export async function randomRepost(guildId: string): Promise<Repost | null> {
  const feed = feedFor(guildId);
  if (!feed?.ready) return null;
  const message = await pickMessage(feed.source, feed.store);
  return message && buildRepost(message);
}

const DAILY_CAPTION = "🧾 **Today's daily receipt**";
const DAILY_HOUR_UTC = 23;
const DAILY_MINUTE_UTC = 10;

/** Posts a random receipt into each server's general channel every day at 23:10 UTC. */
function scheduleDailyReceipts(): void {
  // Measured from a second ahead, so a timer that fires a hair early can't
  // schedule a second post for the same day.
  const from = new Date(Date.now() + 1_000);
  let next = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), DAILY_HOUR_UTC, DAILY_MINUTE_UTC);
  // Today's post time has already passed, so use tomorrow's.
  if (next <= from.getTime()) {
    next = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1, DAILY_HOUR_UTC, DAILY_MINUTE_UTC);
  }
  setTimeout(() => {
    scheduleDailyReceipts();
    void postDailyReceipts();
  }, next - Date.now());
}

async function postDailyReceipts(): Promise<void> {
  await Promise.all(
    [...feeds.values()].map(async (feed) => {
      if (!feed.general) return;
      try {
        // Right after a restart (or during /reindex) the channel may still be
        // being read; wait up to 30 minutes for it rather than skipping the day.
        for (let tries = 0; !feed.ready && tries < 60; tries++) await delay(30_000);
        const repost = await randomRepost(feed.source.guildId);
        if (repost) await feed.general.send({ ...repost, content: DAILY_CAPTION });
        else console.warn(`No daily receipt for ${feed.name}: nothing to pick from #${feed.source.name}.`);
      } catch (error) {
        console.error(`Daily receipt for #${feed.general.name} (${feed.name}) failed:`, error);
      }
    }),
  );
}