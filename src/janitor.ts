import { Jupiter } from "@jup-ag/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import fetch from "isomorphic-fetch";
import { deserializeAccount } from "./utils";

type Address = string;

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
  const existingTas = (
    await connection.getTokenAccountsByOwner(userKeypair.publicKey, {
      programId: TOKEN_PROGRAM_ID,
    })
  ).value;
  const exitingPlatformFeeAccountMints = new Set(
    existingTas.map(({ account }) =>
      deserializeAccount(account.data).mint.toBase58()
    )
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

/**
 * /!\ Will swap any token that isn't in the keep array back to USDC
 */
export async function swapTokens(
  connection: Connection,
  userKeypair: Keypair,
  keepTokenMints: Set<Address>
) {
  const jupiter = await Jupiter.load({
    connection,
    cluster: "mainnet-beta",
    user: userKeypair,
    wrapUnwrapSOL: false,
  });
}
