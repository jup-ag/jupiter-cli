import { Jupiter } from "@jup-ag/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
  AccountInfo as TokenAccountInfo,
  u64,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import fetch from "isomorphic-fetch";
import { USDC_MINT } from "./constants";
import { deserializeAccount, loadKeypair, sleep } from "./utils";

type Address = string;

async function getTokenAccountInfos(
  connection: Connection,
  wallet: PublicKey
): Promise<TokenAccountInfo[]> {
  const existingTas = (
    await connection.getTokenAccountsByOwner(wallet, {
      programId: TOKEN_PROGRAM_ID,
    })
  ).value;

  return existingTas.map(({ pubkey, account }) =>
    deserializeAccount(pubkey, account.data)
  );
}

export async function createTokenAccounts(
  connection: Connection,
  userKeypair: Keypair,
  tokensFromTop: number,
  dryRun: boolean
) {
  // Top tokens are the most traded tokens, token #60 is about 30k USD of volume a day
  const topTokens = (await (
    await fetch("https://cache.jup.ag/top-tokens")
  ).json()) as Address[];

  const shortlistedTokens = new Set(topTokens.slice(0, tokensFromTop));
  const tokenAccountInfos = await getTokenAccountInfos(
    connection,
    userKeypair.publicKey
  );
  const exitingPlatformFeeAccountMints = new Set(
    tokenAccountInfos.map(({ mint }) => mint.toBase58())
  );
  console.log(
    "Existing token accounts of distinct mint:",
    exitingPlatformFeeAccountMints.size
  );

  const shortlistedTokensSize = shortlistedTokens.size;
  exitingPlatformFeeAccountMints.forEach((mint) =>
    shortlistedTokens.delete(mint)
  );
  console.log(
    `Create ${shortlistedTokens.size} ATAs out of ${shortlistedTokensSize}`
  );

  if (dryRun) return;

  // Create ATAs for missing token accounts
  const shortlistedMints = Array.from(shortlistedTokens);
  while (shortlistedMints.length > 0) {
    let tx = new Transaction({ feePayer: userKeypair.publicKey });

    for (const mint of shortlistedMints.splice(0, 10)) {
      const mintPk = new PublicKey(mint);
      const ta = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        mintPk,
        userKeypair.publicKey
      );
      tx.add(
        ...[
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            new PublicKey(mintPk),
            ta,
            userKeypair.publicKey,
            userKeypair.publicKey
          ),
        ]
      );
    }

    const signature = await connection.sendTransaction(tx, [userKeypair]);
    console.log("signature:", signature);
  }
}

// TODO: Implement
export async function closeTokenAccounts(
  connection: Connection,
  userKeypair: Keypair,
  tokensFromTop: number
) {}

export async function swapTokens(
  connection: Connection,
  userKeypair: Keypair,
  keepTokenMints: Set<Address>,
  dryRun: boolean
) {
  const tokenAccountInfos = await getTokenAccountInfos(
    connection,
    userKeypair.publicKey
  );

  const jupiter = await Jupiter.load({
    connection,
    cluster: "mainnet-beta",
    user: userKeypair,
    restrictIntermediateTokens: true, // We are not after absolute best price
    wrapUnwrapSOL: false,
  });

  const tokenAccountInfosToSwap = tokenAccountInfos.filter(
    ({ mint }) => !keepTokenMints.has(mint.toBase58())
  );

  const routeMap = jupiter.getRouteMap();

  console.log(
    `Token accounts to swap back to USDC: ${tokenAccountInfosToSwap.length}`
  );

  let expectedTotalOutAmount = 0;
  for (const tokenAccountInfo of tokenAccountInfosToSwap) {
    if (tokenAccountInfo.amount.eq(new u64(0))) {
      // Skip if empty
      continue;
    }

    if (
      !routeMap
        .get(tokenAccountInfo.mint.toBase58())
        ?.includes(USDC_MINT.toBase58())
    ) {
      console.log(
        `Skipping swapping ${tokenAccountInfo.amount.toNumber()} of ${
          tokenAccountInfo.mint
        } because no route available in route map for this token`
      );
      continue;
    }

    const { routesInfos } = await jupiter.computeRoutes({
      inputMint: tokenAccountInfo.mint,
      outputMint: USDC_MINT,
      inputAmount: tokenAccountInfo.amount.toNumber(),
      slippage: 0.5, // It should be a small amount so slippage can be set wide
      forceFetch: true,
    });
    if (routesInfos.length > 1) {
      const bestRouteInfo = routesInfos[0]!;

      if (bestRouteInfo.outAmount < 50_000) {
        // Less than 10 cents so not worth attempting to swap
        console.log(
          `Skipping swapping ${
            bestRouteInfo.outAmount / Math.pow(10, 6)
          } worth of ${
            tokenAccountInfo.mint
          } in ${tokenAccountInfo.address.toBase58()}`
        );
        continue;
      }

      expectedTotalOutAmount += bestRouteInfo.outAmount;

      console.log(
        `Swap ${tokenAccountInfo.mint} for estimated ${
          bestRouteInfo.outAmount / Math.pow(10, 6)
        } USDC`
      );

      if (dryRun) continue;

      const { execute } = await jupiter.exchange({
        routeInfo: bestRouteInfo,
      });
      const swapResult = await execute();
      if ("txid" in swapResult) {
        console.log("Executed swap, signature:", swapResult.txid);
      } else if ("error" in swapResult) {
        console.log("error:", swapResult.error);
      }
    }

    await sleep(500); // Wait to avoid potential rate limits when fetching data
  }

  console.log(
    "Expected total out amount (raw amount):",
    expectedTotalOutAmount
  );
}

export async function createTokenLedger(
  connection: Connection,
  userKeypair: Keypair,
  ledgerKeypairPath: string | undefined = undefined,
  dryRun: boolean
) {
  let ledgerKeypair: Keypair;
  if (!ledgerKeypairPath) {
    ledgerKeypair = Keypair.generate();
  } else {
    ledgerKeypair = loadKeypair(ledgerKeypairPath);
  }

  console.log(`Create token ledger ${ledgerKeypair.publicKey.toBase58()}`);

  if (dryRun) return;

  // Create the token ledger
  let tx = new Transaction({ feePayer: userKeypair.publicKey });
  tx.add(
    Jupiter.createInitializeTokenLedgerInstruction(
      ledgerKeypair.publicKey,
      userKeypair.publicKey
    )
  );

  const signature = await connection.sendTransaction(tx, [
    userKeypair,
    ledgerKeypair,
  ]);
  console.log("signature:", signature);
}
