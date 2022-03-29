import { Keypair, PublicKey } from "@solana/web3.js";

import dotenv from "dotenv";
dotenv.config();

export const RPC_ENDPOINT = "https://ssc-dao.genesysgo.net";

export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
