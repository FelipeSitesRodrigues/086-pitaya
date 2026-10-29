/**
 * Confere as animações com movimento LIGADO (o print.mjs usa movimento reduzido e esconde tudo):
 * quadros da entrada do hero, fitas andando e acelerando com a rolagem, erros de console e
 * estouro horizontal em várias larguras.
 *
 *   node scripts/animacoes.mjs        (servidor em http://localhost:8086)
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync } from 'node:fs'
const require = createRequire('C:/Users/Felipe/Projetos/mazyos-vscode-sites/sites/070-nobre-estofados/')
const puppeteer = require('puppeteer-core')

const BASE = process.env.BASE_URL ?? 'http://localhost:8086'
const NAV = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))
mkdirSync('revisao/anim', { recursive: true })

const browser = await puppeteer.launch({ executablePath: NAV, headless: 'new', args: ['--hide-scrollbars'] })
const page = await browser.newPage()
const erros = []
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
page.on('pageerror', (e) => erros.push(String(e)))
await page.setViewport({ width: 1440, height: 900 })

// 1. entrada do hero
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
let antes = 0
for (const ms of [150, 600, 1100, 2600]) {
  await new Promise((r) => setTimeout(r, ms - antes))
  antes = ms
  await page.screenshot({ path: `revisao/anim/hero-${ms}ms.png` })
}

// 2. fitas andando sozinhas
const posFita = () =>
  page.$$eval('.fitas .fita__trilho, .frete__trilho', (els) => els.map((e) => getComputedStyle(e).transform))
const a = await posFita()
await new Promise((r) => setTimeout(r, 500))
const b = await posFita()
console.log('fitas paradas?', a.map((v, i) => (v === b[i] ? 'PARADA' : 'anda')).join(', '))

// 3. rolagem rápida: velocidade e inclinação
const vel = async () => {
  const t1 = await page.$eval('.fita--amarela .fita__trilho', (e) => new DOMMatrix(getComputedStyle(e).transform).m41)
  await new Promise((r) => setTimeout(r, 200))
  const t2 = await page.$eval('.fita--amarela .fita__trilho', (e) => new DOMMatrix(getComputedStyle(e).transform).m41)
  return Math.abs(t2 - t1) / 0.2
}
const calma = await vel()
await page.evaluate(async () => {
  for (let i = 0; i < 12; i++) {
    window.scrollBy(0, 28)
    await new Promise((r) => requestAnimationFrame(r))
  }
})
const rapida = await vel()
const inclina = await page.$eval('.fita--amarela .fita__trilho', (e) => getComputedStyle(e).transform)
console.log(`fita amarela: ${calma.toFixed(0)} px/s parada, ${rapida.toFixed(0)} px/s rolando · transform ${inclina}`)

// 4. seções ganham .vis ao rolar e as peças aparecem
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 400) {
    window.scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 120))
  }
  window.scrollTo(0, document.body.scrollHeight)
  await new Promise((r) => setTimeout(r, 400))
})
const semVis = await page.$$eval('main > section, .rodape', (els) => els.filter((e) => !e.classList.contains('vis')).map((e) => e.className))
console.log('seções sem .vis depois de rolar:', semVis.length ? semVis : 'nenhuma')
await page.evaluate(() => window.scrollTo(0, document.querySelector('#kits').offsetTop - 80))
await new Promise((r) => setTimeout(r, 1500))
await page.screenshot({ path: 'revisao/anim/kits-movimento.png' })

// 5. estouro horizontal em várias larguras
for (const w of [390, 768, 1024, 1440, 1920]) {
  await page.setViewport({ width: w, height: 900 })
  await new Promise((r) => setTimeout(r, 300))
  // com overflow: clip o scrollWidth mente; o que vale é se a página rola pro lado
  const sx = await page.evaluate(() => { window.scrollTo(300, window.scrollY); const x = window.scrollX; window.scrollTo(0, window.scrollY); return x })
  console.log(`largura ${w}: rola pro lado ${sx}px${sx > 0 ? '  ESTOURA' : ''}`)
}

console.log('erros de console:', erros.length ? erros : 'nenhum')
await browser.close()
