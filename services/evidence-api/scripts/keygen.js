// Creates the publisher keypair (.keys/publisher.json, gitignored) and asks the
// devnet faucet for 1 SOL. Run once. If the airdrop is rate-limited, use
// https://faucet.solana.com with the printed public key.
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { DEFAULT_RPC_URL } from "../src/memo.js";

const path = process.env.PUBLISHER_KEYPAIR ?? ".keys/publisher.json";
const rpcUrl = process.env.RPC_URL ?? DEFAULT_RPC_URL;

let keypair;
if (existsSync(path)) {
  const { loadKeypair } = await import("../src/memo.js");
  keypair = loadKeypair(path);
  console.log(`keypair already exists at ${path}`);
} else {
  keypair = Keypair.generate();
  mkdirSync(".keys", { recursive: true });
  writeFileSync(path, JSON.stringify(Array.from(keypair.secretKey)));
  console.log(`wrote ${path}`);
}
console.log(`publisher pubkey: ${keypair.publicKey.toBase58()}`);

const connection = new Connection(rpcUrl, "confirmed");
const before = await connection.getBalance(keypair.publicKey);
console.log(`balance: ${before / LAMPORTS_PER_SOL} SOL on ${rpcUrl}`);
if (before < 0.05 * LAMPORTS_PER_SOL) {
  try {
    const sig = await connection.requestAirdrop(keypair.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    console.log(`airdrop ok: ${sig}`);
  } catch (err) {
    console.log(`airdrop failed (${err.message}). Use https://faucet.solana.com with the pubkey above.`);
  }
  console.log(`balance: ${(await connection.getBalance(keypair.publicKey)) / LAMPORTS_PER_SOL} SOL`);
}
