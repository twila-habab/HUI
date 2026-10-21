import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";

const CATEGORIES = ["Programming", "Misc", "Dark", "Pun", "Spooky", "Christmas"] as const;
// JokeAPI's "Any" includes Dark, so list every category except Dark instead.
// Dark jokes only show up when someone picks that category explicitly.
const DEFAULT_CATEGORIES = CATEGORIES.filter((category) => category !== "Dark").join(",");

type Joke =
  | { error: false; type: "single"; joke: string }
  | { error: false; type: "twopart"; setup: string; delivery: string }
  | { error: true; message: string };

/**
 * A random joke from JokeAPI, formatted for Discord, or null if it couldn't be
 * fetched. Without a category, Dark jokes are left out.
 */
export async function fetchJoke(category: string = DEFAULT_CATEGORIES): Promise<string | null> {
  const response = await fetch(`https://v2.jokeapi.dev/joke/${category}`, {
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  const joke = (await response?.json().catch(() => null)) as Joke | null;
  if (!joke || joke.error) return null;

  // Hide the punchline behind a spoiler so people can guess first.
  return joke.type === "single" ? joke.joke : `${joke.setup}\n||${joke.delivery}||`;
}

export const jokes: Command = {
  data: new SlashCommandBuilder()
    .setName("jokes")
    .setDescription("Post a random joke from JokeAPI")
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("What kind of joke (default: any except Dark)")
        .addChoices(CATEGORIES.map((category) => ({ name: category, value: category }))),
    ),
  async execute(interaction) {
    const content = await fetchJoke(interaction.options.getString("category") ?? undefined);

    if (!content) {
      await interaction.reply({
        content: "Couldn't fetch a joke right now. Try again in a bit.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({ content, allowedMentions: { parse: [] } });
  },
};
