import { Connection, PublicKey } from "@solana/web3.js";
import axios from "axios";
import { Command } from "commander";
import { RPC_NODE_URL } from "./constants";
import { createTokenAccounts, quote, swapTokens } from "./janitor";
import { loadKeypair } from "./utils";
import { Jupiter } from "@jup-ag/core";
import { createInterface } from 'readline';

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

program
  .command("create-token-accounts")
  .requiredOption("-k, --keypair <keypair>")
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
  .command("get-token-accounts")
  .option("-o, --owner <address>")
  .option("-t, --table", "Display as a table")
  .addHelpText("beforeAll", "Get token accounts owned by an address")
  .action(async ({ owner, table }) => {
    const { data: tokens } = await axios.get("https://token.jup.ag/strict");
    const tableData: Record<string, string>[] = [];
    (await getPlatformFeeAccounts(CONNECTION, new PublicKey(owner))).forEach(
      (account, mint) => {
        const token = tokens.find(
          ({ address }: { address: string }) => address === mint.toString()
        );
        tableData.push({
          Token: token
            ? `${token.name} (${token.symbol})`.replace(/,/g, "")
            : "???",
          "Mint Address": mint,
          "Fee Account Address": account.toBase58(),
        });
      }
    );
    if (tableData.length === 0) {
      return console.log(`No token accounts found for ${owner}`);
    }
    if (table) {
      console.table(tableData);
    } else {
      console.log(
        [Object.keys(tableData[0]!).join(",")]
          .concat(tableData.map((t) => Object.values(t).join(",")))
          .join("\n")
      );
    }
  });

program
  .command("swap-tokens")
  .requiredOption("-k, --keypair <KEYPAIR>")
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
  .option("-k, --keypair <KEYPAIR>", "")
  .action(async ({ inputMint, outputMint, amount, keypair, verbose }) => {
    const user = keypair ? loadKeypair(keypair) : undefined
    const jupiter = await Jupiter.load({
      connection: CONNECTION,
      cluster: "mainnet-beta",
      restrictIntermediateTokens: true, // We are not after absolute best price
      user
    });
    const bestRouteInfo = await quote({
      jupiter,
      inputMint,
      outputMint,
      amount,
      verbose,
    });
    if (user && bestRouteInfo) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question(">Execute the swap: y/N ", async (answer) => {
        if (answer !== 'y') {
          console.log('Not executing');
          return;
        }

        const { execute } = await jupiter.exchange({routeInfo: bestRouteInfo});
        const swapResult = await execute();
        if ("txid" in swapResult) {
          console.log("Executed swap, signature:", swapResult.txid);
        } else if ("error" in swapResult) {
          console.log("error:", swapResult.error);
        }

        rl.close();
      });

    }
  });

program.parse();
