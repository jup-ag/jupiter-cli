import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

import dotenv from "dotenv";
dotenv.config();

export const RPC_ENDPOINT = "https://ssc-dao.genesysgo.net";

// export const WALLET_BASE58_PRIVATE_KEY =
//   process.env.WALLET_BASE58_PRIVATE_KEY || "PASTE YOUR WALLET PRIVATE KEY";
// export const USER_PRIVATE_KEY = bs58.decode(WALLET_BASE58_PRIVATE_KEY);
// export const USER_KEYPAIR = Keypair.fromSecretKey(USER_PRIVATE_KEY);

export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
