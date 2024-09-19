use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::*;
use constants::*;
use errors::*;
use states::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        seeds = [PLATFORM_CONFIG_TAG],
        bump,
        payer = platform_wallet,
        space = std::mem::size_of::<PlatformConfig>() + 8
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    pub fee_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub platform_wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(decimals: u8)]
pub struct InitializePresale<'info> {
    #[account(
        seeds = [PLATFORM_CONFIG_TAG],
        bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    /// CHECK: platform wallet
    #[account(address = platform_config.platform_wallet)]
    pub platform_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        seeds = [PRESALE_CONFIG_TAG, creator.key().as_ref()],
        bump,
        payer = creator,
        space = std::mem::size_of::<PresaleConfig>() + 8
    )]
    pub presale_config: Account<'info, PresaleConfig>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub base_mint: Box<InterfaceAccount<'info, Mint>>,

    pub new_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(address = platform_config.fee_mint)]
    pub fee_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = fee_mint,
        token::authority = creator
    )]
    pub creator_fee_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        token::mint = fee_mint,
        token::authority = platform_wallet,
        seeds = [PLATFORM_FEE_TOKEN_ACCOUNT_TAG],
        bump,
        payer = creator,
    )]
    pub platform_fee_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        token::mint = base_mint,
        token::authority = presale_config,
        seeds = [VAULT_BASE_TOKEN_ACCOUNT_TAG, presale_config.key().as_ref()],
        bump,
        payer = creator,
    )]
    pub vault_base_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuySellPretoken<'info> {
    #[account(
        mut,
        seeds = [PRESALE_CONFIG_TAG, presale_config.creator.as_ref()],
        bump,
    )]
    pub presale_config: Account<'info, PresaleConfig>,
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init_if_needed,
        seeds = [USER_ALLOCATION_TAG, presale_config.key().as_ref(), user.key().as_ref()],
        bump,
        payer = user,
        space = std::mem::size_of::<UserAllocation>() + 8
    )]
    pub user_allocation: Account<'info, UserAllocation>,

    #[account(
        constraint = base_mint.key() == presale_config.base_mint @ PresaleTokenError::InvalidBaseMint
    )]
    pub base_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = base_mint,
        token::authority = presale_config,
    )]
    pub vault_base_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = base_mint,
        token::authority = user,
    )]
    pub user_base_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizePresale<'info> {
    #[account(
        mut,
        seeds = [PRESALE_CONFIG_TAG, presale_config.creator.as_ref()],
        bump,
    )]
    pub presale_config: Account<'info, PresaleConfig>,

    #[account(
        mut,
        constraint = creator.key() == presale_config.creator @ PresaleTokenError::InvalidCreator
    )]
    pub creator: Signer<'info>,

    pub new_mint: InterfaceAccount<'info, Mint>,

    #[account(
        constraint = base_mint.key() == presale_config.base_mint @ PresaleTokenError::InvalidBaseMint
    )]
    pub base_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = base_mint,
        token::authority = presale_config,
    )]
    pub vault_base_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program_2022: Interface<'info, TokenInterface>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimOrRefund<'info> {
    #[account(
        mut,
        seeds = [PRESALE_CONFIG_TAG, presale_config.creator.as_ref()],
        bump,
    )]
    pub presale_config: Account<'info, PresaleConfig>,
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [USER_ALLOCATION_TAG, presale_config.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub user_allocation: Account<'info, UserAllocation>,

    #[account(
        mut,
        constraint = new_mint.key() == presale_config.new_mint @ PresaleTokenError::InvalidNewMint
    )]
    pub new_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init_if_needed,
        token::token_program = token_program_2022,
        token::mint = new_mint,
        token::authority = user,
        seeds = [USER_TOKEN_ACCOUNT_TAG, presale_config.key().as_ref(), user.key().as_ref()],
        bump,
        payer = user,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        constraint = base_mint.key() == presale_config.base_mint @ PresaleTokenError::InvalidBaseMint
    )]
    pub base_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = base_mint,
        token::authority = presale_config,
    )]
    pub vault_base_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = base_mint,
        token::authority = user,
    )]
    pub user_base_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub token_program_2022: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}
