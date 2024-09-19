use crate::*;

use anchor_spl::token_2022::{mint_to, transfer_checked, MintTo, TransferChecked};
use constants::*;
use errors::*;
use events::*;
use states::*;

impl<'info> Initialize<'info> {
    pub fn initialize(&mut self) -> Result<()> {
        let platform_config = &mut self.platform_config;
        platform_config.platform_wallet = self.platform_wallet.key();
        platform_config.fee_mint = self.fee_mint.key();
        platform_config.fee_amount_normal = 2_000_000;
        platform_config.fee_amount_special = 10_000_000;

        Ok(())
    }
}

impl<'info> InitializePresale<'info> {
    pub fn initialize_presale(
        &mut self,
        decimals: u8,
        start_timestamp: u64,
        duration: u64,
        round_amounts: [u64; ROUND_COUNT],
        round_prices: [u64; ROUND_COUNT],
        liquidity_amount: u64,
        target_amount: u64,
        fee_percent: u16,
    ) -> Result<()> {
        let presale_config = &mut self.presale_config;
        presale_config.creator = self.creator.key();
        presale_config.base_mint = self.base_mint.key();
        presale_config.new_mint = self.new_mint.key();
        presale_config.decimals = decimals;
        presale_config.current_round = 0;
        presale_config.start_timestamp = start_timestamp;
        presale_config.duration = duration;
        presale_config.liquidity_amount = liquidity_amount;
        presale_config.target_amount = target_amount;
        presale_config.total_return_amount = 0;
        presale_config.fee_percent = fee_percent;
        presale_config.is_finalized = false;
        presale_config.is_success = false;

        for i in 0..ROUND_COUNT {
            presale_config.round_configs[i] = RoundConfig {
                round_end_time: 0,
                round_total_amount: round_amounts[i],
                remained_amount: round_amounts[i],
                price: round_prices[i],
            };
        }

        let is_special = false; // TODO: need to check if symbol name ends with "safe"
        let fee_amount = if is_special {
            self.platform_config.fee_amount_special
        } else {
            self.platform_config.fee_amount_normal
        };

        // transfer fee
        transfer_checked(
            CpiContext::new(
                self.token_program.to_account_info(),
                TransferChecked {
                    from: self.creator_fee_token_account.to_account_info(),
                    to: self.platform_fee_token_account.to_account_info(),
                    mint: self.fee_mint.to_account_info(),
                    authority: self.creator.to_account_info(),
                },
            ),
            fee_amount,
            self.fee_mint.decimals,
        )?;

        Ok(())
    }
}

impl<'info> BuySellPretoken<'info> {
    pub fn buy_pretoken(&mut self, round: u8, mut amount: u64) -> Result<()> {
        if round >= ROUND_COUNT as u8 {
            return Err(PresaleTokenError::InvalidRound.into());
        }

        let presale_config = &mut self.presale_config;

        let round_config = presale_config.round_configs[round as usize];
        if amount == 0 {
            return Err(PresaleTokenError::InvalidAmount.into());
        }

        let amount_limit = if round < ROUND_COUNT as u8 - 1 {
            round_config.remained_amount
        } else {
            round_config.remained_amount + presale_config.total_return_amount
        };
        if amount > amount_limit {
            amount = amount_limit;
        }

        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp as u64;

        if round > presale_config.current_round {
            return Err(PresaleTokenError::RoundNotStarted.into());
        }

        if round < presale_config.current_round {
            return Err(PresaleTokenError::RoundEnded.into());
        }

        if round == 0 && current_timestamp < presale_config.start_timestamp {
            return Err(PresaleTokenError::PresaleNotStarted.into());
        }

        let _amount_for_returned: u64 = if round == ROUND_COUNT as u8 - 1 {
            std::cmp::min(amount, presale_config.total_return_amount)
        } else {
            0
        };
        let mut _amount_for_round: u64 = amount - _amount_for_returned;

        let new_remained_amount = round_config.remained_amount - _amount_for_round;

        presale_config.round_configs[round as usize].remained_amount = new_remained_amount;
        presale_config.total_return_amount -= _amount_for_returned;
        presale_config.total_buy_amount = presale_config.total_buy_amount + amount;

        if new_remained_amount == 0 {
            presale_config.current_round = presale_config.current_round + 1;
        }

        let base_amount = (((amount as u128) * (round_config.price as u128) + PRECISION as u128
            - 1)
            / PRECISION as u128) as u64;

        // transfer base amount
        transfer_checked(
            CpiContext::new(
                self.token_program.to_account_info(),
                TransferChecked {
                    from: self.user_base_token_account.to_account_info(),
                    to: self.vault_base_token_account.to_account_info(),
                    mint: self.base_mint.to_account_info(),
                    authority: self.user.to_account_info(),
                },
            ),
            base_amount,
            self.base_mint.decimals,
        )?;

        // update allocation
        let user_allocation = &mut self.user_allocation;
        user_allocation.amounts[round as usize] = user_allocation.amounts[round as usize] + amount;
        // user_allocation.base_amount = user_allocation.base_amount + base_amount;

        Ok(())
    }

    pub fn sell_pretoken(&mut self, round: u8, amount: u64, presale_config_bump: u8) -> Result<()> {
        if round >= ROUND_COUNT as u8 {
            return Err(PresaleTokenError::InvalidRound.into());
        }

        let presale_config = &mut self.presale_config;
        let user_allocation = &mut self.user_allocation;

        let round_config = presale_config.round_configs[round as usize];
        if amount == 0 {
            return Err(PresaleTokenError::InvalidAmount.into());
        }
        if amount > user_allocation.amounts[round as usize] {
            return Err(PresaleTokenError::InvalidAmount.into());
        }

        if round > presale_config.current_round {
            return Err(PresaleTokenError::RoundNotStarted.into());
        }

        if round == presale_config.current_round && round != ROUND_COUNT as u8 - 1 {
            return Err(PresaleTokenError::NotFinalRound.into());
        }

        let new_remained_amount = round_config.remained_amount + amount;

        presale_config.round_configs[round as usize].remained_amount = new_remained_amount;
        presale_config.total_buy_amount = presale_config.total_buy_amount - amount;

        let base_amount =
            ((amount as u128 * round_config.price as u128) / (PRECISION as u128)) as u64;
        let fee_amount = (base_amount as u128 * presale_config.fee_percent as u128
            / PERCENT_DENOMINATOR as u128) as u64;
        let return_base_amount = base_amount - fee_amount;

        let signer_seeds: &[&[&[u8]]] = &[&[
            PRESALE_CONFIG_TAG,
            presale_config.creator.as_ref(),
            &[presale_config_bump],
        ]];

        // transfer base amount
        transfer_checked(
            CpiContext::new(
                self.token_program.to_account_info(),
                TransferChecked {
                    from: self.vault_base_token_account.to_account_info(),
                    to: self.user_base_token_account.to_account_info(),
                    mint: self.base_mint.to_account_info(),
                    authority: self.user.to_account_info(),
                },
            )
            .with_signer(signer_seeds),
            return_base_amount,
            self.base_mint.decimals,
        )?;

        presale_config.total_return_amount += amount;

        // update allocation
        user_allocation.amounts[round as usize] = user_allocation.amounts[round as usize] - amount;
        // user_allocation.base_amount = user_allocation.base_amount + base_amount;

        Ok(())
    }
}

impl<'info> FinalizePresale<'info> {
    pub fn finalize_presale(&mut self) -> Result<()> {
        let presale_config = &mut self.presale_config;

        if presale_config.is_finalized {
            return Err(PresaleTokenError::PresaleAlreadyFinalized.into());
        }

        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp as u64;

        let presale_end_timestamp = presale_config.start_timestamp + presale_config.duration;
        if current_timestamp < presale_end_timestamp {
            return Err(PresaleTokenError::PresaleNotEnded.into());
        }
        presale_config.is_finalized = true;

        if presale_config.total_buy_amount >= presale_config.target_amount {
            presale_config.is_success = true;

            // TODO: add liquidity token
        }

        Ok(())
    }
}

impl<'info> ClaimOrRefund<'info> {
    pub fn claim_or_refund(&mut self, presale_config_bump: u8) -> Result<()> {
        let presale_config = &mut self.presale_config;
        let user_allocation = &mut self.user_allocation;

        if !presale_config.is_finalized {
            return Err(PresaleTokenError::PresaleNotFinalized.into());
        }
        if user_allocation.is_proceeded {
            return Err(PresaleTokenError::UserAlreadyClaimedOrRefunded.into());
        }

        user_allocation.is_proceeded = true;
        let signer_seeds: &[&[&[u8]]] = &[&[
            PRESALE_CONFIG_TAG,
            presale_config.creator.as_ref(),
            &[presale_config_bump],
        ]];

        if presale_config.is_success {
            let total_amount = user_allocation.total_amount();
            // claim
            mint_to(
                CpiContext::new(
                    self.token_program_2022.to_account_info(),
                    MintTo {
                        mint: self.new_mint.to_account_info(),
                        to: self.user_token_account.to_account_info(),
                        authority: presale_config.to_account_info(),
                    },
                )
                .with_signer(signer_seeds),
                total_amount,
            )?;
        } else {
            // we don't need refund feature for now
            return Err(PresaleTokenError::NotImplemented.into());

            // refund
            // let base_amount = user_allocation.base_amount;
            // let fee = base_amount * (presale_config.fee_percent as u64) / PERCENT_DENOMINATOR;
            // let refund_amount = base_amount - fee;

            // transfer_checked(
            //     CpiContext::new(
            //         self.token_program.to_account_info(),
            //         TransferChecked {
            //             from: self.vault_base_token_account.to_account_info(),
            //             to: self.user_base_token_account.to_account_info(),
            //             mint: self.base_mint.to_account_info(),
            //             authority: self.user.to_account_info(),
            //         },
            //     )
            //     .with_signer(signer_seeds),
            //     refund_amount,
            //     self.base_mint.decimals,
            // )?;
        }

        Ok(())
    }
}
