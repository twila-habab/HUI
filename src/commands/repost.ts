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

    // Defer privately so that if picking fails, only the user sees the error.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const repost = await randomRepost(interaction.guildId!);
    if (!repost) {
      await interaction.editReply("There's nothing in the receipts channel to repost.");
      return;
    }
    // Swap the private placeholder for the public repost in this channel.
    await interaction.deleteReply();
    await interaction.followUp(repost);
  },
};
