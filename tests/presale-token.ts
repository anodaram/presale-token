import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { pack, TokenMetadata } from "@solana/spl-token-metadata";
import { PresaleToken } from "../target/types/presale_token";
import { pda, safeAirdrop } from "./utils";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AuthorityType,
  createAssociatedTokenAccountInstruction,
  createInitializeInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMint,
  createMintToInstruction,
  createSetAuthorityInstruction,
  ExtensionType,
  getAccount,
  getAssociatedTokenAddressSync,
  getMintLen,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TYPE_SIZE,
} from "@solana/spl-token";
import {
  PLATFORM_CONFIG_TAG,
  PLATFORM_FEE_TOKEN_ACCOUNT_TAG,
  PRECISION,
  PRESALE_CONFIG_TAG,
  USER_ALLOCATION_TAG,
  USER_TOKEN_ACCOUNT_TAG,
  VAULT_BASE_TOKEN_ACCOUNT_TAG,
} from "./constants";
import { assert } from "chai";

describe("presale-token", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const program = anchor.workspace.PresaleToken as Program<PresaleToken>;

  const programId = program.programId;

  const wallet = provider.wallet as anchor.Wallet;
  const platformWallet = wallet.publicKey;

  const adminKeypair = new Keypair();
  const admin = adminKeypair.publicKey;
  let adminFeeTokenAccount: PublicKey;
  let adminBaseTokenAccount: PublicKey;

  const userAKeypair = new Keypair();
  const userA = userAKeypair.publicKey;
  let userABaseTokenAccount: PublicKey;

  const userBKeypair = new Keypair();
  const userB = userBKeypair.publicKey;
  let userBBaseTokenAccount: PublicKey;

  const userCKeypair = new Keypair();
  const userC = userCKeypair.publicKey;
  let userCBaseTokenAccount: PublicKey;

  let feeMint: PublicKey; // USDC
  let baseMint: PublicKey;
  const newMintAuth = new Keypair();
  const newMint = newMintAuth.publicKey;

  it("Prepare!", async () => {
    await Promise.all([
      safeAirdrop(program.provider.connection, admin, 1_000_000_000),
      safeAirdrop(program.provider.connection, userA, 1_000_000_000),
      safeAirdrop(program.provider.connection, userB, 1_000_000_000),
      safeAirdrop(program.provider.connection, userC, 1_000_000_000),
    ]);

    feeMint = await createMint(
      program.provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6,
      Keypair.generate(),
      undefined,
      TOKEN_PROGRAM_ID
    );

    baseMint = await createMint(
      program.provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      9,
      Keypair.generate(),
      undefined,
      TOKEN_PROGRAM_ID
    );
    const transaction = new Transaction();
    console.log("baseMint", baseMint.toBase58());
    console.log("newMint", newMint.toBase58());
    console.log("presaleConfig", presaleConfig.toBase58());

    const mintAmount = new anchor.BN(1_000_000_000).mul(PRECISION);
    adminFeeTokenAccount = getAssociatedTokenAddressSync(
      feeMint,
      admin,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    transaction.add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        adminFeeTokenAccount,
        admin,
        feeMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createMintToInstruction(
        feeMint,
        adminFeeTokenAccount,
        wallet.publicKey,
        BigInt(mintAmount.toString()),
        [],
        TOKEN_PROGRAM_ID
      )
    );

    [
      adminBaseTokenAccount,
      userABaseTokenAccount,
      userBBaseTokenAccount,
      userCBaseTokenAccount,
    ] = [admin, userA, userB, userC].map((user) => {
      const tokenAccount = getAssociatedTokenAddressSync(
        baseMint,
        user,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      transaction.add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          tokenAccount,
          user,
          baseMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        ),
        createMintToInstruction(
          baseMint,
          tokenAccount,
          wallet.publicKey,
          BigInt(mintAmount.toString()),
          [],
          TOKEN_PROGRAM_ID
        )
      );
      return tokenAccount;
    });

    const metaData: TokenMetadata = {
      updateAuthority: admin,
      mint: newMint,
      name: "Hello Token",
      symbol: "HELLO",
      uri: "",
      additionalMetadata: [],
    };

    // Size of MetadataExtension 2 bytes for type, 2 bytes for length
    const metadataExtension = TYPE_SIZE + LENGTH_SIZE;
    // Size of metadata
    const metadataLen = pack(metaData).length;

    const extensions = [ExtensionType.MetadataPointer];
    const mintLen = getMintLen(extensions);
    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(
        mintLen + metadataExtension + metadataLen
      );

    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: admin,
        newAccountPubkey: newMint,
        space: mintLen,
        lamports: lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeMetadataPointerInstruction(
        newMint, // Mint Account address
        admin, // Authority that can set the metadata address
        newMint, // Account address that holds the metadata
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(
        newMint,
        9,
        admin,
        null,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeInstruction({
        programId: TOKEN_2022_PROGRAM_ID, // Token Extension Program as Metadata Program
        metadata: newMint, // Account address that holds the metadata
        updateAuthority: admin, // Authority that can update the metadata
        mint: newMint, // Mint Account address
        mintAuthority: admin, // Designated Mint Authority
        name: metaData.name,
        symbol: metaData.symbol,
        uri: metaData.uri,
      }),
      createSetAuthorityInstruction(
        newMint, // account: PublicKey,
        admin, // currentAuthority: PublicKey,
        AuthorityType.MintTokens, // authorityType: AuthorityType,
        presaleConfig, // newAuthority: PublicKey | null,
        [], // multiSigners: (Signer | PublicKey)[] = [],
        TOKEN_2022_PROGRAM_ID // programId = TOKEN_PROGRAM_ID
      )
    );

    const txSig = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet.payer, newMintAuth, adminKeypair],
      { skipPreflight: true }
    );
    console.log(`Transaction Signature: ${txSig}`);
  });

  const configData = {
    decimals: 9,
    startTime: new anchor.BN(0), // not set yet
    duration: new anchor.BN(20), // 20 seconds
    roundPrices: [
      new anchor.BN(0.00000003 * PRECISION.toNumber()), // 0.00000003 SOL
      new anchor.BN(0.00000006 * PRECISION.toNumber()), // 0.00000006 SOL
      new anchor.BN(0.00000012 * PRECISION.toNumber()), // 0.00000012 SOL
      new anchor.BN(0.00000036 * PRECISION.toNumber()), // 0.00000036 SOL
    ],
    feePercent: 500, // 5%
  };
  const platformConfig = pda([PLATFORM_CONFIG_TAG], programId);
  const presaleConfig = pda([PRESALE_CONFIG_TAG, admin.toBuffer()], programId);
  const platformFeeTokenAccount = pda([PLATFORM_FEE_TOKEN_ACCOUNT_TAG], programId);
  const vaultBaseTokenAccount = pda(
    [VAULT_BASE_TOKEN_ACCOUNT_TAG, presaleConfig.toBuffer()],
    programId
  );
  const getUserAllocation = (user: PublicKey) =>
    pda(
      [USER_ALLOCATION_TAG, presaleConfig.toBuffer(), user.toBuffer()],
      programId
    );

  it("Initialize!", async () => {
    const txSig = await program.methods
      .initialize().accounts({
        platformConfig,
        feeMint,
        platformWallet,
        systemProgram: SystemProgram.programId,
      })
      .signers([wallet.payer])
      .rpc();
    console.log(`Transaction Signature: ${txSig}`);
  });

  it("Initialize Presale!", async () => {
    configData.startTime = new anchor.BN(Math.floor(Date.now() / 1000) + 10); // 10 seconds from now

    const txSig = await program.methods
      .initializePresale(
        configData.decimals,
        configData.startTime,
        configData.duration,
        configData.roundPrices,
        configData.feePercent
      )
      .accounts({
        platformConfig,
        platformWallet,
        presaleConfig,
        creator: admin,
        baseMint,
        newMint,
        feeMint,
        creatorFeeTokenAccount: adminFeeTokenAccount,
        platformFeeTokenAccount,
        vaultBaseTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();

    console.log(`Transaction Signature: ${txSig}`);

    const platformConfigAccount = await program.account.platformConfig.fetch(
      platformConfig
    );
    assert.equal(
      platformConfigAccount.feeAmountNormal.toNumber(),
      2_000_000,
      "feeAmountNormal is wrong"
    );

    // fetch presale config
    const presaleConfigAccount = await program.account.presaleConfig.fetch(
      presaleConfig
    );
    assert.equal(
      presaleConfigAccount.creator.toBase58(),
      admin.toBase58(),
      "creator is wrong"
    );
    assert.equal(
      presaleConfigAccount.baseMint.toBase58(),
      baseMint.toBase58(),
      "baseMint is wrong"
    );
    assert.equal(
      presaleConfigAccount.decimals,
      configData.decimals,
      "decimals is wrong"
    );
    assert.equal(
      presaleConfigAccount.startTimestamp.toNumber(),
      configData.startTime.toNumber(),
      "startTime is wrong"
    );
    assert.equal(
      presaleConfigAccount.feePercent,
      configData.feePercent,
      "feePercent is wrong"
    );
    assert.equal(
      presaleConfigAccount.isFinalized,
      false,
      "isFinalized is wrong"
    );
  });

  describe("Buy Pretoken", () => {
    it("Round 1 - userA buy before start - fail", async () => {
      try {
        const txSig = await program.methods
          .buyPretoken(0, new anchor.BN(1000).mul(PRECISION))
          .accounts({
            presaleConfig,
            user: userA,
            userAllocation: getUserAllocation(userA),
            baseMint,
            vaultBaseTokenAccount,
            userBaseTokenAccount: userABaseTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([userAKeypair])
          .rpc();
        console.log(`Transaction Signature: ${txSig}`);
      } catch (err) {
        assert.equal(err.error.errorMessage, "Presale not started");
      }
    });

    it("Round 1 - userA buy with wrong round - fail", async () => {
      try {
        const txSig = await program.methods
          .buyPretoken(1, new anchor.BN(1000).mul(PRECISION))
          .accounts({
            presaleConfig,
            user: userA,
            userAllocation: getUserAllocation(userA),
            baseMint,
            vaultBaseTokenAccount,
            userBaseTokenAccount: userABaseTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([userAKeypair])
          .rpc();
        console.log(`Transaction Signature: ${txSig}`);
      } catch (err) {
        assert.equal(err.error.errorMessage, "Round not started");
      }
    });

    it("Round 1 - userA buy 100M - success", async () => {
      const presaleConfigAccount = await program.account.presaleConfig.fetch(
        presaleConfig
      );
      while (true) {
        if (
          presaleConfigAccount.startTimestamp <
          new anchor.BN(Math.floor(Date.now() / 1000) - 1)
        )
          break;
        console.log("waiting for presale starts ...");
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      const userAAllocation = getUserAllocation(userA);
      const txSig = await program.methods
        .buyPretoken(0, new anchor.BN(100_000_000).mul(PRECISION))
        .accounts({
          presaleConfig,
          user: userA,
          userAllocation: userAAllocation,
          baseMint,
          vaultBaseTokenAccount,
          userBaseTokenAccount: userABaseTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([userAKeypair])
        .rpc();
      console.log(`Transaction Signature: ${txSig}`);
      const userAAllocationAccount = await program.account.userAllocation.fetch(
        userAAllocation
      );
      assert.equal(
        userAAllocationAccount.amounts[0].toString(),
        new anchor.BN(100_000_000).mul(PRECISION).toString(),
        "amount is wrong"
      );
    });

    it("Round 1 - userB buy try 150M but receive 145M - success", async () => {
      const userBAllocation = getUserAllocation(userB);
      const txSig = await program.methods
        .buyPretoken(0, new anchor.BN(150_000_000).mul(PRECISION))
        .accounts({
          presaleConfig,
          user: userB,
          userAllocation: userBAllocation,
          baseMint,
          vaultBaseTokenAccount,
          userBaseTokenAccount: userBBaseTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([userBKeypair])
        .rpc();
      console.log(`Transaction Signature: ${txSig}`);
      const userBAllocationAccount = await program.account.userAllocation.fetch(
        userBAllocation
      );
      assert.equal(
        userBAllocationAccount.amounts[0].toString(),
        new anchor.BN(145_000_000).mul(PRECISION).toString(),
        "amount is wrong"
      );
    });

    it("Round 2 - userA buy 235M - success", async () => {
      const presaleConfigAccount = await program.account.presaleConfig.fetch(
        presaleConfig
      );
      assert.equal(
        presaleConfigAccount.currentRound,
        1,
        "currentRound is wrong"
      );

      const userAAllocation = getUserAllocation(userA);
      const userAAllocationAccountBefore =
        await program.account.userAllocation.fetch(userAAllocation);
      const txSig = await program.methods
        .buyPretoken(1, new anchor.BN(235_000_000).mul(PRECISION))
        .accounts({
          presaleConfig,
          user: userA,
          userAllocation: userAAllocation,
          baseMint,
          vaultBaseTokenAccount,
          userBaseTokenAccount: userABaseTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([userAKeypair])
        .rpc();
      console.log(`Transaction Signature: ${txSig}`);
      const userAAllocationAccountAfter =
        await program.account.userAllocation.fetch(userAAllocation);
      assert.equal(
        userAAllocationAccountAfter.amounts[1]
          .sub(userAAllocationAccountBefore.amounts[1])
          .toString(),
        new anchor.BN(235_000_000).mul(PRECISION).toString(),
        "amount is wrong"
      );
    });

    it("Round 3 - userA buy 215M - success", async () => {
      const presaleConfigAccount = await program.account.presaleConfig.fetch(
        presaleConfig
      );
      assert.equal(
        presaleConfigAccount.currentRound,
        2,
        "currentRound is wrong"
      );

      const userAAllocation = getUserAllocation(userA);
      const userAAllocationAccountBefore =
        await program.account.userAllocation.fetch(userAAllocation);
      const txSig = await program.methods
        .buyPretoken(2, new anchor.BN(215_000_000).mul(PRECISION))
        .accounts({
          presaleConfig,
          user: userA,
          userAllocation: userAAllocation,
          baseMint,
          vaultBaseTokenAccount,
          userBaseTokenAccount: userABaseTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([userAKeypair])
        .rpc();
      console.log(`Transaction Signature: ${txSig}`);
      const userAAllocationAccountAfter =
        await program.account.userAllocation.fetch(userAAllocation);
      assert.equal(
        userAAllocationAccountAfter.amounts[2]
          .sub(userAAllocationAccountBefore.amounts[2])
          .toString(),
        new anchor.BN(215_000_000).mul(PRECISION).toString(),
        "amount is wrong"
      );
    });

    it("Round 4 - userB buy 50M - success", async () => {
      const presaleConfigAccount = await program.account.presaleConfig.fetch(
        presaleConfig
      );
      assert.equal(
        presaleConfigAccount.currentRound,
        3,
        "currentRound is wrong"
      );

      const userBAllocation = getUserAllocation(userB);
      const userBAllocationAccountBefore =
        await program.account.userAllocation.fetch(userBAllocation);
      const txSig = await program.methods
        .buyPretoken(3, new anchor.BN(50_000_000).mul(PRECISION))
        .accounts({
          presaleConfig,
          user: userB,
          userAllocation: userBAllocation,
          baseMint,
          vaultBaseTokenAccount,
          userBaseTokenAccount: userBBaseTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([userBKeypair])
        .rpc();
      console.log(`Transaction Signature: ${txSig}`);
      const userBAllocationAccountAfter =
        await program.account.userAllocation.fetch(userBAllocation);
      assert.equal(
        userBAllocationAccountAfter.amounts[3]
          .sub(userBAllocationAccountBefore.amounts[3])
          .toString(),
        new anchor.BN(50_000_000).mul(PRECISION).toString(),
        "amount is wrong"
      );
    });

    it("Round 4 - userC buy 55M - success", async () => {
      const presaleConfigAccount = await program.account.presaleConfig.fetch(
        presaleConfig
      );
      assert.equal(
        presaleConfigAccount.currentRound,
        3,
        "currentRound is wrong"
      );

      const userCAllocation = getUserAllocation(userC);
      const txSig = await program.methods
        .buyPretoken(3, new anchor.BN(55_000_000).mul(PRECISION))
        .accounts({
          presaleConfig,
          user: userC,
          userAllocation: userCAllocation,
          baseMint,
          vaultBaseTokenAccount,
          userBaseTokenAccount: userCBaseTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([userCKeypair])
        .rpc();
      console.log(`Transaction Signature: ${txSig}`);
      const userCAllocationAccount = await program.account.userAllocation.fetch(
        userCAllocation
      );
      assert.equal(
        userCAllocationAccount.amounts[3].toString(),
        new anchor.BN(55_000_000).mul(PRECISION).toString(),
        "amount is wrong"
      );
    });
  });
  describe("Finalize", () => {
    it("Finalize - Presale not ended - fail", async () => {
      try {
        const txSig = await program.methods
          .finalizePresale()
          .accounts({
            presaleConfig,
            creator: admin,
            newMint,
            baseMint,
            vaultBaseTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            tokenProgram2022: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([adminKeypair])
          .rpc();
        console.log(`Transaction Signature: ${txSig}`);
      } catch (err) {
        assert.equal(err.error.errorMessage, "Presale not ended");
      }
    });

    it("Finalize - success", async () => {
      const presaleConfigAccount = await program.account.presaleConfig.fetch(
        presaleConfig
      );
      while (true) {
        if (
          presaleConfigAccount.startTimestamp.add(
            presaleConfigAccount.duration
          ) < new anchor.BN(Math.floor(Date.now() / 1000) - 1)
        )
          break;
        console.log("waiting for presale ends ...");
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      const txSig = await program.methods
        .finalizePresale()
        .accounts({
          presaleConfig,
          creator: admin,
          newMint,
          baseMint,
          vaultBaseTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenProgram2022: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([adminKeypair])
        .rpc();
      console.log(`Transaction Signature: ${txSig}`);
    });

    it("Claim - userA claim - success", async () => {
      const userAAllocation = getUserAllocation(userA);
      const userATokenAccount = pda(
        [USER_TOKEN_ACCOUNT_TAG, presaleConfig.toBuffer(), userA.toBuffer()],
        programId
      );
      const txSig = await program.methods
        .claimOrRefund()
        .accounts({
          presaleConfig,
          user: userA,
          userAllocation: userAAllocation,
          newMint,
          userTokenAccount: userATokenAccount,
          baseMint,
          vaultBaseTokenAccount,
          userBaseTokenAccount: userABaseTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenProgram2022: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([userAKeypair])
        .rpc();
      console.log(`Transaction Signature: ${txSig}`);
      let userABalance = (
        await getAccount(
          connection,
          userATokenAccount,
          "processed",
          TOKEN_2022_PROGRAM_ID
        )
      ).amount;
      console.log(userABalance.toString());
    });
  });
});
