import * as anchor from "@coral-xyz/anchor";

export const PRECISION = new anchor.BN(1_000_000_000);
export const PERCENT_DENOMINATOR = 10_000;
export const ROUND_COUNT = 4;

export const PLATFORM_CONFIG_TAG = Buffer.from("platform-config");
export const PRESALE_CONFIG_TAG = Buffer.from("presale-config");
export const VAULT_BASE_TOKEN_ACCOUNT_TAG = Buffer.from(
  "vault-base-token-account"
);
export const USER_ALLOCATION_TAG = Buffer.from("user-allocation");
export const USER_TOKEN_ACCOUNT_TAG = Buffer.from("user-token-account");
export const PLATFORM_FEE_TOKEN_ACCOUNT_TAG = Buffer.from(
  "platform-fee-token-account"
);
