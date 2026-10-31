import { createHash } from "node:crypto";
import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
} from "discord.js";
import type { MessageCommand } from "./types.js";

const RATE_COLOR = 0xf5c518;
const SNIPPET_LENGTH = 200;

/** Index = score out of 10. Written to fit anything: food, outfits, takes, pets. */
const VERDICTS: string[][] = [
  ["Delete this. Delete it now. 🗑️", "I've seen better things in a Discord ToS update.", "My circuits are crying and not in a good way."],
  ["I'd rather read the Terms and Conditions.", "This is a crime and I'm calling the Discord police. 🚨"],
  ["Did a raccoon make this? Respectfully?", "Bold of you to share this in public."],
  ["It exists. That's the nicest thing I can say.", "I've had better experiences with a 404 page."],
  ["Mid. Aggressively mid. 😐", "This is beige in content form."],
  ["Perfectly average. Like a Tuesday. 🫤", "Not bad, not good. Just... there."],
  ["Okay okay, I see you. Kinda. 👀", "It's giving \"tried their best\" and I respect that."],
  ["Solid! I'd tell my friends about this. 👍", "This slaps a respectable amount."],
  ["Ooh, now THIS is something. 🔥", "Chef's kiss, but like, a quick one. 🤌"],
  ["Elite. Top tier. Frame it. 🖼️", "I'm gonna need you to post more of this immediately."],
  ["PERFECTION. I have nothing to add. I'm in tears. 😭✨", "10/10. Nobel Prize. Hall of Fame. Museum-worthy. 🏆"],
];

/** The same message always gets the same rating, so re-rolling doesn't help. */
function hash(...parts: string[]): number {
  return createHash("sha256").update(parts.join(":")).digest().readUInt32BE(0);
}

function stars(score: number): string {
  return "⭐".repeat(score) + "▫️".repeat(10 - score);
}

export const rateThis: MessageCommand = {
  data: new ContextMenuCommandBuilder()
    .setName("Rate this")
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const message = interaction.targetMessage;
    // An uploaded image, or a linked one (e.g. a Tenor GIF) that Discord previewed.
    const image =
      message.attachments.find((attachment) => attachment.contentType?.startsWith("image/"))?.url ??
      message.embeds.map((embed) => embed.image?.url ?? embed.thumbnail?.url).find(Boolean);
    const text = message.content.trim();
    if (!image && !text) {
      await interaction.reply({ content: "There's nothing here for me to rate. 🤨", flags: MessageFlags.Ephemeral });
      return;
    }

    const seed = hash("rate", message.id);
    const score = seed % 11;
    const lines = VERDICTS[score];
    const snippet = text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH)}…` : text;

    const embed = new EmbedBuilder()
      .setColor(RATE_COLOR)
      .setAuthor({ name: `${message.member?.displayName ?? message.author.displayName}'s post`, iconURL: message.author.displayAvatarURL() })
      .setTitle(`⚖️ Official Rating: ${score}/10`)
      .setURL(message.url)
      .setDescription(
        [
          ...(snippet ? [`> ${snippet.replaceAll("\n", "\n> ")}`, ""] : []),
          stars(score),
          `**${lines[hash("line", message.id) % lines.length]}**`,
        ].join("\n"),
      )
      .setFooter({ text: "Rated by the Bureau of Vibes · ratings are final" });
    if (image) embed.setThumbnail(image);
    await interaction.reply({ embeds: [embed] });
  },
};
