import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";

const CATEGORIES = ["Programming", "Misc", "Dark", "Pun", "Spooky", "Christmas"] as const;

type Joke =
  | { error: false; type: "single"; joke: string }
  | { error: false; type: "twopart"; setup: string; delivery: string }
  | { error: true; message: string };

export const jokes: Command = {
  data: new SlashCommandBuilder()
    .setName("jokes")
    .setDescription("Post a random joke from JokeAPI")
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("What kind of joke (default: any)")
        .addChoices(CATEGORIES.map((category) => ({ name: category, value: category }))),
    ),
  async execute(interaction) {
    const category = interaction.options.getString("category") ?? "Any";
    const response = await fetch(`https://v2.jokeapi.dev/joke/${category}`, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    const joke = (await response?.json().catch(() => null)) as Joke | null;

    if (!joke || joke.error) {
      await interaction.reply({
        content: "Couldn't fetch a joke right now. Try again in a bit.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Hide the punchline behind a spoiler so people can guess first.
    const content = joke.type === "single" ? joke.joke : `${joke.setup}\n||${joke.delivery}||`;
    await interaction.reply({ content, allowedMentions: { parse: [] } });
  },
};
