import { Collection } from "discord.js";
import type { Command, MessageCommand } from "./types.js";
import { echo } from "./echo.js";
import { ping } from "./ping.js";
import { receiptMultiple, receiptThis } from "./receipt.js";
import { repost } from "./repost.js";

const all: Command[] = [ping, echo, repost];
const allMessage: MessageCommand[] = [receiptThis, receiptMultiple];

export const commands = new Collection<string, Command>(
  all.map((command) => [command.data.name, command]),
);

export const messageCommands = new Collection<string, MessageCommand>(
  allMessage.map((command) => [command.data.name, command]),
);
