# AYB Bag Coin Pusher — arcade design (v2, nothing built)

An **arcade** coin pusher for AYB bags. Bags trade approved tokens for **real GEAR**, push GEAR coins on a stacked shelf, and win GEAR coins (and prize NFTs) that fall into the bin.

Status: design only. No contracts deployed, no transactions sent.

---

## 1. Player flow

1. **Connect** wallet on aybags (read-only). Page reads the bag: `ownerOf`, live `accountOf(bagId)`.
2. **Load tokens**: holder signs `bag.sendERC20(token, inboxOf(bagId), amount)` — the bag's own wallet sends approved tokens to its personal inbox.
3. **Get GEAR**: holder (or anyone) calls `exchange(bagId)`. The contract values the tokens, sends **5% to the house**, and sends **real GEAR** worth the other 95% **to the bag's wallet**.
4. **Play**: holder signs `bag.sendERC20(GEAR, pusher, coins)` then `drop(bagId, lane, phase)` — or one GEAR load covers many drops (see §5).
5. **Win**: GEAR coins pushed into the bin are paid as **GEAR to the bag**. A prize NFT pushed into the bin is sent **to the bag**.

## 2. Pieces

| Piece | Job |
|---|---|
| **Inbox (per bag)** | Tiny CREATE2 address per bagId. Only receives tokens; `exchange` sweeps it. Stops one bag claiming another's deposit. |
| **Exchange** | Prices deposits, takes 5%, pays GEAR from the reserve, routes deposited tokens into GEAR liquidity. |
| **GEAR Reserve** | Holds the GEAR used for exchange + pusher payouts. |
| **Pusher** | Shelf state, drops, randomness, payouts (GEAR only). |
| **NFT Dispenser** | Holds prize NFTs, drops them onto the shelf as special pieces. |
| **Frontend** | 3D shelf (Three.js, Meshy coins/bag/prizes) that replays on-chain results. |

Admin for everything: **Cap's Ledger 0xD838…EAca only** (Safe later). Timelock on settings; instant pause.

## 3. Verified bags only

A deposit or drop counts only for `bagId` where the sender/inbox is tied to
`NFT(0xb0f3dcaf6be094559213089bd14299f5103cf964).accountOf(bagId)`, cross-checked with the ERC-6551 registry (`0x0000…5758`, `bindingOf(bagId)`, chain 8453). No credit while `isMigrating(bagId)`.

Why an inbox: the bag wallet has **no `approve` / generic `execute`**, only `sendERC20`/`sendETH`. A plain transfer doesn't tell the receiver who sent it, so each bag gets its own inbox address.

## 4. Exchange: tokens → GEAR

**Approved tokens** (start): USDC, WETH (ETH wrapped by the inbox), AYB. GEAR/CAPH-adjacent tokens later.

**Pricing**
- Each token priced in USD via **Aerodrome TWAP** (≥30 min) with spot-vs-TWAP deviation check, **liquidity floor** per pool, **max per tx / per bag per day**.
- **GEAR itself** is priced from the **GEAR/WETH (or GEAR/USDC) pool TWAP**. This is the weakest link: GEAR's pool depth limits everything. Rules:
  - If GEAR pool liquidity < floor, exchange pauses.
  - Exchange size per tx ≤ a small % of GEAR pool depth (e.g. 0.5%).
  - Use the **less favourable** of TWAP vs spot for the player, so pumping GEAR or the deposit token can't drain the reserve.
- `GEAR out = value_in × 0.95 ÷ GEAR price`. 5% (in the deposited token) → house treasury.

**Where deposited tokens go: liquidity**
- The 95% of deposited tokens is paired with GEAR from the reserve and **added to Aerodrome GEAR/<token> pools** (GEAR/USDC, GEAR/WETH, GEAR/AYB), creating swap routes for all pairs. Can be done per deposit (gas-heavy) or batched by a keeper/Ledger.
- **LP positions are owned by Cap's Ledger** (or a Ledger-controlled LP vault contract that can only add liquidity or return LP to the Ledger). The game contracts never hold withdrawable LP.
- Note: adding liquidity needs GEAR on the other side → it draws on the reserve too. Budget that.

## 5. The pusher (GEAR coins)

- 1 coin = a fixed GEAR amount (e.g. 1,000 GEAR). Loading N coins = sending N × that to the pusher; balance tracked per bagId so many drops can follow one load.
- **Shelf**: 5 lanes, each with coin count + **edge pressure** (0–100). Coins stack between drops; ripe lanes are visible to all.
- **Drop**: pick lane + pusher phase. **Skill** (reading pressure, timing) raises the chance of a big push; **randomness** decides exact fall count. Arcade feel: skilled play matters, but nothing is guaranteed.
- **Bin**: coins that fall are paid in **GEAR to the bag wallet**. Side gutters return nothing (like real pushers) — this is the house edge on play.
- **Caps**: per-drop max, per-bag daily max, global daily max. **Payout never exceeds the GEAR reserve** (Cap accepts: if reserve runs short, payouts shrink and that's a reserve-management signal).

## 6. NFT Dispenser

- **Deposit**: only the Ledger deposits prize NFTs (ERC-721/1155) into the Dispenser.
- **One at a time**: at most one prize NFT is on the shelf. When it's won (or after a set number of drops with no win, optionally) the next can drop.
- **When it drops**: chosen by randomness (e.g. after a random 20–80 drops, or a % chance per drop), never by the frontend.
- **On the shelf**: it's a special piece in a lane with its own edge position; pushes move it like coins.
- **Win**: when it crosses the edge into the bin, the Dispenser sends that exact NFT to the **pushing bag's wallet**. Gutter = it returns to the dispenser.
- Ledger can withdraw undrawn NFTs; never one currently on the shelf.

## 7. Anti-cheat

- Outcomes computed **on-chain only**; the 3D view just replays.
- **Commit → reveal**: `drop` records lane/phase and spends the coin; result settles with **Chainlink VRF** or **Pyth Entropy** (what AYB uses). Same-block hash only on testnet.
- One pending drop per bag; only `ownerOf(bagId)` can drop; rate limits.
- Shelf state is shared, so outcomes depend on the pile at settle time — no re-rolls.

## 8. GEAR to bag or player wallet?

**Recommend: the bag.** Keeps everything tied to the NFT (good for AYB levels/mask), one flow, no mixing with EOAs. The holder can withdraw GEAR any time with `sendERC20` on aybags. Downside: an extra step to use GEAR elsewhere, and if the bag is sold, its GEAR goes with it (frontend warns).

## 9. GEAR reserve funding

- Seeded by Cap/Ledger with GEAR (amount TBD).
- Refilled by: gutter losses on the pusher, a share of LP fees, Ledger top-ups.
- Dashboard on aybags: reserve balance, GEAR owed per day, pool depths. If reserve < threshold → exchange pauses first (protects payouts).

## 10. Arcade framing (legal, briefly)

Arcade = buy play tokens, skill-influenced play, win play tokens/prizes. But **GEAR is a tradable token with a market price**, so regulators may still see buy-in + chance + valuable prize as gambling. Keep it arcade-like: fixed coin price, visible skill element, prize caps, no "cash out" language, ToS + region note. Not legal advice — worth a quick check before mainnet.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Price manipulation (deposit token or GEAR) | TWAP + deviation, liquidity floors, worse-of pricing, per-tx caps tied to GEAR pool depth |
| Reserve runs dry | Payout ≤ reserve, daily caps, exchange pauses first, dashboard |
| LP impermanent loss / GEAR sell pressure | Ledger-owned LP, batched adds, monitor |
| Bag sold mid-game | Balances/pending drops keyed to bagId; winnings go to current `accountOf` |
| Bag wallet migration | Read `accountOf` live; block while migrating |
| Unverified bag wallet code | Only uses `sendERC20`; ask AYB to verify |
| Gas / VRF fees | Base is cheap; fee baked into coin price or batched |
| Admin key | Ledger only, timelock, pause |

## 12. Phased plan

1. Odds + reserve simulation (Monte Carlo) and numbers locked.
2. **Base Sepolia**: mock bag NFT + real 6551 registry, inboxes, mock GEAR + pools, VRF testnet, Dispenser with test NFTs. Foundry tests for manipulation, reserve exhaustion, bag transfer mid-drop.
3. 3D pusher on aybags against testnet.
4. Mainnet soft launch: USDC only, tiny caps, small reserve; Cap's first test from bag #98 with $1.
5. Add WETH/AYB, LP routing, NFT Dispenser; raise caps after clean data.
