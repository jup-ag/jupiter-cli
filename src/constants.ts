import { PublicKey } from "@solana/web3.js";

import dotenv from "dotenv";
dotenv.config();

export const RPC_NODE_URL = String(
  process.env.RPC_NODE_URL || "https://api.mainnet-beta.solana.com"
);

export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
