# Makerbook fork notice

Makerbook is a modified fork of Manifest, originally developed by CKS Systems /
Bonasa Tech and published at <https://github.com/Bonasa-Tech/manifest>.

This fork is based on upstream commit `ec9cd449`. Its on-chain behavioral change
is intentionally narrow: only the compile-time public key
`7Dzpq37VVnmar38oRvq5XhvfZXyg8DvHQRBUdxMiXBnb` may create persistent maker
state. This is one global maker identity, not a per-market key or a delegating
administrator. The authorization predicate is placed at the existing
`ClaimSeat` entry point; all later maker actions remain bound by upstream to
the signer that owns that state. Market creation, deposits, withdrawals,
matching, order handling, and
permissionless `Swap` / `SwapV2` taker execution retain the upstream code. The
fork uses the distinct program ID
`HcdpMTGRaKNaZEzRiPWyegVMzbw1rK92zhf6uDgBfGzJ`. It deliberately retains the
upstream discriminant namespace, so account layouts, event bytes, and client
decoders remain compatible.

CI compares the on-chain source with that pinned upstream commit and rejects
changes outside the program identity, ABI namespace, and maker-authorization
files. It also verifies that generated client differences are limited to
binding the unchanged upstream ABI to Makerbook's program address.

Manifest is distributed under GNU GPL version 3. This fork keeps the GPL
license, source, copyright notices, and attribution under the same terms.
Makerbook is independent and the upstream audit does not cover this fork's
authorization change.
