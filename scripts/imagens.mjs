/**
 * Imagens do Rubi: lê os PNGs do ChatGPT em "086 - Rubi Gummies/Recursos Site/IMAGENS",
 * corta as folhas em peças, limpa o alfa residual e grava WebP/AVIF em src/img.
 *
 *   node scripts/imagens.mjs
 *
 * As folhas (gummies, pitayas, logo, potes em ângulo) são separadas por componente conexo
 * do alfa. Peças que voam em primeiro plano ganham uma versão já desfocada aqui, pra o
 * navegador não ter que aplicar filter: blur() em elemento animado.
 */
import sharp from 'sharp'
import { soltarGummies } from './gummies-hero.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(aqui, '../../086 - Rubi Gummies/Recursos Site/IMAGENS')
const OUT = path.resolve(aqui, '../src/img')
mkdirSync(OUT, { recursive: true })

const manifesto = {}
const anota = (nome, info) => (manifesto[nome] = info)

/** Lê RGBA cru, zera o alfa abaixo do limiar (e a cor junto, pra não sobrar halo escondido). */
async function lerLimpo(arquivo, limiar = 18) {
  const { data, info } = await sharp(path.join(SRC, arquivo)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < limiar) data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0
  }
  return { data, w: info.width, h: info.height }
}

/** Componentes conexos do alfa numa grade reduzida (passo px). Devolve caixas em px reais. */
function componentes({ data, w, h }, { passo = 4, alfaMin = 60, areaMin = 0.004 } = {}) {
  const gw = Math.ceil(w / passo)
  const gh = Math.ceil(h / passo)
  const grade = new Uint8Array(gw * gh)
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const x = Math.min(w - 1, gx * passo + (passo >> 1))
      const y = Math.min(h - 1, gy * passo + (passo >> 1))
      grade[gy * gw + gx] = data[(y * w + x) * 4 + 3] > alfaMin ? 1 : 0
    }
  const rot = new Int32Array(gw * gh).fill(-1)
  const caixas = []
  for (let i = 0; i < grade.length; i++) {
    if (!grade[i] || rot[i] !== -1) continue
    const fila = [i]
    rot[i] = caixas.length
    let x0 = gw, y0 = gh, x1 = 0, y1 = 0, area = 0
    while (fila.length) {
      const k = fila.pop()
      const kx = k % gw
      const ky = (k / gw) | 0
      area++
      if (kx < x0) x0 = kx
      if (kx > x1) x1 = kx
      if (ky < y0) y0 = ky
      if (ky > y1) y1 = ky
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = kx + dx
        const ny = ky + dy
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
        const n = ny * gw + nx
        if (grade[n] && rot[n] === -1) {
          rot[n] = caixas.length
          fila.push(n)
        }
      }
    }
    caixas.push({ id: caixas.length, x0: x0 * passo, y0: y0 * passo, x1: (x1 + 1) * passo, y1: (y1 + 1) * passo, area, rot, gw, passo })
  }
  const total = gw * gh
  return caixas.filter((c) => c.area / total >= areaMin)
}

/** Recorta a caixa (com folga), apagando o que pertence a outras peças fora da caixa. */
function recorte(img, c, folga = 6) {
  const x0 = Math.max(0, c.x0 - folga)
  const y0 = Math.max(0, c.y0 - folga)
  const x1 = Math.min(img.w, c.x1 + folga)
  const y1 = Math.min(img.h, c.y1 + folga)
  const w = x1 - x0
  const h = y1 - y0
  const buf = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) img.data.copy(buf, y * w * 4, ((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x1) * 4)
  // apaga pixels que a grade atribuiu a outra peça (fiapo da vizinha dentro da caixa)
  if (c.rot && c.id !== undefined) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const gx = Math.floor((x0 + x) / c.passo)
        const gy = Math.floor((y0 + y) / c.passo)
        const lab = c.rot[gy * c.gw + gx]
        if (lab >= 0 && lab !== c.id) buf.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 4)
      }
  }
  return { data: buf, w, h }
}

const cru = (img) => sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } })

/** Grava uma peça com alfa em WebP nas larguras pedidas. Opcional: versão desfocada. */
async function gravarPeca(img, nome, larguras, { desfoque = 0, q = 84 } = {}) {
  const base = await cru(img).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true })
  const ratio = base.info.height / base.info.width
  for (const lw of larguras) {
    await sharp(base.data).resize({ width: Math.min(lw, base.info.width) }).webp({ quality: q, alphaQuality: 90, effort: 6 }).toFile(path.join(OUT, `${nome}-${lw}.webp`))
  }
  anota(nome, { larguras, ratio: +ratio.toFixed(4) })
  if (desfoque) {
    const lw = larguras[0]
    const pequena = await sharp(base.data).resize({ width: lw }).png().toBuffer({ resolveWithObject: true })
    const borda = Math.ceil(desfoque * 3)
    await sharp(pequena.data)
      .extend({ top: borda, bottom: borda, left: borda, right: borda, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .blur(desfoque)
      .webp({ quality: 80, alphaQuality: 80, effort: 6 })
      .toFile(path.join(OUT, `${nome}-blur.webp`))
    anota(`${nome}-blur`, { largura: lw + borda * 2, ratio: +((pequena.info.height + borda * 2) / (lw + borda * 2)).toFixed(4) })
  }
}

/** Fotos sem alfa: AVIF + WebP em várias larguras. */
async function gravarFoto(arquivo, nome, larguras, { extrair, q = 52, cru: bruto } = {}) {
  let pipe = bruto ? sharp(bruto.data, { raw: bruto.raw }) : sharp(path.join(SRC, arquivo))
  if (extrair) pipe = pipe.extract(extrair)
  const base = await pipe.png().toBuffer({ resolveWithObject: true })
  for (const lw of larguras) {
    const r = sharp(base.data).resize({ width: Math.min(lw, base.info.width) })
    await r.clone().avif({ quality: q, effort: 6 }).toFile(path.join(OUT, `${nome}-${lw}.avif`))
    await r.clone().webp({ quality: 78, effort: 6 }).toFile(path.join(OUT, `${nome}-${lw}.webp`))
  }
  anota(nome, { larguras, w: base.info.width, h: base.info.height })
}

/** Tampa prateada vira branca fosca (o hero aprovado tem tampa branca). */
function clarearTampa(img) {
  const { data, w, h } = img
  // a tampa acaba onde começa o rótulo rosa: primeira linha com muito pixel saturado
  let fimTampa = 0
  for (let y = 0; y < h; y++) {
    let opacos = 0
    let rosa = 0
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] < 128) continue
      opacos++
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      if (mx > 60 && (mx - mn) / mx > 0.35) rosa++
    }
    if (opacos > 50 && rosa / opacos > 0.35) {
      fimTampa = y
      break
    }
  }
  for (let y = 0; y < fimTampa; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (!data[i + 3]) continue
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      if (mx - mn > 40) continue // gota ou reflexo colorido: deixa
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(255 - (255 - data[i + c]) * 0.42)
      // leve calor, como plástico branco e não metal
      data[i + 2] = Math.max(0, data[i + 2] - 3)
    }
  return fimTampa
}

/* ------------------------------------------------------------------ */

// Hero: desktop e recorte quadrado pro celular, centrado no pote (~66% da largura)
// Os 4 gummies que voam em volta do pote saem da foto (o céu é preenchido) e voltam por cima,
// animados. O recorte quadrado do celular segue com a foto original, gummies parados.
{
  const { limpo, info, pecas } = await soltarGummies(path.join(SRC, 'hero-desktop.png'))
  await gravarFoto(null, 'hero', [1672, 1280, 960], { cru: { data: limpo, raw: { width: info.width, height: info.height, channels: 3 } } })
  const posicoes = []
  for (const p of pecas) {
    const { x0, y0, x1, y1 } = p.caixa
    const w = x1 - x0
    const h = y1 - y0
    await sharp(p.rgba, { raw: { width: p.w, height: p.h, channels: 4 } })
      .extract({ left: x0, top: y0, width: w, height: h })
      .webp({ quality: 86, alphaQuality: 90, effort: 6 })
      .toFile(path.join(OUT, `${p.nome}.webp`))
    posicoes.push({ nome: p.nome, w, h, l: +(((p.x0 + x0) / info.width) * 100).toFixed(3), t: +(((p.y0 + y0) / info.height) * 100).toFixed(3), lw: +((w / info.width) * 100).toFixed(3) })
  }
  anota('gummies-hero', posicoes)
}
{
  const m = await sharp(path.join(SRC, 'hero-desktop.png')).metadata()
  const lado = m.height
  const cx = Math.round(m.width * 0.655)
  const left = Math.max(0, Math.min(m.width - lado, cx - Math.round(lado / 2)))
  await gravarFoto('hero-desktop.png', 'hero-mobile', [760, 560], { extrair: { left, top: 0, width: lado, height: lado }, q: 46 })
}
await gravarFoto('cta-final-desktop.png', 'cta', [1536, 1024])
await gravarFoto('mulher-rubi.png', 'mulher', [1122, 800, 560], { q: 58 })

// Produto com respingo (seção 03)
{
  const img = await lerLimpo('produto-respingo.png', 24)
  await gravarPeca(img, 'produto-respingo', [960, 720, 440], { q: 74 })
}

// Potes: tampa branca + peças
{
  const img = await lerLimpo('pote-frente.png', 24)
  const fim = clarearTampa(img)
  console.log('pote-frente: tampa até y =', fim)
  await gravarPeca(img, 'pote-frente', [520, 300])
}
{
  const img = await lerLimpo('pote-angulos.png', 24)
  const cs = componentes(img, { areaMin: 0.05 }).sort((a, b) => a.x0 - b.x0)
  console.log('pote-angulos:', cs.length, 'peças')
  for (const [n, c] of cs.entries()) {
    const p = recorte(img, c)
    clarearTampa(p)
    await gravarPeca(p, `pote-${n === 0 ? 'esq' : 'dir'}`, [420, 260])
  }
}

// Gummies: 9 peças, ordem de leitura; as 4 primeiras ganham versão desfocada
{
  const img = await lerLimpo('gummies-folha.png', 24)
  const cs = componentes(img, { areaMin: 0.01 }).sort((a, b) => Math.round(a.y0 / 200) - Math.round(b.y0 / 200) || a.x0 - b.x0)
  console.log('gummies:', cs.length, 'peças')
  for (const [n, c] of cs.entries()) {
    await gravarPeca(recorte(img, c), `gummy-${n + 1}`, [260, 140], { desfoque: n < 5 ? 9 : 0, q: 78 })
  }
}

// Pitayas: 6 peças
{
  const img = await lerLimpo('pitayas-folha.png', 24)
  const cs = componentes(img, { areaMin: 0.01 }).sort((a, b) => Math.round(a.y0 / 250) - Math.round(b.y0 / 250) || a.x0 - b.x0)
  console.log('pitayas:', cs.length, 'peças')
  const nomes = ['inteira-pe', 'inteira-deitada', 'metade-a', 'metade-b', 'rodela', 'cunha']
  for (const [n, c] of cs.entries()) {
    await gravarPeca(recorte(img, c), `pitaya-${nomes[n] ?? n}`, [420, 240], { desfoque: n === 2 || n === 4 ? 8 : 0, q: 76 })
  }
}

// Logo: a palavra (com a pitayinha do i) em cima, o símbolo embaixo
{
  const img = await lerLimpo('logo-rubi.png', 24)
  const cs = componentes(img, { areaMin: 0.002 })
  const corte = 560
  const junta = (lista) => lista.reduce((a, c) => ({ x0: Math.min(a.x0, c.x0), y0: Math.min(a.y0, c.y0), x1: Math.max(a.x1, c.x1), y1: Math.max(a.y1, c.y1) }), { x0: 1e9, y0: 1e9, x1: 0, y1: 0 })
  const logo = junta(cs.filter((c) => c.y1 < corte + 40))
  const simbolo = junta(cs.filter((c) => c.y0 > corte - 20))
  await gravarPeca(recorte(img, logo, 4), 'logo', [480, 300])
  const s = recorte(img, simbolo, 4)
  await gravarPeca(s, 'simbolo', [160])
  const simb = await cru(s).trim({ threshold: 1 }).png().toBuffer()
  for (const lado of [32, 180]) {
    await sharp(simb).resize(lado, lado, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(OUT, `favicon-${lado}.png`))
  }
}

writeFileSync(path.join(OUT, 'manifesto.json'), JSON.stringify(manifesto, null, 1))
console.log('ok:', Object.keys(manifesto).length, 'imagens em', OUT)
