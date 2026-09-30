use crate::validation::AccountViewExt;
use pinocchio::{account::RefMut, ProgramResult};

use crate::{
    logs::{emit_stack, ClaimSeatLog},
    require,
    state::{MarketFixed, MarketRefMut},
    validation::{loaders::ClaimSeatContext, ManifestAccountInfo, Signer},
};
use pinocchio::account::AccountView;
use solana_program::{pubkey, pubkey::Pubkey};

use super::shared::{expand_market_if_needed, get_mut_dynamic_account};

/// The only identity allowed to create persistent maker state in Makerbook.
/// Public `Swap` and `SwapV2` takers use temporary IOC state and do not pass
/// through this instruction.
pub const AUTHORIZED_MAKER: Pubkey = pubkey!("7Dzpq37VVnmar38oRvq5XhvfZXyg8DvHQRBUdxMiXBnb");

#[inline(always)]
fn require_authorized_maker(maker: &Pubkey) -> ProgramResult {
    require!(
        maker == &AUTHORIZED_MAKER,
        pinocchio::error::ProgramError::InvalidAccountData,
        "Maker is not authorized",
    )
}

#[cfg(feature = "certora")]
use early_panic::early_panic;

#[cfg_attr(all(feature = "certora", not(feature = "certora-test")), early_panic)]
pub(crate) fn process_claim_seat(
    _program_id: &Pubkey,
    accounts: &[AccountView],
    _data: &[u8],
) -> ProgramResult {
    let claim_seat_context: ClaimSeatContext = ClaimSeatContext::load(accounts)?;
    let ClaimSeatContext { market, payer, .. } = claim_seat_context;

    process_claim_seat_internal(&market, &payer)?;

    // Leave a free block on the market
    expand_market_if_needed(&payer, &market)?;

    Ok(())
}

#[cfg_attr(all(feature = "certora", not(feature = "certora-test")), early_panic)]
pub(crate) fn process_claim_seat_internal<'a>(
    market: &ManifestAccountInfo<'a, MarketFixed>,
    payer: &Signer<'a>,
) -> ProgramResult {
    require_authorized_maker(payer.pubkey())?;

    let market_data: &mut RefMut<[u8]> = &mut market.try_borrow_mut()?;
    let mut dynamic_account: MarketRefMut = get_mut_dynamic_account(market_data);
    dynamic_account.claim_seat(payer.pubkey())?;

    emit_stack(ClaimSeatLog {
        market: *market.pubkey(),
        trader: *payer.pubkey(),
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maker_authorization_accepts_only_the_compiled_key() {
        assert!(require_authorized_maker(&AUTHORIZED_MAKER).is_ok());
        assert!(require_authorized_maker(&Pubkey::new_unique()).is_err());
    }
}
