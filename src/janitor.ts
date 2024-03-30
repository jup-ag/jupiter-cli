import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
  type AccountInfo as TokenAccountInfo,
  u64,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import fetch from "isomorphic-fetch";
import { jupiterApiClient, USDC_MINT } from "./constants";
import {
  deserializeAccount,
  fetchPriorityFee,
  loadKeypair,
  sleep,
} from "./utils";
import JSBI from "jsbi";
import {
  handleSendTransaction,
  modifyPriorityFeeIx,
} from "@mercurial-finance/optimist";
import type { QuoteResponse, SwapRequest } from "@jup-ag/api";

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
  payerKeypair: Keypair,
  owner: PublicKey,
  tokensFromTop: number,
  dryRun: boolean
) {
  // Top tokens are the most traded tokens, token #60 is about 30k USD of volume a day
  const topTokens = (await (
    await fetch("https://cache.jup.ag/top-tokens")
  ).json()) as Address[];

  const shortlistedTokens = new Set(topTokens.slice(0, tokensFromTop));
  const tokenAccountInfos = await getTokenAccountInfos(connection, owner);
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
    let tx = new Transaction({ feePayer: payerKeypair.publicKey });

    for (const mint of shortlistedMints.splice(0, 10)) {
      const mintPk = new PublicKey(mint);
      const ta = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        mintPk,
        owner,
        true
      );
      tx.add(
        ...[
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            new PublicKey(mintPk),
            ta,
            owner,
            payerKeypair.publicKey
          ),
        ]
      );
    }

    const signature = await sendAndConfirmTransaction(connection, tx, [
      payerKeypair,
    ]);
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
  const priorityFee = await fetchPriorityFee();
  const tokenAccountInfos = await getTokenAccountInfos(
    connection,
    userKeypair.publicKey
  );

  const tokenAccountInfosToSwap = tokenAccountInfos.filter(
    ({ mint }) => !keepTokenMints.has(mint.toBase58())
  );

  let expectedTotalOutAmount = JSBI.BigInt(0);
  for (const tokenAccountInfo of tokenAccountInfosToSwap) {
    if (tokenAccountInfo.amount.eq(new u64(0))) {
      // Skip if empty
      continue;
    }

    console.log(
      "fetching quote for token mint:",
      tokenAccountInfo.mint.toBase58()
    );
    let quoteResponse: QuoteResponse | undefined;
    try {
      quoteResponse = await jupiterApiClient.quoteGet({
        inputMint: tokenAccountInfo.mint.toBase58(),
        outputMint: USDC_MINT.toBase58(),
        amount: JSBI.BigInt(
          tokenAccountInfo.amount.toNumber()
        ).toString() as any,
        slippageBps: 50, // It should be a small amount so slippage can be set wide
      });
    } catch (e) {
      console.error("quote failed", e);
    }

    if (!quoteResponse) {
      continue;
    }

    let outAmount = JSBI.BigInt(quoteResponse.outAmount.toString());
    const uiOutAmount =
      Number(quoteResponse.outAmount.toString()) / Math.pow(10, 6);
    if (
      JSBI.lessThan(
        JSBI.BigInt(quoteResponse.outAmount.toString()),
        JSBI.BigInt(10_000)
      )
    ) {
      // Less than 1 cents so not worth attempting to swap
      console.log(
        `Skipping swapping ${uiOutAmount} worth of ${
          tokenAccountInfo.mint
        } in ${tokenAccountInfo.address.toBase58()}`
      );
      continue;
    }

    expectedTotalOutAmount = JSBI.add(expectedTotalOutAmount, outAmount);

    console.log(
      `Swap ${tokenAccountInfo.mint} for estimated ${uiOutAmount} USDC`
    );

    if (dryRun) continue;
    fetchAndExecuteSwapTransaction({
      connection,
      quoteResponse: quoteResponse,
      userKeypair,
      priorityFee,
    });
    await sleep(500); // Wait to avoid potential rate limits when fetching data
  }

  console.log(
    "Expected total out amount (raw amount):",
    expectedTotalOutAmount.toString()
  );
}

export async function quote(params: {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: string;
  verbose: boolean;
}) {
  const route = await jupiterApiClient.quoteGet({
    amount: params.amount as any, // string is fine
    inputMint: params.inputMint.toBase58(),
    outputMint: params.outputMint.toBase58(),
    slippageBps: 50,
    maxAccounts: 60,
  });
  if ("outAmount" in route) {
    if (params.verbose) {
      console.log(route);
    }

    const { routePlan } = route;
    console.table([
      { name: "inAmount", value: route.inAmount.toString() },
      { name: "outAmount", value: route.outAmount.toString() },
      {
        name: "AMM labels",
        value: routePlan.map((mi) => mi.swapInfo.label).join(","),
      },
      {
        name: "mints",
        value: [
          params.inputMint.toString(),
          ...routePlan.map((mi) => mi.swapInfo.outputMint),
        ],
      },
    ]);
    return route;
  } else {
    console.log("No route found");
  }
}

export const fetchAndExecuteSwapTransaction = async ({
  connection,
  quoteResponse,
  userKeypair,
  priorityFee,
}: {
  quoteResponse: QuoteResponse;
  userKeypair: Keypair;
  connection: Connection;
  priorityFee?: number;
}) => {
  const swapResponse = await jupiterApiClient.swapPost({
    swapRequest: {
      quoteResponse: quoteResponse,
      userPublicKey: userKeypair.publicKey.toBase58(),
      computeUnitPriceMicroLamports: 1,
      dynamicComputeUnitLimit: true,
    },
  });

  const versionedTransaction = VersionedTransaction.deserialize(
    Buffer.from(swapResponse.swapTransaction, "base64")
  );

  if (priorityFee) {
    modifyPriorityFeeIx(versionedTransaction, priorityFee);
  }

  versionedTransaction.sign([userKeypair]);

  const swapResult = await handleSendTransaction({
    blockhash: versionedTransaction.message.recentBlockhash,
    lastValidBlockHeight: swapResponse.lastValidBlockHeight,
    connection,
    signedTransaction: versionedTransaction,
  });

  if ("txid" in swapResult) {
    console.log({ swapResult });
    console.log("Executed swap, signature:", swapResult.txid);
  } else if ("error" in swapResult) {
    console.log("error:", swapResult.error);
  }
};
