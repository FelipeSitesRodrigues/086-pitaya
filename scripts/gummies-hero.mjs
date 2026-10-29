/**
 * Solta os gummies pintados na foto do hero: recorta cada um com alfa e apaga o lugar dele
 * no céu (preenchimento por difusão a partir da borda, com o grão da foto devolvido).
 * Usado pelo imagens.mjs; rodando sozinho grava prévias em revisao/gummies-hero/.
 */
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// caixas em px da hero-desktop.png (1672x941), com folga em volta do gummy
export const GUMMIES_HERO = [
  { nome: 'hg-1', x0: 1000, y0: 176, x1: 1128, y1: 284 },
  { nome: 'hg-2', x0: 864, y0: 296, x1: 954, y1: 380 },
  { nome: 'hg-3', x0: 1303, y0: 344, x1: 1422, y1: 466, suave: 2 },
  { nome: 'hg-4', x0: 804, y0: 354, x1: 850, y1: 402 },
]

/** Céu: azul domina o vermelho. Folha: verde ou amarelo, com pouco azul. Gummy: o resto (rosa, brilho branco, borda roxa). */
const ehCeu = (r, g, b) => b - r > 12
const ehFolha = (r, g, b) => g > r - 50 && b < g - 30
const ehGummy = (r, g, b) => !ehCeu(r, g, b) && !ehFolha(r, g, b)
/** Pixel que pode servir de fonte pro céu preenchido. */
const fonteCeu = (r, g, b) => b - r > 5 && !ehFolha(r, g, b) && r - g < 40

export async function soltarGummies(arquivo) {
  const { data, info } = await sharp(arquivo).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const limpo = Buffer.from(data)
  const pecas = []
  for (const c of GUMMIES_HERO) {
    const w = c.x1 - c.x0
    const h = c.y1 - c.y0
    const px = (x, y) => ((c.y0 + y) * W + c.x0 + x) * 3
    // 1. máscara pela cor, só o maior componente (gotas de respingo soltas ficam na foto)
    let m = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = px(x, y)
      m[y * w + x] = ehGummy(data[i], data[i + 1], data[i + 2]) ? 1 : 0
    }
    // abre a máscara (erode 3 px) pra quebrar pontes finas até a pitaya vizinha, fica o maior pedaço
    // e cresce de volta só por cima do que já era gummy
    const original = m
    m = maiorComponente(erode(fecharBuracos(m, w, h), w, h, 3), w, h)
    m = dilata(m, w, h, 4).map((v, k) => v & original[k])
    m = fecharBuracos(maiorComponente(m, w, h), w, h)
    // 2. alfa suave: máscara dilatada 1 px e desfocada
    const alfa = desfoca(dilata(m, w, h, 1), w, h, c.suave || 1)
    const rgba = Buffer.alloc(w * h * 4)
    for (let k = 0; k < w * h; k++) {
      const i = px(k % w, (k / w) | 0)
      rgba[k * 4] = data[i]
      rgba[k * 4 + 1] = data[i + 1]
      rgba[k * 4 + 2] = data[i + 2]
      rgba[k * 4 + 3] = Math.round(alfa[k] * 255)
      if (rgba[k * 4 + 3] < 8) rgba.fill(0, k * 4, k * 4 + 4)
    }
    // 3. buraco no céu: máscara dilatada 4 px, preenchida por difusão
    const buraco = dilata(m, w, h, 4)
    preencher(limpo, W, c, buraco)
    const caixa = limites(m, w, h)
    pecas.push({ ...c, rgba, w, h, caixa })
  }
  return { limpo, info, pecas }
}

function maiorComponente(m, w, h) {
  const rot = new Int32Array(w * h).fill(-1)
  let melhor = -1, maior = 0, n = 0
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || rot[i] >= 0) continue
    const fila = [i]
    rot[i] = n
    let area = 0
    while (fila.length) {
      const k = fila.pop()
      area++
      const x = k % w, y = (k / w) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (m[j] && rot[j] < 0) { rot[j] = n; fila.push(j) }
      }
    }
    if (area > maior) { maior = area; melhor = n }
    n++
  }
  return Uint8Array.from(rot, (r) => (r === melhor ? 1 : 0))
}

/** Tudo que não alcança a borda por fora da máscara vira máscara (brilho branco no meio do gummy). */
function fecharBuracos(m, w, h) {
  const fora = new Uint8Array(w * h)
  const fila = []
  for (let x = 0; x < w; x++) fila.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) fila.push(y * w, y * w + w - 1)
  while (fila.length) {
    const k = fila.pop()
    if (fora[k] || m[k]) continue
    fora[k] = 1
    const x = k % w, y = (k / w) | 0
    if (x > 0) fila.push(k - 1)
    if (x < w - 1) fila.push(k + 1)
    if (y > 0) fila.push(k - w)
    if (y < h - 1) fila.push(k + w)
  }
  return Uint8Array.from(fora, (f) => (f ? 0 : 1))
}

function erode(m, w, h, r) {
  const inv = m.map((v) => 1 - v)
  return dilata(inv, w, h, r).map((v) => 1 - v)
}

function dilata(m, w, h, r) {
  const o = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + r) continue
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) o[ny * w + nx] = 1
    }
  }
  return o
}

function desfoca(m, w, h, r) {
  const o = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      s += m[ny * w + nx]
      n++
    }
    o[y * w + x] = s / n
  }
  return o
}

/** Preenche o buraco pela média dos vizinhos (equação de Laplace), depois devolve um grão leve. */
function preencher(img, W, c, buraco) {
  const w = c.x1 - c.x0, h = c.y1 - c.y0
  const v = new Float32Array(w * h * 3)
  for (let k = 0; k < w * h; k++) {
    const i = ((c.y0 + ((k / w) | 0)) * W + c.x0 + (k % w)) * 3
    v[k * 3] = img[i]; v[k * 3 + 1] = img[i + 1]; v[k * 3 + 2] = img[i + 2]
  }
  // começa com a média da borda do buraco
  const fonte = new Uint8Array(w * h)
  for (let k = 0; k < w * h; k++) if (!buraco[k]) fonte[k] = fonteCeu(v[k * 3], v[k * 3 + 1], v[k * 3 + 2]) ? 1 : 0
  const media = [0, 0, 0]
  let nb = 0
  for (let k = 0; k < w * h; k++) {
    if (!fonte[k]) continue
    const x = k % w, y = (k / w) | 0
    const toca = (x > 0 && buraco[k - 1]) || (x < w - 1 && buraco[k + 1]) || (y > 0 && buraco[k - w]) || (y < h - 1 && buraco[k + w])
    if (!toca) continue
    for (let ch = 0; ch < 3; ch++) media[ch] += v[k * 3 + ch]
    nb++
  }
  for (let k = 0; k < w * h; k++) if (buraco[k]) for (let ch = 0; ch < 3; ch++) v[k * 3 + ch] = media[ch] / nb
  for (let it = 0; it < 1500; it++) {
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const k = y * w + x
      if (!buraco[k]) continue
      let n = 0
      const soma = [0, 0, 0]
      for (const j of [k - 1, k + 1, k - w, k + w]) {
        if (!buraco[j] && !fonte[j]) continue // folha e respingo isolam: não vazam cor pro céu
        n++
        for (let ch = 0; ch < 3; ch++) soma[ch] += v[j * 3 + ch]
      }
      if (n) for (let ch = 0; ch < 3; ch++) v[k * 3 + ch] = soma[ch] / n
    }
  }
  let s = 12345
  const ruido = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 3
  for (let k = 0; k < w * h; k++) {
    if (!buraco[k]) continue
    const i = ((c.y0 + ((k / w) | 0)) * W + c.x0 + (k % w)) * 3
    const g = ruido()
    for (let ch = 0; ch < 3; ch++) img[i + ch] = Math.max(0, Math.min(255, Math.round(v[k * 3 + ch] + g)))
  }
}

function limites(m, w, h) {
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return { x0: Math.max(0, x0 - 2), y0: Math.max(0, y0 - 2), x1: Math.min(w, x1 + 3), y1: Math.min(h, y1 + 3) }
}

// prévia
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const aqui = path.dirname(fileURLToPath(import.meta.url))
  const SRC = path.resolve(aqui, '../../086 - Rubi Gummies/Recursos Site/IMAGENS/hero-desktop.png')
  const OUT = path.resolve(aqui, '../revisao/gummies-hero')
  mkdirSync(OUT, { recursive: true })
  const { limpo, info, pecas } = await soltarGummies(SRC)
  await sharp(limpo, { raw: { width: info.width, height: info.height, channels: 3 } }).extract({ left: 780, top: 160, width: 680, height: 330 }).resize(1360).png().toFile(path.join(OUT, 'ceu-limpo.png'))
  for (const p of pecas) {
    await sharp(p.rgba, { raw: { width: p.w, height: p.h, channels: 4 } })
      .flatten({ background: '#0a2a5a' }).resize(p.w * 3, null, { kernel: 'nearest' }).png().toFile(path.join(OUT, `${p.nome}.png`))
  }
  console.log('prévias em', OUT)
}
