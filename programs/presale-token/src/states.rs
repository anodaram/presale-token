use anchor_lang::prelude::*;

use crate::*;
use constants::*;

#[account]
#[derive(Default)]
pub struct PlatformConfig {
    pub platform_wallet: Pubkey,
    pub fee_mint: Pubkey,
    pub fee_percent: u16,
    pub fee_amount_normal: u64,
    pub fee_amount_special: u64,
}

#[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize, Default)]
pub struct RoundConfig {
    pub round_end_time: u64,
    pub round_total_amount: u64,
    pub remained_amount: u64,
    pub price: u64,
}

#[account]
#[derive(Default)]
pub struct PresaleConfig {
    pub creator: Pubkey,
    pub base_mint: Pubkey,
    pub new_mint: Pubkey,
    pub decimals: u8,
    pub round_configs: [RoundConfig; ROUND_COUNT],
    pub current_round: u8,
    pub start_timestamp: u64,
    pub duration: u64,
    pub liquidity_amount: u64,
    pub target_amount: u64,
    pub total_buy_amount: u64,
    pub total_return_amount: u64,
    pub fee_percent: u16,
    pub is_finalized: bool,
    pub is_success: bool,
}

#[account]
#[derive(Default)]
pub struct UserAllocation {
    pub amounts: [u64; ROUND_COUNT],
    // pub base_amount: u64, // no need for now
    pub is_proceeded: bool,
}

impl UserAllocation {
    pub fn total_amount(&self) -> u64 {
        self.amounts.iter().sum()
    }
}
