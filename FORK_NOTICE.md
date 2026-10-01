# Makerbook fork notice

Makerbook is a modified fork of Manifest, originally developed by CKS Systems /
Bonasa Tech and published at <https://github.com/Bonasa-Tech/manifest>.

This fork is based on upstream commit
`ec9cd449857c837a993e348df8b734dfc3717a49`. Its on-chain behavioral change
is intentionally narrow: only the compile-time public key
`7Dzpq37VVnmar38oRvq5XhvfZXyg8DvHQRBUdxMiXBnb` may create persistent maker
state. This is one global maker identity, not a per-market key or a delegating
administrator. The authorization predicate is placed at the existing
`ClaimSeat` entry point; all later maker actions remain bound by upstream to
the signer that owns that state. Market creation, deposits, withdrawals,
matching, order handling, and permissionless `Swap` / `SwapV2` taker execution
retain the upstream code. The
fork uses the distinct program ID
`HcdpMTGRaKNaZEzRiPWyegVMzbw1rK92zhf6uDgBfGzJ`. It deliberately retains the
upstream discriminant namespace, so account layouts, event bytes, and client
decoders retain their upstream byte formats. Account ownership and vault/global
PDA derivation use Makerbook's program ID; integrations must bind to that ID.

CI compares the core program, shared tree library, Cargo manifests/lockfile,
and toolchain settings with that pinned upstream commit. Only three core source
files may differ: `lib.rs` (program identity and security metadata), `utils.rs`
(retained ABI namespace), and `program/processor/claim_seat.rs` (maker admission).
Those changes are reviewed in the PR. CI also verifies that generated IDL and
TypeScript instruction bindings differ only by the program-ID substitution and
formatting.

Manifest is distributed under GNU GPL version 3. This fork keeps the GPL
license, source, copyright notices, and attribution under the same terms.
Makerbook is independent and the upstream audit does not cover this fork's
authorization change.
