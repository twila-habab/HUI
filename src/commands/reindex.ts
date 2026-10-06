import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { reindex as rebuild } from "../repost.js";
import type { Command } from "./types.js";

export const reindex: Command = {
  data: new SlashCommandBuilder()
    .setName("reindex")
    .setDescription("Rebuild this server's /repost list from the receipts channel")
    // Hidden from everyone without Administrator (server admins can change this
    // under Integrations, so it's checked again below).
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    if (!interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Only admins can use /reindex.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await rebuild(interaction.guildId);
    await interaction.editReply(
      result === "disabled"
        ? "This server doesn't have a receipts channel set up."
        : result === "busy"
          ? "The receipts channel is already being read, try again when that's done."
          : `Done: found ${result} repostable message(s).`,
    );
  },
};
