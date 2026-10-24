# AYB Bag Coin Pusher — design (draft, nothing built)

A coin pusher that only AYB bags can play. Bags feed liquid tokens in, get pusher coins, drop them on a stacked shelf, and coins that fall off pay back to the bag's own wallet.

Status: design only. No contracts deployed, no transactions sent.

---

## 1. Pieces

| Piece | What it does |
|---|---|
| **PusherVault** | Holds the prize pile (allow-listed tokens). Credits deposits, pays winnings, takes the 5% house cut. |
| **PusherGame** | Pile state, drops, randomness, odds, caps. Only it can tell the vault to pay. |
| **PriceGuard** | Reads Aerodrome pool TWAPs, checks liquidity floors, converts token → GEAR value. |
| **Frontend (aybags)** | 3D shelf (Three.js / Meshy coin + bag), replays the on-chain result. Never decides outcomes. |

Admin for all three: **Cap's Ledger 0xD838…EAca only** (ideally behind a Safe later). No other keys.

## 2. Who can play: verified bags only

The AYB bag wallet (BagAccount6551) has **no `approve` and no generic `execute`** — only `sendETH`, `sendERC20`, `sendERC721`, `sendERC1155` (+ stake/swap on AYB-listed venues). So the only way in is a **plain token transfer** from the bag to the vault.

A sender counts as a bag only if:
```
sender == NFT(0xb0f3dcaf6be094559213089bd14299f5103cf964).accountOf(bagId)
```
read live at credit time (handles migrations). Cross-check with the ERC-6551 registry
(`0x000000006551c19487814612e58FE06813775758.account(impl, salt, 8453, NFT, bagId)` using `bindingOf(bagId)`).

### Detecting a deposit (bag can't call us)
ERC-20 `transfer` gives the receiver no callback, so the vault can't see *who* sent. Options:

| Option | How | Verdict |
|---|---|---|
| **A. Balance-delta credit** | Holder calls `bag.sendERC20(token, vault, amt)`, then `credit(bagId, token)`. Vault credits `balanceOf(vault) − accounted[token]`. | Simple, but **anyone's stray transfer could be credited to whichever bag calls first.** Also anyone could credit a non-bag's transfer to their bag. ❌ alone |
| **B. Credit + Transfer proof** | `credit(bagId, token, txHash/logIndex)` checked against a receipt proof. | Heavy on-chain (receipt proofs on L2 are messy). ❌ |
| **C. Per-bag deposit box (recommended)** | Vault deploys a tiny CREATE2 **inbox per bag** (`inboxOf(bagId)`). Bag sends to its inbox; `credit(bagId)` sweeps the inbox into the vault. Only that bag's holder/bag ever learns to send there; a stranger sending to it just gifts that bag. | ✅ No front-running of value between bags. |
| **D. Off-chain watcher** | Indexer sees `Transfer(from=bagAccount, to=vault)` and signs a credit. | Works, but trusts a server. Backup only. |

Recommendation: **C**. `credit` checks `msg.sender == ownerOf(bagId)` (or anyone, since value only goes to that bag) and the inbox only holds allow-listed tokens; non-listed tokens can be rescued back to the bag.

## 3. Allowed tokens & pricing

Allow-list (start small): **USDC, WETH (ETH wrapped by the bag first or via sendETH to inbox that wraps), AYB**. Maybe **GEAR, CAPH** later if their pools are deep enough.

PriceGuard per token:
- **Aerodrome pool TWAP** (≥30 min) vs spot: if they differ > X% (e.g. 3%), deposits pause for that token.
- **Liquidity floor**: pool must hold ≥ $N (e.g. $50k) of the quote side, else token is disabled.
- **Max deposit per tx** and **per bag per day** (e.g. $50 / $200) — limits what a manipulator can extract.
- USDC priced at $1 (with a sanity band), ETH via WETH/USDC pool.
- Value is **converted to GEAR-equivalent** via the GEAR/WETH (or GEAR/USDC) TWAP.

## 4. House cut

On every credit: **5% of the deposited tokens goes straight to the treasury** (same token, same tx). The other 95% joins the prize pile. Treasury address set by Ledger, changes timelocked.

## 5. Pusher coins: internal credits vs real GEAR

| | Internal credits (recommended) | Real GEAR tokens |
|---|---|---|
| What the bag gets | A number in the contract: `coins[bagId]` | GEAR minted/sent to the bag |
| Needs GEAR supply | No | Yes — someone must fund GEAR inventory |
| Gas | Cheap | Extra transfers |
| Resale/abuse | Can't be traded, only played | Can be dumped; becomes a GEAR sell path |
| Moves with the NFT | Yes (keyed to bagId) | Yes (sits in the bag wallet) |

Recommendation: **internal credits, priced in GEAR value** (1 coin = fixed GEAR amount, e.g. 1,000 GEAR worth). GEAR still gets used as the unit and in payouts if listed, without the game needing a GEAR stockpile.

## 6. The pusher

### Pile model (on-chain, simplified)
- Shelf has **5 lanes**. Each lane stores: coin count and an **edge pressure** value (0–100) = how close the front of that lane is to the drop edge.
- A drop: player picks a **lane** and a **timing** window (pusher phase 0–9). Neighbouring lanes get a share of the push.
- Coins pile up between drops (stackable) — a full lane makes pressure rise, so lanes "ripen" for everyone to see.

### Skill + randomness
- **Skill**: hitting the lane with the highest pressure at the right pusher phase gives a better *chance* (e.g. up to +40% vs a blind drop). Pressure is public, so reading the shelf is the skill.
- **Randomness** decides how many coins actually fall: `fall = f(pressure, aim bonus, random)`.
- The frontend animates exactly the on-chain result.

### Anti-cheat
- Outcome is **never computed in the browser**.
- **Commit → reveal**: `drop(bagId, lane, phase)` records the request; randomness comes from **Chainlink VRF on Base** (preferred) or **Pyth Entropy** (AYB already uses it), *not* the same-block hash. A future blockhash fallback is weaker on Base (sequencer can see it) — only for testnet.
- One pending drop per bag; drop is resolved against pile state **at resolve time** with the coin already spent, so no re-rolling.
- Rate limits per bag; caller must be `ownerOf(bagId)`.

### Odds & sustainability
- Target **return-to-player ≈ 90%** of coins in over time (house 5% on deposit + ~10% game edge, tunable); simulated before launch (Monte Carlo in repo).
- **Per-drop cap** (e.g. max 20 coins out), **per-bag daily cap**, **global daily cap**.
- **Payout ≤ vault**: every payout = min(won, caps, what the vault actually holds). Pile pressure decays if the vault is low.

## 7. Payouts

Each coin that falls is worth its GEAR value, paid **split evenly by value across the vault's current token mix** (e.g. pile is 50% USDC / 30% AYB / 20% WETH → payout in that ratio). Sent with plain `transfer` to the **current `accountOf(bagId)`** — never to the player's EOA. Fractional dust stays in the vault.

## 8. Risks

| Risk | Mitigation |
|---|---|
| **Oracle manipulation** (pump token, deposit, win more) | TWAP + spot deviation check, liquidity floor, per-tx/day deposit caps, payout in mix not chosen token. |
| **Solvency** (payouts > pile) | Payout capped by vault balance; daily caps; edge sim; pause switch. |
| **Bag transferred mid-game** | Credits and pending drops are keyed to `bagId`, winnings go to the bag wallet — the new holder gets them. Frontend warns before selling. Optionally freeze drops for N blocks after a transfer. |
| **Migration** of a bag's wallet | Always read `accountOf` live; refuse credit while `isMigrating(bagId)`. |
| **Unverified bag wallet code** | Only uses plain `sendERC20`; still wait for AYB to verify source. |
| **AYB transfer rule** (7702 wallets can't send the NFT directly) | Doesn't affect play; note for Cap's wallet 0x5559…4507. |
| **Gas** | Base is cheap; VRF fee per drop (~cents) — charge it in coins or batch drops. |
| **Admin key** | Ledger only; timelock on token list, odds, treasury; pause is instant. |
| **Legal** | Wagering on tokens may be gambling in some places — Cap to decide geo/ToS. |

## 9. Open questions for Cap

1. Start tokens: USDC + WETH + AYB only, or GEAR/CAPH too?
2. Coin unit: how much GEAR value per coin? Min/max deposit?
3. Target return (90%?) and caps (per drop / per day)?
4. VRF provider: Chainlink VRF or Pyth Entropy (what AYB uses)?
5. Can bags cash out unused coins (minus fee), or coins are play-only?
6. Treasury address for the 5% (Ledger, or a separate wallet)?
7. Is AYB team OK with this / can they verify the bag wallet source?
8. Gambling/ToS stance and any region limits.

## 10. Phased plan

1. **Design + odds sim** (this doc + Monte Carlo script). Lock numbers.
2. **Base Sepolia**: mock bag NFT + real 6551 registry, inboxes, PriceGuard with mock pools, VRF on testnet. Foundry tests: fake deposits, manipulated price, insolvency, transfer mid-game.
3. **3D frontend** on aybags reading testnet state; Meshy bag + coins.
4. **Mainnet soft launch**: USDC only, tiny caps, Ledger admin, pause ready. Cap tests with $1 from bag #98.
5. Add AYB/WETH, raise caps after a week of clean data; consider outside review.
