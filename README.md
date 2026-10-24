# AYB Bags — independent page
Read/deposit/withdraw for All Your Base bags (ERC-6551) straight from Base, no AYB server. Live at aybags.gearup.wtf.
Vite + viem, injected wallet. Connect is read-only; only deposits/withdrawals/checkpoint ask for a signature.
`npm i && npm run dev` · build: `npm run build` → `dist/`.
Bag wallet address is always derived live via `accountOf(id)`. Wallet code is unverified — test with $1 first.
See docs/play-from-bag.md.
