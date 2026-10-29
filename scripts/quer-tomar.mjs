/**
 * "QUER TOMAR" em gummy de pitaya, igual à referência do Felipe: contorno vermelho-escuro por fora,
 * filete branco brilhante por dentro da borda, miolo framboesa manchado, gotas, bolhas e brilhos.
 * Os contornos vêm da Anton (scripts/dados/quer-tomar.json, extraído com fontTools) e o SVG é
 * gravado em WebP; no HTML a frase segue como texto (escondido) pra busca e leitor de tela.
 *
 *   node scripts/quer-tomar.mjs          grava src/img/quer-tomar-*.webp e revisao/quer-tomar.png
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const dados = JSON.parse(readFileSync(path.join(aqui, 'dados/quer-tomar.json'), 'utf8'))
const CAP = dados.cap

// folga em volta das letras (contorno, sombra e cauda do Q), em unidades da fonte
const F = { esq: 70, dir: 90, topo: 90, base: 300 }
const X0 = -F.esq
const Y0 = -F.topo
const W = dados.largura - 480 * 0 + F.esq + F.dir
const H = CAP + F.topo + F.base

function prng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** bolhas, gotas e brilhos em posições fixas por letra (frações da largura e da altura da letra) */
function detalhes() {
  const r = prng(11)
  let bolhas = ''
  let gotas = ''
  let brilhos = ''
  let reflexos = ''
  for (const l of dados.letras) {
    const n = l.ch === 'M' ? 3 : 2
    for (let i = 0; i < n; i++) {
      const cx = l.x + l.w * (0.25 + r() * 0.5)
      const cy = CAP * (0.18 + r() * 0.66)
      const rr = 38 + r() * 30
      bolhas += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rr.toFixed(0)}" fill="url(#gota)" stroke="#fff" stroke-opacity=".5" stroke-width="8"/>`
      bolhas += `<path d="M${(cx - rr * 0.7).toFixed(0)} ${(cy + rr * 0.5).toFixed(0)}A${rr.toFixed(0)} ${rr.toFixed(0)} 0 0 0 ${(cx + rr * 0.75).toFixed(0)} ${(cy + rr * 0.45).toFixed(0)}" fill="none" stroke="#8E0035" stroke-opacity=".45" stroke-width="7" stroke-linecap="round"/>`
      bolhas += `<circle cx="${(cx - rr * 0.35).toFixed(0)}" cy="${(cy - rr * 0.38).toFixed(0)}" r="${(rr * 0.2).toFixed(0)}" fill="#fff" fill-opacity=".9"/>`
    }
    for (let i = 0; i < 12; i++) {
      const cx = l.x + l.w * (0.12 + r() * 0.76)
      const cy = CAP * (0.08 + r() * 0.86)
      const rr = 6 + r() * 12
      gotas += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rr.toFixed(1)}" fill="#fff" fill-opacity="${(0.55 + r() * 0.4).toFixed(2)}"/>`
    }
    // reflexo diagonal suave
    {
      const x1 = l.x + l.w * 0.18
      const x2 = l.x + l.w * 0.62
      reflexos += `<path d="M${x1.toFixed(0)} ${CAP * 0.62}L${x2.toFixed(0)} ${CAP * 0.08}" stroke="#fff" stroke-opacity=".16" stroke-width="${(l.w * 0.16).toFixed(0)}" stroke-linecap="round"/>`
      reflexos += `<path d="M${(x1 + l.w * 0.2).toFixed(0)} ${CAP * 0.72}L${(x2 + l.w * 0.16).toFixed(0)} ${CAP * 0.26}" stroke="#fff" stroke-opacity=".1" stroke-width="${(l.w * 0.05).toFixed(0)}" stroke-linecap="round"/>`
    }
    if (r() < 0.7) {
      const cx = l.x + (r() < 0.5 ? 40 : l.w - 40)
      const cy = 30 + r() * 30
      const s = 40 + r() * 34
      brilhos += `<path d="M${cx} ${cy - s}Q${cx} ${cy} ${cx + s} ${cy}Q${cx} ${cy} ${cx} ${cy + s}Q${cx} ${cy} ${cx - s} ${cy}Q${cx} ${cy} ${cx} ${cy - s}Z" fill="#fff" fill-opacity=".95"/>`
    }
  }
  return { bolhas, gotas, brilhos, reflexos }
}

export function svgQuerTomar() {
  const { bolhas, gotas, brilhos, reflexos } = detalhes()
  const reg = `x="${X0}" y="${Y0}" width="${W}" height="${H}" filterUnits="userSpaceOnUse"`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${X0} ${Y0} ${W} ${H}" width="${W}" height="${H}">
<defs>
  <linearGradient id="brilho" x1="0" y1="0" x2="0" y2="${CAP}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff" stop-opacity=".42"/>
    <stop offset=".22" stop-color="#fff" stop-opacity=".14"/>
    <stop offset=".45" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="gota" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity=".18"/></radialGradient>
  <filter id="suave" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>
  <clipPath id="letras"><path d="${dados.d}"/></clipPath>
  <filter id="corpo" ${reg} color-interpolation-filters="sRGB">
    <!-- contorno vermelho-escuro por fora, extrusão curta e sombra -->
    <feMorphology in="SourceAlpha" operator="dilate" radius="34" result="aro"/>
    <feGaussianBlur in="aro" stdDeviation="36" result="aroB"/>
    <feOffset in="aroB" dy="70" result="somO"/>
    <feFlood flood-color="#3A0024" flood-opacity=".42"/>
    <feComposite in2="somO" operator="in" result="sombra"/>
    <feOffset in="aro" dy="38" result="extO"/>
    <feFlood flood-color="#7A0022"/>
    <feComposite in2="extO" operator="in" result="extrusao"/>
    <feFlood flood-color="#B4002E"/>
    <feComposite in2="aro" operator="in" result="contorno"/>
    <!-- miolo framboesa -->
    <feFlood flood-color="#F4176C"/>
    <feComposite in2="SourceAlpha" operator="in" result="miolo"/>
    <!-- manchas mais escuras no meio (ruído grosso) -->
    <feTurbulence type="fractalNoise" baseFrequency=".0026" numOctaves="3" seed="4" result="ruido"/>
    <feColorMatrix in="ruido" type="matrix" values="0 0 0 0 .78  0 0 0 0 .02  0 0 0 0 .22  2.2 0 0 0 -1.12" result="manchaC"/>
    <feComposite in="manchaC" in2="SourceAlpha" operator="in" result="manchas"/>
    <!-- rosa mais claro perto da borda, por dentro -->
    <feGaussianBlur in="SourceAlpha" stdDeviation="55" result="desf"/>
    <feComposite in="SourceAlpha" in2="desf" operator="out" result="bordaA"/>
    <feFlood flood-color="#FF5C9C" flood-opacity=".85"/>
    <feComposite in2="bordaA" operator="in" result="bordaClara"/>
    <!-- filete branco por dentro da borda -->
    <feMorphology in="SourceAlpha" operator="erode" radius="17" result="dentro"/>
    <feMorphology in="dentro" operator="dilate" radius="9" result="dentroD"/>
    <feComposite in="dentroD" in2="dentro" operator="out" result="fileteA"/>
    <feGaussianBlur in="fileteA" stdDeviation="2.5" result="fileteB"/>
    <feFlood flood-color="#FFFFFF" flood-opacity=".95"/>
    <feComposite in2="fileteB" operator="in" result="filete"/>
    <!-- realce fino na borda de fora da letra (luz batendo no chanfro) -->
    <feMorphology in="SourceAlpha" operator="erode" radius="6" result="quase"/>
    <feComposite in="SourceAlpha" in2="quase" operator="out" result="realceA"/>
    <feFlood flood-color="#FFC2DC" flood-opacity=".85"/>
    <feComposite in2="realceA" operator="in" result="realce"/>
    <!-- sementinhas escuras (ruído fino com limiar) -->
    <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="1" seed="21" result="r2"/>
    <feColorMatrix in="r2" type="matrix" values="0 0 0 0 .6  0 0 0 0 .02  0 0 0 0 .14  30 0 0 0 -22.4" result="sementeC"/>
    <feComposite in="sementeC" in2="dentro" operator="in" result="sementes"/>
    <feMerge>
      <feMergeNode in="sombra"/>
      <feMergeNode in="extrusao"/>
      <feMergeNode in="contorno"/>
      <feMergeNode in="miolo"/>
      <feMergeNode in="manchas"/>
      <feMergeNode in="bordaClara"/>
      <feMergeNode in="sementes"/>
      <feMergeNode in="filete"/>
    </feMerge>
  </filter>
</defs>
<path d="${dados.d}" fill="#000" filter="url(#corpo)"/>
<g clip-path="url(#letras)">
  <rect x="${X0}" y="${Y0}" width="${W}" height="${CAP}" fill="url(#brilho)"/>
  <g filter="url(#suave)">${reflexos}</g>
  ${bolhas}${gotas}
</g>
${brilhos}
</svg>`
}

export const PROPORCAO = H / W
export const CAIXA = { X0, Y0, W, H, CAP }

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const svg = Buffer.from(svgQuerTomar())
  mkdirSync(path.resolve(aqui, '../revisao'), { recursive: true })
  writeFileSync(path.resolve(aqui, '../revisao/quer-tomar.svg'), svg)
  await sharp(svg, { density: 72 * (1300 / W) }).resize(1300).png().toFile(path.resolve(aqui, '../revisao/quer-tomar.png'))
  await sharp(svg, { density: 72 * (1300 / W) }).resize(1300).flatten({ background: '#2F8FE0' }).png().toFile(path.resolve(aqui, '../revisao/quer-tomar-azul.png'))
  console.log('prévia em revisao/quer-tomar-azul.png', W, H)
}
