/**
 * Build do Rubi: monta dist/ a partir de src/.
 *
 *   node build.mjs
 *
 * No HTML de src/ valem estas marcações, trocadas aqui:
 *   {{css}}                 CSS inteiro, minificado, dentro de <style>
 *   {{icon:peso/nome}}      ícone Phosphor inline (peso: regular, bold, fill)
 *   {{si:nome}}             logo de marca do Simple Icons (visa, pix, instagram...)
 *   {{gotas:semente}}       borda pingando (suco de pitaya), SVG gerado
 *   {{onda:semente:cor}}    onda em duas camadas, a da frente na cor dada
 *   {{selo}}                selo serrilhado da garantia
 *   {{laco:semente:cor}}    fita de seda torcida (amarela ou rosa), SVG gerado
 *   {{v:arquivo}}           hash do arquivo, pra quebrar cache (?v=)
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { svgQuerTomar, PROPORCAO as PROP_QT } from './scripts/quer-tomar.mjs'
import { fileURLToPath } from 'node:url'

const raiz = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(raiz, 'src')
const DIST = path.join(raiz, 'dist')
const PH = path.join(raiz, 'node_modules/@phosphor-icons/core/assets')
const SI = path.join(raiz, 'node_modules/simple-icons/icons')

function prng(seed) {
  let s = [...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const f = (n) => Number(n.toFixed(1))

function icone(spec) {
  const [peso, nome] = spec.split('/')
  const arq = peso === 'regular' ? `${nome}.svg` : `${nome}-${peso}.svg`
  const svg = readFileSync(path.join(PH, peso, arq), 'utf8')
  return svg.replace('<svg ', '<svg class="ic" aria-hidden="true" focusable="false" ')
}

// a área útil de alguns logos é uma faixa fina do quadrado 24x24
const recorteSI = { visa: '0 7.9 24 8.2' }
function marca(nome) {
  let svg = readFileSync(path.join(SI, `${nome}.svg`), 'utf8')
  if (recorteSI[nome]) svg = svg.replace('viewBox="0 0 24 24"', `viewBox="${recorteSI[nome]}"`)
  return svg
    .replace(/<title>.*?<\/title>/, '')
    .replace('<svg ', '<svg class="si" aria-hidden="true" focusable="false" fill="currentColor" ')
    .replace(' role="img"', '')
}

/** Borda pingando: faixa ondulada no topo + pingos de tamanhos variados com bolinha na ponta. */
function gotas(seed) {
  const r = prng(seed)
  const W = 2400
  const F = 30 // altura da faixa
  const H = F + 150
  let borda = `M0 0H${W}V${F}`
  for (let x = W; x > 0; x -= 60) borda += `Q${x - 30} ${f(F + (r() - 0.3) * 10)} ${x - 60} ${F}`
  borda += 'Z'
  const pingos = []
  let x = 6 + r() * 20
  let n = 0
  while (x < W - 20) {
    const dw = 9 + r() * 15
    const curto = r() < 0.4
    const L = curto ? 8 + r() * 26 : 34 + r() * 100
    const cx = x + dw / 2
    const pe = F + L
    const bolha = dw * (0.62 + r() * 0.12)
    const d = `M${f(x)} ${F - 4}C${f(x)} ${f(F + L * 0.4)} ${f(x + dw * 0.08)} ${f(pe - bolha)} ${f(cx - bolha)} ${f(pe)}A${f(bolha)} ${f(bolha)} 0 1 0 ${f(cx + bolha)} ${f(pe)}C${f(x + dw * 0.92)} ${f(pe - bolha)} ${f(x + dw)} ${f(F + L * 0.4)} ${f(x + dw)} ${F - 4}Z`
    const brilho = L > 40 ? `<path d="M${f(x + dw * 0.28)} ${F + 6}V${f(pe - bolha * 0.6)}" stroke="#fff" stroke-opacity=".32" stroke-width="${f(dw * 0.16)}" stroke-linecap="round" fill="none"/>` : ''
    pingos.push(`<g class="pingo" style="--i:${n++ % 12}"><path d="${d}"/>${brilho}</g>`)
    x += dw + 6 + r() * 46
  }
  return `<svg class="gotas" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false"><defs><linearGradient id="gg${seed}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C80E5E"/><stop offset=".35" stop-color="#E5167A"/><stop offset="1" stop-color="#F0378E"/></linearGradient></defs><g fill="url(#gg${seed})"><path d="${borda}"/>${pingos.join('')}</g><path d="M0 7H${W}" stroke="#fff" stroke-opacity=".18" stroke-width="3"/></svg>`
}

/** Onda periódica (período = metade da largura), pra deslizar em loop sem emenda. */
function caminhoOnda(r, H, base) {
  const P = 1440
  const k1 = 1 + Math.floor(r() * 2)
  const k2 = 2 + Math.floor(r() * 3)
  const a1 = 10 + r() * 14
  const a2 = 4 + r() * 8
  const ph = r() * Math.PI * 2
  let d = `M0 ${H}`
  for (let x = 0; x <= P * 2; x += 24) {
    const y = base + a1 * Math.sin((2 * Math.PI * k1 * x) / P) + a2 * Math.sin((2 * Math.PI * k2 * x) / P + ph)
    d += `L${x} ${f(y)}`
  }
  return d + `L${P * 2} ${H}Z`
}
function onda(seed, cor) {
  const r = prng(seed)
  const H = 120
  const tras = caminhoOnda(r, H, 54)
  const frente = caminhoOnda(r, H, 74)
  return `<div class="onda" aria-hidden="true"><svg class="onda__c onda__c--tras" viewBox="0 0 2880 ${H}" preserveAspectRatio="none" focusable="false"><path d="${tras}" fill="${cor}" fill-opacity=".45"/></svg><svg class="onda__c onda__c--frente" viewBox="0 0 2880 ${H}" preserveAspectRatio="none" focusable="false"><path d="${frente}" fill="${cor}"/></svg></div>`
}

/**
 * Fita de seda (as faixas do fim do hero): ondula e se torce, com o avesso mais escuro.
 * Periódica na largura P, pra deslizar em loop sem emenda (o JS clona o grupo).
 */
const coresLaco = {
  amarela: { claro: '#FFE27A', meio: '#FFC21A', escuro: '#F2A000', avesso: '#FFB80F', avesso2: '#EE9A00' },
  rosa: { claro: '#FF5AA6', meio: '#E5167A', escuro: '#B80C58', avesso: '#D0106C', avesso2: '#A90C57' },
}
function laco(seed, cor) {
  const r = prng(seed)
  const c = coresLaco[cor]
  const P = 2400
  const H = 200
  const T = cor === 'amarela' ? 62 : 52 // largura da fita
  const k1 = 1
  const k2 = 2 + Math.floor(r() * 2)
  const a1 = 34 + r() * 8
  const a2 = 6 + r() * 5
  const ph = r() * Math.PI * 2
  const nos = 2 // torções por período (par, pra frente e avesso fecharem o loop)
  const centro = (x) => H / 2 + a1 * Math.sin((2 * Math.PI * k1 * x) / P) + a2 * Math.sin((2 * Math.PI * k2 * x) / P + ph)
  const larg = (x) => T * Math.max(0.1, Math.abs(Math.cos((Math.PI * nos * x) / P + 0.6)))
  // pontos de torção (largura mínima) cortam a fita em segmentos, frente e avesso alternados
  const L = P / nos
  const x0 = ((Math.PI / 2 - 0.6) / Math.PI) * L
  const cortes = [0]
  for (let x = x0; x < P; x += L) cortes.push(x)
  cortes.push(P)
  const passo = 16
  let frente = ''
  let avesso = ''
  let brilho = ''
  let sombra = ''
  for (let i = 0; i < cortes.length - 1; i++) {
    const a = cortes[i]
    const b = cortes[i + 1]
    const xs = []
    for (let x = a; x < b; x += passo) xs.push(x)
    xs.push(b)
    const cima = xs.map((x) => `${f(x)} ${f(centro(x) - larg(x) / 2)}`)
    const baixo = xs.map((x) => `${f(x)} ${f(centro(x) + larg(x) / 2)}`).reverse()
    const d = `M${cima.join('L')}L${baixo.join('L')}Z`
    // o avesso aparece no segmento ímpar a partir do primeiro nó
    const ehAvesso = (i + (x0 > 0 ? 1 : 0)) % 2 === 0
    if (ehAvesso) avesso += d
    else {
      frente += d
      const luz = xs.map((x) => `${f(x)} ${f(centro(x) - larg(x) * 0.24)}`)
      brilho += `M${luz.join('L')}`
    }
    sombra += `M${xs.map((x) => `${f(x)} ${f(centro(x) - larg(x) / 2 + 10)}`).join('L')}L${xs.map((x) => `${f(x)} ${f(centro(x) + larg(x) / 2 + 12)}`).reverse().join('L')}Z`
  }
  const id = `l${seed}`
  return `<svg class="laco" viewBox="0 0 ${P} ${H}" width="${P}" height="${H}" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}f" x1="0" y1="${H / 2 - 70}" x2="0" y2="${H / 2 + 70}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c.claro}"/><stop offset=".5" stop-color="${c.meio}"/><stop offset="1" stop-color="${c.escuro}"/></linearGradient><linearGradient id="${id}a" x1="0" y1="${H / 2 - 70}" x2="0" y2="${H / 2 + 70}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c.avesso}"/><stop offset="1" stop-color="${c.avesso2}"/></linearGradient><filter id="${id}s" x="-5%" y="-40%" width="110%" height="180%"><feGaussianBlur stdDeviation="7"/></filter></defs><path d="${sombra}" fill="#5E0B34" fill-opacity=".28" filter="url(#${id}s)"/><path d="${avesso}" fill="url(#${id}a)"/><path d="${frente}" fill="url(#${id}f)"/><path d="${brilho}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3" stroke-linecap="round"/></svg>`
}

/** Selo serrilhado (a parte que gira) da garantia. */
function selo() {
  const N = 28
  const R = 100
  const r = 92
  let d = ''
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2
    const am = ((i - 0.5) / N) * Math.PI * 2 - Math.PI / 2
    const p = [f(110 + Math.cos(a) * r), f(110 + Math.sin(a) * r)]
    const c = [f(110 + Math.cos(am) * R * 1.06), f(110 + Math.sin(am) * R * 1.06)]
    d += i === 0 ? `M${p[0]} ${p[1]}` : `Q${c[0]} ${c[1]} ${p[0]} ${p[1]}`
  }
  return `<svg class="selo__serra" viewBox="0 0 220 220" aria-hidden="true" focusable="false"><defs><linearGradient id="selog" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF3D93"/><stop offset="1" stop-color="#C80E5E"/></linearGradient></defs><path d="${d}Z" fill="url(#selog)"/><circle cx="110" cy="110" r="78" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="2 7" stroke-linecap="round" opacity=".9"/></svg>`
}

/**
 * Peça flutuante (gummy, pitaya). Três camadas, cada uma com um só movimento:
 *   .flu      paralaxe pela rolagem (animation-timeline: view())
 *   .flu__in  boia em loop
 *   img       entrada (escala e giro) quando a seção aparece
 * vars: l t w r d p z dl, e "eager" pra peça do hero.
 */
const manifesto = JSON.parse(readFileSync(path.join(SRC, 'img/manifesto.json'), 'utf8'))
function flutuante(nome, vars) {
  const m = manifesto[nome]
  if (!m) throw new Error('peça sem manifesto: ' + nome)
  const borrada = nome.endsWith('-blur')
  const w = borrada ? m.largura : nome.startsWith('gummy') ? 260 : 420
  const h = Math.round(w * m.ratio)
  const partes = vars.split(';').filter(Boolean)
  const estilo = partes.map((p) => '--' + p).join(';')
  // largura exibida (--w) decide qual arquivo baixar; no celular a peça encolhe pra 62%
  const wpx = parseInt((partes.find((p) => p.startsWith('w:')) || 'w:120').slice(2), 10)
  const menor = nome.startsWith('gummy') ? 140 : 240
  const fonte = borrada
    ? `src="img/${nome}.webp"`
    : `src="img/${nome}-${menor}.webp" srcset="img/${nome}-${menor}.webp ${menor}w, img/${nome}-${w}.webp ${w}w" sizes="(max-width: 760px) ${Math.round(wpx * 0.62)}px, ${wpx}px"`
  return `<div class="flu${borrada ? ' flu--perto' : ''}" style="${estilo}" aria-hidden="true"><div class="flu__in"><img ${fonte} alt="" width="${w}" height="${h}" loading="lazy" decoding="async"></div></div>`
}

/**
 * Gummies que saíram da foto do hero, de volta no mesmo lugar (em % da foto).
 * Duas camadas de movimento com tempos que não batem, pra o balanço nunca se repetir igual:
 * .hg__y sobe e desce, img balança e gira de leve.
 */
function gummiesHero() {
  const tempos = [[4.6, 6.8], [5.4, 7.6], [5.0, 8.4], [4.2, 6.2]]
  return `<div class="hero__cena" aria-hidden="true">${manifesto['gummies-hero']
    .map((g, i) => {
      const [ty, tg] = tempos[i % tempos.length]
      return `<div class="hg" style="--l:${g.l}%;--t:${g.t}%;--w:${g.lw}%;--ty:${ty}s;--tg:${tg}s;--dl:${(-i * 1.3).toFixed(1)}s;--z:${i === 2 ? 3 : 2}"><div class="hg__y"><img src="img/${g.nome}.webp?v=${hash(`img/${g.nome}.webp`)}" alt="" width="${g.w}" height="${g.h}" decoding="async"></div></div>`
    })
    .join('')}</div>`
}

function minCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim()
}

const hash = (arq) => createHash('sha1').update(readFileSync(path.join(SRC, arq))).digest('hex').slice(0, 8)

/* ------------------------------------------------------------------ */

if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true })
mkdirSync(DIST, { recursive: true })

let html = readFileSync(path.join(SRC, 'index.html'), 'utf8')
const css = minCss(readFileSync(path.join(SRC, 'css/rubi.css'), 'utf8'))

html = html
  .replace('{{css}}', css)
  .replace(/\{\{icon:([a-z]+\/[a-z0-9-]+)\}\}/g, (_, s) => icone(s))
  .replace(/\{\{si:([a-z0-9]+)\}\}/g, (_, s) => marca(s))
  .replace(/\{\{gotas:([a-z0-9]+)\}\}/g, (_, s) => gotas(s))
  .replace(/\{\{onda:([a-z0-9]+):(#[0-9A-Fa-f]{3,6})\}\}/g, (_, s, c) => onda(s, c))
  .replace('{{selo}}', selo())
  .replace('{{gummies-hero}}', () => gummiesHero())
  .replace('{{quer-tomar}}', () => `<img class="quer-tomar" src="img/quer-tomar-1000.webp" srcset="img/quer-tomar-700.webp 700w, img/quer-tomar-1000.webp 1000w, img/quer-tomar-1400.webp 1400w" sizes="(max-width: 760px) 92vw, 27vw" width="1400" height="${Math.round(1400 * PROP_QT)}" alt="" aria-hidden="true" fetchpriority="high">`)
  .replace(/\{\{flu:([a-z0-9-]+):([^}]*)\}\}/g, (_, n, v) => flutuante(n, v))
  .replace(/\{\{v:([^}]+)\}\}/g, (_, a) => hash(a))

// as fitas viram imagem: o SVG com desfoque, repintado no celular, travava a thread principal por 10 s
const lacos = []
html = html.replace(/\{\{laco:([a-z0-9]+):(amarela|rosa)\}\}/g, (_, s, c) => {
  lacos.push([s, c])
  const fonte = (l) => `img/laco-${s}-${l}.webp`
  return `<img class="laco" src="${fonte(2400)}" srcset="${fonte(1400)} 1400w, ${fonte(2400)} 2400w, ${fonte(3600)} 3600w" sizes="(max-width: 760px) 1392px, 2400px" width="2400" height="200" alt="" decoding="async" fetchpriority="low">`
})

const sobrou = html.match(/\{\{[^}]*\}\}/g)
if (sobrou) throw new Error('marcação sem troca: ' + sobrou.join(', '))

writeFileSync(path.join(DIST, 'index.html'), html)
for (const pasta of ['img', 'fonts', 'js']) cpSync(path.join(SRC, pasta), path.join(DIST, pasta), { recursive: true, filter: (s) => !s.endsWith('manifesto.json') })
// Lenis (rolagem suave), carregado pelo rubi.js depois do load, só no computador
cpSync(path.join(raiz, 'node_modules/lenis/dist/lenis.min.js'), path.join(DIST, 'js/lenis.min.js'))

const sharp = (await import('sharp')).default
{
  const svg = Buffer.from(svgQuerTomar())
  const W = svg.toString().match(/width="(\d+)"/)[1]
  for (const l of [700, 1000, 1400]) await sharp(svg, { density: 72 * (l / W) }).resize(l).webp({ quality: 84, alphaQuality: 90, effort: 6 }).toFile(path.join(DIST, `img/quer-tomar-${l}.webp`))
}
for (const [s, c] of lacos) {
  const svg = Buffer.from(laco(s, c))
  for (const l of [1400, 2400, 3600]) {
    await sharp(svg, { density: 72 * (l / 2400) }).resize(l).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(path.join(DIST, `img/laco-${s}-${l}.webp`))
  }
}
for (const arq of ['robots.txt']) if (existsSync(path.join(SRC, arq))) cpSync(path.join(SRC, arq), path.join(DIST, arq))

console.log(`dist/index.html ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB (CSS ${(css.length / 1024).toFixed(1)} KB inline)`)
