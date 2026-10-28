import { createPublicClient, createWalletClient, custom, http, parseAbi, formatUnits, parseUnits, isAddress, getAddress, type Address } from 'viem'
import { base } from 'viem/chains'

const NFT: Address = '0xb0f3dcaf6be094559213089bd14299f5103cf964'
const pub = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })
const nftAbi = parseAbi([
  'function ownerOf(uint256) view returns (address)',
  'function accountOf(uint256) view returns (address)',
  'function isMigrating(uint256) view returns (bool)',
  'function currentMaskTier(uint256) view returns (uint8)',
  'function auraTier(uint256) view returns (uint8)',
  'function bindingOf(uint256) view returns (address impl, bytes32 salt)',
  'function checkpoint(uint256)',
])
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)', 'function transfer(address,uint256) returns (bool)'])
const acctAbi = parseAbi(['function sendETH(address to,uint256 amount)', 'function sendERC20(address token,address to,uint256 amount)'])

const MASKS = [['Iron', '#6b7280'], ['Onyx', '#111827'], ['Gold', '#d4a017'], ['Magma', '#d9480f'], ['Ice', '#4cc9f0'], ['Cosmic', '#7b2ff7'], ['Diamond', '#b9f2ff']]
const AURAS = ['None', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Rainbow']
type Tok = { addr: Address | 'ETH'; sym: string; dec: number }
const tokens: Tok[] = [
  { addr: 'ETH', sym: 'ETH', dec: 18 },
  { addr: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', sym: 'USDC', dec: 6 },
  { addr: '0xB96CFc6f81F85c58a1eCcDd9eC2aD940E2cb8453', sym: 'AYB', dec: 18 },
  { addr: '0x5880cD05605A549f1DAb01a53ca61Ee559244bD1', sym: 'GEAR', dec: 6 },
  { addr: '0x1d1bcd1459259429accde23e24e1782f83e97ba3', sym: 'CAPH', dec: 18 },
]
const $ = (id: string) => document.getElementById(id) as any
let bag: Address | null = null, holder: Address | null = null, me: Address | null = null, tid = 98n
const status = (s: string) => ($('status').textContent = s)
const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4)
const row = (k: string, v: string) => `<div><span>${k}</span><b>${v}</b></div>`

// Tap-friendly token picker (native <select> popups are unreliable in Android wallet in-app browsers).
const bals: Record<number, bigint | null> = {}
function picker(id: string, isWithdraw: boolean) {
  const el = $(id); if (el.value === undefined) el.value = '0'
  el.innerHTML = tokens.map((t, i) => {
    const b = bals[i]; const zero = b === 0n
    const txt = b == null ? '…' : Number(formatUnits(b, t.dec)).toLocaleString(undefined, { maximumFractionDigits: 6 })
    return `<button type="button" role="radio" data-i="${i}" aria-checked="${el.value == i}" class="opt${el.value == i ? ' on' : ''}${isWithdraw && zero ? ' zero' : ''}">` +
      `<span>${t.sym}</span><small>${isWithdraw ? (zero ? '0 in bag' : txt + ' in bag') : ''}</small></button>`
  }).join('')
  el.querySelectorAll('button').forEach((b: HTMLButtonElement) => b.addEventListener('click', () => {
    el.value = b.dataset.i!; fillSelects()
    if (isWithdraw) status(bals[+el.value] === 0n ? `The bag holds 0 ${tokens[+el.value].sym}, nothing to withdraw.` : '')
  }))
}
function fillSelects() { picker('dAsset', false); picker('wAsset', true) }
async function load() {
  tid = BigInt($('tid').value || 0)
  $('info').textContent = 'Loading…'; $('mig').innerHTML = ''
  try {
    const c = { address: NFT, abi: nftAbi } as const
    const [own, acct, mig, mask, aura, bind] = await Promise.all([
      pub.readContract({ ...c, functionName: 'ownerOf', args: [tid] }),
      pub.readContract({ ...c, functionName: 'accountOf', args: [tid] }),
      pub.readContract({ ...c, functionName: 'isMigrating', args: [tid] }),
      pub.readContract({ ...c, functionName: 'currentMaskTier', args: [tid] }),
      pub.readContract({ ...c, functionName: 'auraTier', args: [tid] }),
      pub.readContract({ ...c, functionName: 'bindingOf', args: [tid] }),
    ])
    holder = own; bag = acct
    const code = await pub.getCode({ address: acct })
    const [mn, col] = MASKS[mask] ?? ['?', '#333']
    $('info').innerHTML = `<div class="tier" style="background:${col}">${mn} mask · ${AURAS[aura] ?? aura} aura</div>` +
      row('Holder', `<a href="https://basescan.org/address/${own}" target="_blank">${short(own)}</a>`) +
      row('Bag wallet', `<a href="https://basescan.org/address/${acct}" target="_blank">${acct}</a>`) +
      row('Wallet deployed', code && code !== '0x' ? 'yes' : 'NO') +
      row('Wallet version', short(bind[0]))
    if (mig) $('mig').innerHTML = `<div class="migwarn"><b>Migrating!</b> This bag is moving to a new wallet. Don't deposit until it finishes.</div>`
    await holdings(); updateWithdraw()
  } catch (e: any) { $('info').textContent = 'Read failed: ' + (e.shortMessage || e.message) }
}
async function holdings() {
  if (!bag) return
  const out = await Promise.all(tokens.map(async t => {
    try {
      const b = t.addr === 'ETH' ? await pub.getBalance({ address: bag! }) : await pub.readContract({ address: t.addr, abi: erc20, functionName: 'balanceOf', args: [bag!] })
      bals[tokens.indexOf(t)] = b
      return row(t.sym, Number(formatUnits(b, t.dec)).toLocaleString(undefined, { maximumFractionDigits: 6 }))
    } catch { bals[tokens.indexOf(t)] = null; return row(t.sym, 'error') }
  }))
  $('hold').innerHTML = `<div class="info">${out.join('')}</div>`; fillSelects()
}
async function addToken() {
  const a = $('custom').value.trim(); if (!isAddress(a)) return status('Not a valid address')
  try {
    const addr = getAddress(a)
    const [sym, dec] = await Promise.all([pub.readContract({ address: addr, abi: erc20, functionName: 'symbol' }), pub.readContract({ address: addr, abi: erc20, functionName: 'decimals' })])
    tokens.push({ addr, sym, dec }); fillSelects(); holdings(); $('custom').value = ''
  } catch { status('That address is not an ERC-20 on Base') }
}
const eth = () => (window as any).ethereum
async function connect() {
  if (!eth()) return status('No wallet found. Open this page in your wallet app browser (MetaMask, Coinbase, Rabby…).')
  const [a] = await eth().request({ method: 'eth_requestAccounts' })
  me = getAddress(a); $('me').textContent = 'Connected: ' + me + ' (read-only until you sign a write)'; updateWithdraw()
}
function updateWithdraw() {
  const ok = !!me && !!holder && me.toLowerCase() === holder.toLowerCase()
  $('wd').disabled = !ok
  $('wd').textContent = ok ? 'Withdraw' : me ? 'Withdraw (you are not the holder)' : 'Withdraw (connect holder wallet)'
}
async function wallet() {
  if (!me) await connect(); if (!me) throw new Error('not connected')
  try { await eth().request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] }) } catch {}
  return createWalletClient({ account: me, chain: base, transport: custom(eth()) })
}
async function run(label: string, f: () => Promise<`0x${string}`>) {
  try { status(label + ': confirm in your wallet…'); const h = await f(); status(label + ' sent: https://basescan.org/tx/' + h); await pub.waitForTransactionReceipt({ hash: h }); status(label + ' confirmed: https://basescan.org/tx/' + h); holdings() }
  catch (e: any) { status(label + ' failed: ' + (e.shortMessage || e.message)) }
}
async function deposit() {
  if (!bag) return; const t = tokens[+$('dAsset').value]; const amt = parseUnits($('dAmt').value || '0', t.dec)
  if (amt <= 0n) return status('Enter an amount')
  const w = await wallet()
  run('Deposit', () => t.addr === 'ETH' ? w.sendTransaction({ to: bag!, value: amt }) : w.writeContract({ address: t.addr as Address, abi: erc20, functionName: 'transfer', args: [bag!, amt] }))
}
async function checkpoint() { const w = await wallet(); run('Checkpoint', () => w.writeContract({ address: NFT, abi: nftAbi, functionName: 'checkpoint', args: [tid] })) }
async function withdraw() {
  if (!bag) return; const t = tokens[+$('wAsset').value]; const amt = parseUnits($('wAmt').value || '0', t.dec)
  if (amt <= 0n) return status('Enter an amount')
  const w = await wallet(); const toIn = $('wTo').value.trim(); const to = toIn ? (isAddress(toIn) ? getAddress(toIn) : null) : me
  if (!to) return status('Bad To address')
  if (me!.toLowerCase() !== holder!.toLowerCase()) return status('Only the holder can withdraw')
  run('Withdraw', () => t.addr === 'ETH'
    ? w.writeContract({ address: bag!, abi: acctAbi, functionName: 'sendETH', args: [to, amt] })
    : w.writeContract({ address: bag!, abi: acctAbi, functionName: 'sendERC20', args: [t.addr as Address, to, amt] }))
}
fillSelects()
$('load').onclick = load; $('addTok').onclick = addToken; $('connect').onclick = connect
$('dep').onclick = deposit; $('cp').onclick = checkpoint; $('wd').onclick = withdraw
eth()?.on?.('accountsChanged', (a: string[]) => { me = a[0] ? getAddress(a[0]) : null; updateWithdraw() })
load()
import './avatar'
