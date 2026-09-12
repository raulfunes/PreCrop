// Oracle: anchors the evidence memo on Solana with the team's publisher wallet.
// Uses the Memo program, so no custom program deployment is needed. The partner
// verifies by checking the transaction signer is the known publisher pubkey and
// that the memo's sha256 matches the evidence report they hold.
import { readFileSync } from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const DEFAULT_RPC_URL = "https://api.devnet.solana.com";

export function loadKeypair(path) {
  const secret = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function clusterParam(rpcUrl) {
  if (rpcUrl.includes("devnet")) return "?cluster=devnet";
  if (rpcUrl.includes("testnet")) return "?cluster=testnet";
  if (rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1")) {
    return `?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`;
  }
  return "";
}

/**
 * @param {{ text: string, keypair: Keypair, rpcUrl?: string }} args
 * @returns {Promise<{ signature: string, explorer_url: string, publisher: string, memo: string }>}
 */
export async function publishMemo({ text, keypair, rpcUrl = DEFAULT_RPC_URL }) {
  const connection = new Connection(rpcUrl, "confirmed");
  const ix = new TransactionInstruction({
    keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(text, "utf8"),
  });
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed" });
  return {
    signature,
    explorer_url: `https://explorer.solana.com/tx/${signature}${clusterParam(rpcUrl)}`,
    publisher: keypair.publicKey.toBase58(),
    memo: text,
  };
}
