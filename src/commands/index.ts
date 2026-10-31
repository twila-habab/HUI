import { Collection } from "discord.js";
import type { Command, MessageCommand } from "./types.js";
import { echo } from "./echo.js";
import { help } from "./help.js";
import { jokes } from "./jokes.js";
import { leaderboard, rank } from "./levels.js";
import { ping } from "./ping.js";
import { receiptMultiple, receiptThis } from "./receipt.js";
import { reindex } from "./reindex.js";
import { rateThis } from "./rate.js";
import { repost } from "./repost.js";
import { roast } from "./roast.js";
import { ship } from "./ship.js";
import { wanted } from "./wanted.js";

const all: Command[] = [ping, echo, jokes, repost, reindex, rank, leaderboard, ship, roast, wanted, help];
const allMessage: MessageCommand[] = [receiptThis, receiptMultiple, rateThis];

export const commands = new Collection<string, Command>(
  all.map((command) => [command.data.name, command]),
);

export const messageCommands = new Collection<string, MessageCommand>(
  allMessage.map((command) => [command.data.name, command]),
);
