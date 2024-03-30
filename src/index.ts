#!/usr/bin/env node

import { Connection, PublicKey } from "@solana/web3.js";
import { Command, Option } from "commander";
import { RPC_NODE_URL } from "./constants";
import {
  createTokenAccounts,
  fetchAndExecuteSwapTransaction,
  quote,
  swapTokens,
} from "./janitor";
import { fetchPriorityFee, loadKeypair } from "./utils";
import { createJupiterApiClient } from "@jup-ag/api";
import { createInterface } from "readline";

const CONNECTION = new Connection(RPC_NODE_URL);
const KEEP_TOKEN_MINTS = new Set([
  "So11111111111111111111111111111111111111112", // wSOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", // RAY
  "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt", // SRM
  "9vMJfxuKxXBoEa7rM12mYLMwTacLMLDJqHozw96WQL8i", // UST
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj", // stSOL
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", // mSOL
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", // ETH (Wormhole)
]);

const program = new Command();
const keypairOption = new Option("-k, --keypair <keypair-path>")
  .env("KEYPAIR")
  .makeOptionMandatory(true);
program
  .command("create-token-accounts")
  .addOption(keypairOption)
  .option("-o, --owner <address>")
  .option(
    "-t, --tokens-from-top <tokens-from-top>",
    "Tokens from the top to create an account for",
    "10"
  )
  .option("-d, --dry-run")
  .addHelpText(
    "beforeAll",
    "Create token accounts based on top tokens, to reduce setup when trading or to setup platform fee accounts"
  )
  .action(async ({ keypair, owner, tokensFromTop, dryRun }) => {
    const loadedKeypair = loadKeypair(keypair);
    await createTokenAccounts(
      CONNECTION,
      loadedKeypair,
      owner ? new PublicKey(owner) : keypair.publicKey,
      Number(tokensFromTop),
      dryRun
    );
  });

program
  .command("swap-tokens")
  .addOption(keypairOption)
  .option("-d, --dry-run")
  .addHelpText(
    "beforeAll",
    "/!\\ Will swap any token that isn't in the keep array back to USDC"
  )
  .action(async ({ keypair, dryRun }) => {
    await swapTokens(
      CONNECTION,
      loadKeypair(keypair),
      KEEP_TOKEN_MINTS,
      dryRun
    );
  });

function publicKeyFromString(s: string) {
  return new PublicKey(s);
}

program
  .command("quote")
  .requiredOption(
    "--input-mint <mint>",
    "input mint for the quote",
    publicKeyFromString
  )
  .requiredOption(
    "--output-mint <mint>",
    "output mint for the quote",
    publicKeyFromString
  )
  .requiredOption("-a, --amount <amount>")
  .option("-v, --verbose", "Verbose quote", false)
  .addOption(keypairOption)
  .action(async ({ inputMint, outputMint, amount, keypair, verbose }) => {
    const user = keypair ? loadKeypair(keypair) : undefined;

    const quoteResponse = await quote({
      inputMint,
      outputMint,
      amount,
      verbose,
    });
    if (user && quoteResponse) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(">Execute the swap: y/N ", async (answer) => {
        if (answer.toLowerCase() !== "y") {
          console.log("Not executing");
          return;
        }

        const priorityFee = await fetchPriorityFee();

        await fetchAndExecuteSwapTransaction({
          connection: CONNECTION,
          quoteResponse,
          userKeypair: user,
          priorityFee,
        });

        rl.close();
      });
    }
  });

program.parse();
