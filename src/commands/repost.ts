import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { randomRepost, repostStatus } from "../repost.js";
import type { Command } from "./types.js";

export const repost: Command = {
  data: new SlashCommandBuilder()
    .setName("repost")
    .setDescription("Repost a random receipt into this channel"),
  async execute(interaction) {
    const status = interaction.guildId ? repostStatus(interaction.guildId) : "disabled";
    if (status !== "ready") {
      await interaction.reply({
        content:
          status === "indexing"
            ? "Still reading the receipts channel, try again in a bit."
            : "This server doesn't have a receipts channel set up.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Defer publicly and edit the repost in, so Discord shows who used /repost.
    // (Deleting a private placeholder and following up instead leaves a
    // "Message could not be loaded" header on the repost.)
    await interaction.deferReply();
    let repost;
    try {
      repost = await randomRepost(interaction.guildId!);
    } catch (error) {
      // Don't leave a public "thinking..." behind; the error goes to the user privately.
      await interaction.deleteReply().catch(() => {});
      throw error;
    }
    if (!repost) {
      await interaction.deleteReply();
      await interaction.followUp({
        content: "There's nothing in the receipts channel to repost.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.editReply(repost);
  },
};
