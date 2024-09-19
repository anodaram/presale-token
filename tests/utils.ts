import * as anchor from "@coral-xyz/anchor";

export function pda(
  seeds: (Buffer | Uint8Array)[],
  programId: anchor.web3.PublicKey
) {
  const [pdaKey] = anchor.web3.PublicKey.findProgramAddressSync(
    seeds,
    programId
  );
  return pdaKey;
}

export async function safeAirdrop(
  connection: anchor.web3.Connection,
  destination: anchor.web3.PublicKey,
  amount = 100000000
) {
  while ((await connection.getBalance(destination)) < amount) {
    try {
      // Request Airdrop for user
      await connection.confirmTransaction(
        await connection.requestAirdrop(destination, 100000000),
        "processed"
      );
    } catch {}
  }
}
