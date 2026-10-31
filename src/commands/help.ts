import {
  ApplicationCommandOptionType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Collection,
  type Snowflake,
} from "discord.js";
import { commands, messageCommands } from "./index.js";
import type { Command } from "./types.js";

const HELP_COLOR = 0x5865f2;

/** Sections in display order. Commands not listed here end up under "Other". */
const SECTIONS: { title: string; names: string[] }[] = [
  { title: "🎉 Fun", names: ["ship", "roast", "wanted", "jokes", "Rate this"] },
  { title: "📈 Levels", names: ["rank", "leaderboard"] },
  { title: "🧾 Receipts", names: ["Receipt this", "Receipt multiple", "repost"] },
  { title: "🛠️ Utility", names: ["help", "ping", "echo"] },
  { title: "🔒 Admin", names: ["reindex"] },
];

/** Registered command IDs by name, so the list can show clickable command mentions. */
async function commandIds(interaction: ChatInputCommandInteraction): Promise<Map<string, Snowflake>> {
  // Commands are registered per server when GUILD_ID is set, otherwise globally.
  const fetched: Collection<Snowflake, { id: Snowflake; name: string }> | null =
    (await interaction.guild?.commands.fetch().catch(() => null)) ?? null;
  const registered = fetched?.size ? fetched : await interaction.client.application.commands.fetch().catch(() => null);
  return new Map(registered?.map((command) => [command.name, command.id]) ?? []);
}

/** e.g. "/ship `user` `[with]`", clickable when the command's ID is known. */
function describeSlash(command: Command, ids: Map<string, Snowflake>): string {
  const { name, description, options = [] } = command.data.toJSON();
  const id = ids.get(name);
  const mention = id ? `</${name}:${id}>` : `**/${name}**`;
  const args = options
    .filter((option) => option.type !== ApplicationCommandOptionType.Subcommand)
    .map((option) => `\`${option.required ? option.name : `[${option.name}]`}\``)
    .join(" ");
  return `${mention}${args ? ` ${args}` : ""}\n-# ${description}`;
}

export const help: Command = {
  data: new SlashCommandBuilder().setName("help").setDescription("List everything I can do"),
  async execute(interaction) {
    const ids = await commandIds(interaction);
    const entries = new Map<string, string>([
      ...commands.map((command): [string, string] => [command.data.name, describeSlash(command, ids)]),
      ...messageCommands.map((command): [string, string] => [
        command.data.name,
        `**${command.data.name}**\n-# Right-click a message → Apps → ${command.data.name}`,
      ]),
    ]);

    const embed = new EmbedBuilder()
      .setColor(HELP_COLOR)
      .setTitle(`👋 Hi, I'm ${interaction.client.user.displayName}!`)
      .setDescription("Here's everything I can do. `[brackets]` mean optional.")
      .setThumbnail(interaction.client.user.displayAvatarURL());
    const sections = [
      ...SECTIONS,
      { title: "📦 Other", names: [...entries.keys()].filter((name) => !SECTIONS.some((s) => s.names.includes(name))) },
    ];
    for (const { title, names } of sections) {
      const lines = names.flatMap((name) => entries.get(name) ?? []);
      if (lines.length > 0) embed.addFields({ name: title, value: lines.join("\n") });
    }
    // Only the person asking sees it, so it doesn't clutter the channel.
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
