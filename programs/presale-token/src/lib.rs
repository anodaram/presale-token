use anchor_lang::prelude::*;

declare_id!("3Nf68MDDEkjCLv3xGeedZkFVfRTC2Nz1viNHB19taXig");

#[program]
pub mod presale_token {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
