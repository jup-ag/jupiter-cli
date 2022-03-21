import { Connection } from "@solana/web3.js";
import { Command } from "commander";
import { RPC_ENDPOINT, USER_KEYPAIR } from "./constants";
import { createTokenAccounts, swapTokens } from "./janitor";

const CONNECTION = new Connection(RPC_ENDPOINT);
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

program
  .command("create-token-accounts")
  .option(
    "-t, --tokens-from-top",
    "Tokens from the top to create an account for",
    "10"
  )
  .option("-d, --dry-run")
  .addHelpText(
    "beforeAll",
    "Create token accounts based on top tokens, to reduce setup when trading or to setup platform fee accounts"
  )
  .action(async ({ tokensFromTop, dryRun }) => {
    console.log("tokensFromTop:", tokensFromTop);
    await createTokenAccounts(CONNECTION, USER_KEYPAIR, tokensFromTop, dryRun);
  });

program
  .command("swap-tokens")
  .option("-d, --dry-run")
  .addHelpText(
    "beforeAll",
    "/!\\ Will swap any token that isn't in the keep array back to USDC"
  )
  .action(async ({ dryRun }) => {
    await swapTokens(CONNECTION, USER_KEYPAIR, KEEP_TOKEN_MINTS, dryRun);
  });

program.parse();
