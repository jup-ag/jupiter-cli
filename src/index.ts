import { Connection } from "@solana/web3.js";
import { Command } from "commander";
import { RPC_ENDPOINT } from "./constants";
import { createTokenAccounts, createTokenLedger, swapTokens } from "./janitor";
import { loadKeypair } from "./utils";

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
  .requiredOption("-k, --keypair <keypair>")
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
  .action(async ({ keypair, tokensFromTop, dryRun }) => {
    console.log("tokensFromTop:", tokensFromTop);
    await createTokenAccounts(
      CONNECTION,
      loadKeypair(keypair),
      tokensFromTop,
      dryRun
    );
  });

program
  .command("swap-tokens")
  .requiredOption("-k, --keypair <keypair>")
  .option("-d, --dry-run")
  .addHelpText(
    "beforeAll",
    "/!\\ Will swap any token that isn't in the keep array back to USDC"
  )
  .action(async ({ keypair, dryRun }) => {
    console.log(keypair);
    await swapTokens(
      CONNECTION,
      loadKeypair(keypair),
      KEEP_TOKEN_MINTS,
      dryRun
    );
  });

program
  .command("create-token-ledger")
  .requiredOption("-k, --keypair <keypair>")
  .option(
    "-t, --token-ledger-keypair <path>",
    "Custom keypair for your token ledger"
  )
  .option("-d, --dry-run")
  .addHelpText(
    "beforeAll",
    "Create a custom token ledger that you can use to track your transactions on Jupiter"
  )
  .action(async ({ keypair, tokenLedgerKeypair, dryRun }) => {
    console.log("keypair:", keypair);
    await createTokenLedger(
      CONNECTION,
      loadKeypair(keypair),
      tokenLedgerKeypair,
      dryRun
    );
  });

program.parse();
