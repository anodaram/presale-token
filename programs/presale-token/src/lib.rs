use anchor_lang::prelude::*;

declare_id!("3Nf68MDDEkjCLv3xGeedZkFVfRTC2Nz1viNHB19taXig");

pub mod constants;
pub mod contexts;
pub mod errors;
pub mod events;
mod processors;
pub mod states;
pub mod utils;

use constants::*;
use contexts::*;
use utils::*;

#[program]
pub mod presale_token {
    use constants::ROUND_COUNT;

    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.initialize()
    }

    pub fn initialize_presale(
        ctx: Context<InitializePresale>,
        decimals: u8,
        start_timestamp: u64,
        duration: u64,
        round_prices: [u64; ROUND_COUNT],
        fee_percent: u16,
    ) -> Result<()> {
        let multiplier = 10_u64.pow(decimals as u32);
        let total_supply = 1_000_000_000 as u64 * multiplier; // 1B token
        let round_amounts: [u64; 4] = [
            245_000_000 as u64 * multiplier,
            235_000_000 as u64 * multiplier,
            215_000_000 as u64 * multiplier,
            105_000_000 as u64 * multiplier,
        ];
        let target_amount =
            round_amounts[0] + round_amounts[1] + round_amounts[2] + round_amounts[3];
        let liquidity_amount = total_supply - target_amount;
        ctx.accounts.initialize_presale(
            decimals,
            start_timestamp,
            duration,
            round_amounts,
            round_prices,
            liquidity_amount,
            target_amount,
            fee_percent,
        )
    }

    pub fn buy_pretoken(ctx: Context<BuySellPretoken>, round: u8, amount: u64) -> Result<()> {
        ctx.accounts.buy_pretoken(round, amount)
    }

    pub fn sell_pretoken(ctx: Context<BuySellPretoken>, round: u8, amount: u64) -> Result<()> {
        ctx.accounts
            .sell_pretoken(round, amount, ctx.bumps.presale_config)
    }

    pub fn finalize_presale(ctx: Context<FinalizePresale>) -> Result<()> {
        ctx.accounts.finalize_presale()
    }

    pub fn claim_or_refund(ctx: Context<ClaimOrRefund>) -> Result<()> {
        ctx.accounts.claim_or_refund(ctx.bumps.presale_config)
    }
}
