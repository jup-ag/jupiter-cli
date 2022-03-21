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
import { deserializeAccount, sleep } from "./utils";

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
  const blockhash = (await connection.getRecentBlockhash("finalized"))
    .blockhash;
  const shortlistedMints = Array.from(shortlistedTokens);
  while (shortlistedMints.length > 0) {
    let tx = new Transaction({ feePayer: userKeypair.publicKey });
    tx.recentBlockhash = blockhash;

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

    tx.sign(userKeypair);
    const signature = await connection.sendRawTransaction(tx.serialize());
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

  console.log(
    `Token accounts to swap back to USDC: ${tokenAccountInfosToSwap.length}`
  );

  let expectedTotalOutAmount = 0;
  for (const tokenAccountInfo of tokenAccountInfosToSwap) {
    if (tokenAccountInfo.amount.eq(new u64(0))) {
      // Skip if empty
      continue;
    }

    const { routesInfos } = await jupiter.computeRoutes({
      inputMint: tokenAccountInfo.mint,
      outputMint: USDC_MINT,
      inputAmount: 0,
      slippage: 0.5, // It should be a small amount so slippage can be set wide
      forceFetch: true,
    });
    if (routesInfos.length > 1) {
      const bestRouteInfo = routesInfos[0]!;

      if (bestRouteInfo.outAmount < 100_000) {
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

      if (!dryRun) {
        // Do the business of swapping here
      }
    }

    await sleep(500); // Wait to avoid potential rate limits when fetching data
  }

  console.log(
    "Expected total out amount (raw amount):",
    expectedTotalOutAmount
  );
}
