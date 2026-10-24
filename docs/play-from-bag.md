# Play from a bag (design note — not built yet)

Goal: an AYB bag (#98) pays a Gear bot game's CAPH entry from its own 6551 wallet and receives winnings back.

## Constraint
The bag wallet (BagAccount6551, impl 0x8f850dfD…69Fe, unverified source) has **no generic `execute`**.
It can only `sendETH`, `sendERC20`, `sendERC721`, `sendERC1155`, stake/unstake and swap on AYB-listed venues.
So it **cannot `approve`** CAPHVault, which means `CAPHVault.pullFrom(player, …)` (transferFrom-based) will not work for a bag.
The only path is a **plain CAPH transfer** from the bag to the vault/game (`sendERC20(CAPH, vault, amount)`).

## Option A — small on-chain `BagEntry` contract (preferred)
Keep CAPHVault (0xc7d5…4ba4) untouched; add a `BagEntry` contract registered with `setGame`.
1. Holder calls the bag's `sendERC20(CAPH, BagEntry, fee)` (one signature).
2. Holder calls `BagEntry.enter(nft, tokenId)`. BagEntry checks `msg.sender == ownerOf(tokenId)`,
   computes unaccounted CAPH as `balanceOf(this) - accounted`, credits that to the bag, and forwards to CAPHVault via `deposit`.
   Front-running risk: someone else's stray transfer could be credited to a bag; harmless because
   **all winnings/refunds only ever go to `accountOf(tokenId)`**.
3. Winnings: game calls `CAPHVault.payout(accountOf(tokenId), amount, ref)` — `payout` already accepts any `to`.
4. Records: `HighScoreRecords.recordBotScore(nft, tokenId, …)` already exists.

## Option B — off-chain watcher
Bag sends CAPH to the vault with a known amount; an indexer watches `Transfer(from=bagAccount, to=vault)` events, verifies `from == accountOf(tokenId)` at that block, and the game server starts the run. Winnings paid via an authorised game wallet calling `payout(bagAccount, …)`. No new contract, but trust moves to the server.

## What's needed
1. AYB to verify the BagAccount6551 source (confirm `sendERC20` has no hidden limits).
2. Pick A or B; if A, write + test `BagEntry`, `setGame` it on CAPHVault from Cap's Ledger (admin only).
3. Wire the "Send to play" buttons on aybags to call the bag's `sendERC20(CAPH, entryTarget, fee)`.
