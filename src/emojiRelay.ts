import {
  Events,
  type Client,
  type GuildBasedChannel,
  type GuildEmoji,
  type Message,
  type Webhook,
  type WebhookType,
} from "discord.js";
import { config } from "./config.js";

// Lets chosen members use emojis from any server the bot is in. Without
// Nitro, Discord sends an unavailable emoji as plain ":name:" text. When such
// a message matches emojis the bot knows, it's reposted through a webhook
// under the member's name and avatar with the real emojis, and the original
// is deleted.

const WEBHOOK_NAME = "Emoji relay";

/** Proper emojis are left alone; bare ":name:" text is swapped for a matching emoji. */
const EMOJI_PATTERN = /<a?:\w{2,32}:\d+>|:(\w{2,32}):/g;

const webhooks = new Map<string, Promise<Webhook<WebhookType.Incoming>>>();

export function setupEmojiRelay(client: Client<true>): void {
  if (config.emojiRelayUserIds.length === 0) return;
  client.on(Events.MessageCreate, (message) => {
    relay(message).catch((error) => console.error("Emoji relay failed:", error));
  });
  console.log(`Emoji relay on for ${config.emojiRelayUserIds.length} member(s).`);
}

async function relay(message: Message): Promise<void> {
  if (!message.inGuild() || message.author.bot || message.system) return;
  if (!config.emojiRelayUserIds.includes(message.author.id)) return;

  const content = replaceEmojis(message);
  if (content === message.content) return;

  // Webhooks belong to the channel; a thread's messages go through its parent.
  const channel = message.channel.isThread() ? message.channel.parent : message.channel;
  if (!channel || !("createWebhook" in channel)) return;
  const webhook = await webhookFor(channel);

  // A webhook can't reply, so link to the replied-to message instead.
  const replyTo = message.reference?.messageId
    ? `-# ↪ Replying to https://discord.com/channels/${message.guildId}/${message.channelId}/${message.reference.messageId}\n`
    : "";
  await webhook.send({
    content: replyTo + content,
    username: `${message.member?.displayName ?? message.author.displayName}'s Nitro`,
    avatarURL: (message.member ?? message.author).displayAvatarURL(),
    files: [...message.attachments.values()].map((attachment) => attachment.url),
    threadId: message.channel.isThread() ? message.channelId : undefined,
    // The original already notified anyone it mentioned; don't ping them twice.
    allowedMentions: { parse: [] },
  });
  await message.delete();
}

function replaceEmojis(message: Message<true>): string {
  return message.content.replace(EMOJI_PATTERN, (match, name?: string) => {
    if (!name) return match;
    const emoji = findEmoji(message, name);
    return emoji ? emoji.toString() : match;
  });
}

/** Prefers the current server's emoji when several servers have one with that name. */
function findEmoji(message: Message<true>, name: string): GuildEmoji | undefined {
  const matches = message.client.emojis.cache.filter((emoji) => emoji.name === name && emoji.available);
  return matches.find((emoji) => emoji.guild.id === message.guildId) ?? matches.first();
}

/** The channel types that can own webhooks (threads can't). */
type WebhookChannel = Extract<GuildBasedChannel, { createWebhook: unknown }>;

function webhookFor(channel: WebhookChannel): Promise<Webhook<WebhookType.Incoming>> {
  let webhook = webhooks.get(channel.id);
  if (!webhook) {
    webhook = (async () => {
      const existing = (await channel.fetchWebhooks()).find(
        (hook) => hook.owner?.id === channel.client.user.id && hook.name === WEBHOOK_NAME,
      );
      return (existing ?? (await channel.createWebhook({ name: WEBHOOK_NAME }))) as Webhook<WebhookType.Incoming>;
    })();
    // Forget failures so the next message tries again.
    webhook.catch(() => webhooks.delete(channel.id));
    webhooks.set(channel.id, webhook);
  }
  return webhook;
}
