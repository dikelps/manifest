use pinocchio::{account::AccountView, error::ProgramError, sysvars::rent::Rent, ProgramResult};
use solana_program::{keccak, pubkey, pubkey::Pubkey};
use solana_system_interface::instruction as system_instruction;

use crate::{program::invoke_signed, validation::AccountViewExt};

/// Upstream Manifest program ID retained as the ABI namespace. Keeping this
/// namespace makes Makerbook account and event bytes compatible with Manifest
/// while the runtime account owner remains Makerbook's distinct program ID.
const ABI_NAMESPACE: Pubkey = pubkey!("MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms");

/// Canonical discriminant of the given struct. It is the hash of the retained
/// ABI namespace and the name of the type.
pub fn get_discriminant<T>() -> Result<u64, ProgramError> {
    let type_name: &str = std::any::type_name::<T>();
    let discriminant: u64 = u64::from_le_bytes(
        keccak::hashv(&[ABI_NAMESPACE.as_ref(), type_name.as_bytes()]).as_ref()[..8]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    Ok(discriminant)
}

/// Send CPI for creating a new account on chain.
pub fn create_account<'a>(
    payer: &'a AccountView,
    new_account: &'a AccountView,
    // Kept in the signature so callers still pass the account the runtime
    // requires to be present; create_account names only the two below.
    _system_program: &'a AccountView,
    program_owner: &Pubkey,
    rent: &Rent,
    space: u64,
    seeds: Vec<Vec<u8>>,
) -> ProgramResult {
    invoke_signed(
        &system_instruction::create_account(
            payer.pubkey(),
            new_account.pubkey(),
            rent.try_minimum_balance(space as usize)?,
            space,
            program_owner,
        ),
        // create_account names the funder and the new account.
        &[payer, new_account],
        &[seeds
            .iter()
            .map(|seed| seed.as_slice())
            .collect::<Vec<&[u8]>>()
            .as_slice()],
    )
}

#[test]
fn test_get_discriminant() {
    // Update this when updating program id.
    assert_eq!(
        get_discriminant::<crate::state::MarketFixed>().unwrap(),
        4859840929024028656
    );
}
