import {
  ActionRowBuilder,
  ApplicationCommandType,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContextMenuCommandBuilder,
  InteractionContextType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type Client,
  type Message,
  type RepliableInteraction,
} from "discord.js";
import { config } from "../config.js";
import { renderReceipt } from "../receiptImage.js";
import type { MessageCommand } from "./types.js";

/** Most messages "Receipt multiple" will add after the one it's used on. */
const MAX_EXTRA_MESSAGES = 20;

/** This server's receipts channel, if one is configured. Never another server's. */
async function receiptsChannelFor(client: Client, guildId: string) {
  for (const server of config.servers) {
    const channel = await client.channels.fetch(server.receiptsChannelId).catch(() => null);
    if (channel?.isSendable() && !channel.isDMBased() && channel.guildId === guildId) return channel;
  }
  return null;
}

/**
 * Renders `messages` (oldest first) into the server's receipts channel, then
 * swaps the interaction's private deferred reply for a public "Receipted!".
 */
async function postReceipt(interaction: RepliableInteraction, messages: Message[]): Promise<void> {
  const receipts = await receiptsChannelFor(interaction.client, interaction.guildId!);
  if (!receipts) {
    await interaction.editReply("This server doesn't have a receipts channel set up.");
    return;
  }
  const missing = receipts
    .permissionsFor(interaction.client.user)
    ?.missing([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]);
  if (missing?.length) {
    await interaction.editReply(`I'm missing permissions in ${receipts}: ${missing.join(", ")}.`);
    return;
  }

  const first = messages[0]!;
  const image = await renderReceipt(messages);
  const authors = [...new Set(messages.map((message) => message.author.toString()))].join(", ");
  const sent = await receipts.send({
    content: `🧾 ${authors} in <#${first.channelId}>, receipted by ${interaction.user}`,
    files: [new AttachmentBuilder(image, { name: "receipt.png" })],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Original message").setURL(first.url),
      ),
    ],
    // Name people without pinging them.
    allowedMentions: { parse: [] },
  });

  await interaction.deleteReply();
  await interaction.followUp(`Receipted! ${sent.url}`);
}

export const receiptThis: MessageCommand = {
  data: new ContextMenuCommandBuilder()
    .setName("Receipt this")
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    // Defer privately so that if anything fails, only the user sees the error.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await postReceipt(interaction, [interaction.targetMessage]);
  },
};

export const receiptMultiple: MessageCommand = {
  data: new ContextMenuCommandBuilder()
    .setName("Receipt multiple")
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    // Context menu commands can't take options, so ask for the count in a popup.
    const modalId = `receipt-multiple:${interaction.id}`;
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(modalId)
        .setTitle("Receipt multiple")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("count")
              .setLabel(`How many messages after this one? (1-${MAX_EXTRA_MESSAGES})`)
              .setPlaceholder("5")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(2)
              .setRequired(true),
          ),
        ),
    );
    const submit = await interaction
      .awaitModalSubmit({ time: 5 * 60_000, filter: (i) => i.customId === modalId })
      .catch(() => null);
    // Closed without submitting.
    if (!submit) return;

    // Errors from here on belong to the popup's interaction, not the original one.
    await submit.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const count = Number(submit.fields.getTextInputValue("count").trim());
      if (!Number.isInteger(count) || count < 1 || count > MAX_EXTRA_MESSAGES) {
        await submit.editReply(`Enter a whole number from 1 to ${MAX_EXTRA_MESSAGES}.`);
        return;
      }
      const first = interaction.targetMessage;
      const after = await first.channel.messages.fetch({ after: first.id, limit: count });
      const rest = [...after.values()]
        .filter((message) => !message.system)
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      await postReceipt(submit, [first, ...rest]);
    } catch (error) {
      console.error("Error running Receipt multiple:", error);
      await submit.editReply("Something went wrong making that receipt.").catch(() => {});
    }
  },
};
