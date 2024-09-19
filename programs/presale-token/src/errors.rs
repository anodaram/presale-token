use anchor_lang::prelude::*;

#[error_code]
pub enum PresaleTokenError {
    #[msg("Not implemented")]
    NotImplemented,

    #[msg("Invalid base mint")]
    InvalidBaseMint,

    #[msg("Invalid admin")]
    InvalidAdmin,

    #[msg("Invalid round")]
    InvalidRound,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Presale not started")]
    PresaleNotStarted,

    #[msg("Round not started")]
    RoundNotStarted,

    #[msg("Round ended")]
    RoundEnded,

    #[msg("Not final round")]
    NotFinalRound,

    #[msg("Presale not ended")]
    PresaleNotEnded,

    #[msg("Invalid creator")]
    InvalidCreator,

    #[msg("Presale already finalized")]
    PresaleAlreadyFinalized,

    #[msg("User already claimed or refunded")]
    UserAlreadyClaimedOrRefunded,

    #[msg("Presale not finalized")]
    PresaleNotFinalized,

    #[msg("Invalid new mint")]
    InvalidNewMint,
}
