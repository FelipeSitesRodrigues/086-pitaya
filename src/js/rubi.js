/* Rubi: comportamento da página. Sem biblioteca. Tudo em transform/opacity. */
(() => {
  const raiz = document.documentElement
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches
  const temIO = 'IntersectionObserver' in window
  const hero = document.querySelector('.hero')

  /* ---------- seções: .vis (entrou uma vez) e .ativa (perto da tela, anima) ---------- */
  const blocos = document.querySelectorAll('.hero, main > section, .rodape')
  blocos.forEach((b) => b.querySelectorAll(':scope > .flu').forEach((f, k) => f.style.setProperty('--k', k)))
  if (temIO) {
    const ioVis = new IntersectionObserver(
      (itens) => {
        for (const i of itens) {
          if (!i.isIntersecting) continue
          i.target.classList.add('vis')
          ioVis.unobserve(i.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px' }
    )
    const ioAtiva = new IntersectionObserver(
      (itens) => {
        for (const i of itens) i.target.classList.toggle('ativa', i.isIntersecting)
      },
      { rootMargin: '200px 0px' }
    )
    blocos.forEach((b) => {
      if (b !== hero) ioVis.observe(b)
      ioAtiva.observe(b)
    })
  } else {
    blocos.forEach((b) => b.classList.add('vis', 'ativa'))
  }
  // o hero entra junto com o título
  setTimeout(() => hero && hero.classList.add('vis'), reduz ? 0 : 520)

  /* ---------- revelar ao rolar, em cascata por grupo ---------- */
  if (temIO && !reduz) {
    const seletor = [
      '.numero',
      '.titulo:not(.hero__titulo)',
      '.sub-centro',
      '.beneficios__arte',
      '.beneficios__texto > p',
      '.pilulas li',
      '.problema',
      '.problemas .centro',
      '.passo',
      '.como__foto',
      '.kit',
      '.selo',
      '.garantia__texto',
      '.fala',
      '.depo__nota',
      '.depo .centro',
      '.faq__lista details',
      '.final__conteudo > *',
      '.rodape__grade > *',
    ].join(',')
    const alvos = document.querySelectorAll(seletor)
    const contagem = new Map()
    alvos.forEach((el) => {
      const pai = el.parentElement
      const n = contagem.get(pai) || 0
      contagem.set(pai, n + 1)
      el.style.setProperty('--rd', `${Math.min(n, 8) * 0.07}s`)
      el.classList.add('rev')
    })
    const ioRev = new IntersectionObserver(
      (itens) => {
        for (const i of itens) {
          if (!i.isIntersecting) continue
          i.target.classList.add('in')
          ioRev.unobserve(i.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    )
    alvos.forEach((el) => ioRev.observe(el))
  }
  raiz.classList.add('js')

  /* ---------- contadores (o HTML já traz o valor final) ---------- */
  if (temIO && !reduz) {
    const ioConta = new IntersectionObserver(
      (itens) => {
        for (const i of itens) {
          if (!i.isIntersecting) continue
          ioConta.unobserve(i.target)
          const el = i.target
          const fim = Number(el.dataset.conta)
          const ini = performance.now()
          const dur = 1200
          el.textContent = '0'
          const passo = (t) => {
            const p = Math.min(1, (t - ini) / dur)
            el.textContent = Math.round(fim * (1 - Math.pow(1 - p, 4)))
            if (p < 1) requestAnimationFrame(passo)
          }
          requestAnimationFrame(passo)
        }
      },
      { threshold: 0.6 }
    )
    document.querySelectorAll('[data-conta]').forEach((el) => ioConta.observe(el))
  }

  /* ---------- fitas e faixa de frete: marquee que acelera e vira com a rolagem ----------
     O deslize é uma Web Animation (roda no compositor, sem custo de thread principal).
     A rolagem só mexe no playbackRate e na inclinação, e só enquanto a página está rolando. */
  const trilhos = [...document.querySelectorAll('[data-vel]')].map((el) => ({
    el,
    grupo: el.firstElementChild,
    base: Number(el.dataset.vel),
    anim: null,
  }))

  function montar() {
    for (const t of trilhos) {
      if (t.anim) t.anim.cancel()
      // deixa só o grupo original e clona até cobrir a tela com folga
      while (t.el.children.length > 1) t.el.lastElementChild.remove()
      const w = t.grupo.getBoundingClientRect().width
      if (!w) continue
      const precisa = Math.ceil((innerWidth * 1.25) / w) + 1
      for (let i = 0; i < precisa; i++) {
        const c = t.grupo.cloneNode(true)
        c.setAttribute('aria-hidden', 'true')
        t.el.appendChild(c)
      }
      const quadros = [{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${-w}px,0,0)` }]
      if (t.base > 0) quadros.reverse()
      const dur = (w / Math.abs(t.base)) * 1000
      t.anim = t.el.animate(quadros, { duration: dur, iterations: Infinity })
      // começa longe do zero, pra poder andar de ré quando a rolagem sobe
      t.anim.currentTime = dur * 400 + Math.random() * dur
    }
  }

  if (trilhos.length && !reduz && 'animate' in Element.prototype) {
    let vel = 0
    let ultimoY = scrollY
    let ultimoT = 0
    let sentido = 1
    let rodando = false
    let quieto = 0

    const quadro = (agora) => {
      const dt = Math.max(8, Math.min(64, agora - ultimoT)) / 1000
      ultimoT = agora
      const y = scrollY
      const inst = (y - ultimoY) / dt
      ultimoY = y
      vel += (inst - vel) * 0.14
      if (vel > 30) sentido = 1
      else if (vel < -30) sentido = -1
      const turbo = 1 + Math.min(Math.abs(vel) / 240, 6)
      const inclina = Math.max(-11, Math.min(11, -vel / 130))
      for (const t of trilhos) {
        if (!t.anim) continue
        t.anim.playbackRate = turbo * sentido
        t.el.style.setProperty('--sk', `${(inclina * Math.sign(t.base)).toFixed(2)}deg`)
      }
      quieto = Math.abs(vel) < 4 && inst === 0 ? quieto + 1 : 0
      if (quieto > 12) {
        for (const t of trilhos) {
          if (!t.anim) continue
          t.anim.playbackRate = sentido
          t.el.style.setProperty('--sk', '0deg')
        }
        vel = 0
        rodando = false
        return
      }
      requestAnimationFrame(quadro)
    }

    // a escuta só acorda o quadro; o trabalho fica no requestAnimationFrame
    addEventListener(
      'scroll',
      () => {
        if (rodando) return
        rodando = true
        quieto = 0
        ultimoY = scrollY
        ultimoT = performance.now()
        requestAnimationFrame(quadro)
      },
      { passive: true }
    )

    const iniciar = () => {
      montar()
      if (temIO) {
        const ioFita = new IntersectionObserver((itens) => {
          for (const i of itens) {
            const t = trilhos.find((x) => i.target.contains(x.el))
            if (t && t.anim) i.isIntersecting ? t.anim.play() : t.anim.pause()
          }
        })
        trilhos.forEach((t) => ioFita.observe(t.el.parentElement))
      }
      let espera
      addEventListener('resize', () => {
        clearTimeout(espera)
        espera = setTimeout(montar, 250)
      })
    }
    // mede uma vez só, com a fonte já carregada (a largura do texto muda quando ela chega)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(iniciar)
    else addEventListener('load', iniciar)
  }

  /* ---------- paralaxe do mouse no hero ---------- */
  if (hero && !reduz && matchMedia('(pointer: fine)').matches) {
    let alvoX = 0, alvoY = 0, x = 0, y = 0, anda = false
    const passo = () => {
      x += (alvoX - x) * 0.08
      y += (alvoY - y) * 0.08
      hero.style.setProperty('--mx', x.toFixed(3))
      hero.style.setProperty('--my', y.toFixed(3))
      if (Math.abs(alvoX - x) > 0.001 || Math.abs(alvoY - y) > 0.001) requestAnimationFrame(passo)
      else anda = false
    }
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect()
      alvoX = (e.clientX - r.left) / r.width - 0.5
      alvoY = (e.clientY - r.top) / r.height - 0.5
      if (!anda) {
        anda = true
        requestAnimationFrame(passo)
      }
    })
    hero.addEventListener('pointerleave', () => {
      alvoX = alvoY = 0
      if (!anda) {
        anda = true
        requestAnimationFrame(passo)
      }
    })
  }

  /* ---------- rolagem suave (Lenis) ----------
     Só no computador (no toque a rolagem nativa já é suave) e fora do movimento reduzido.
     Entra depois do carregamento, pra não pesar na primeira pintura. Ele move a rolagem nativa,
     então as fitas, a paralaxe por scroll-timeline e os observadores seguem funcionando. */
  if (!reduz && matchMedia('(pointer: fine)').matches) {
    const ligar = () => {
      const s = document.createElement('script')
      s.src = document.querySelector('script[src*="rubi.js"]').src.replace(/rubi\.js[^]*$/, 'lenis.min.js')
      s.onload = () => {
        if (!window.Lenis) return
        window.lenis = new window.Lenis({ lerp: 0.09, wheelMultiplier: 1, anchors: true, autoRaf: true })
      }
      document.head.appendChild(s)
    }
    const depois = () => ('requestIdleCallback' in window ? requestIdleCallback(ligar, { timeout: 1500 }) : setTimeout(ligar, 300))
    if (document.readyState === 'complete') depois()
    else addEventListener('load', depois, { once: true })
  }

  /* ---------- barra de compra fixa no celular ---------- */
  const barra = document.getElementById('barra-cta')
  if (barra && temIO) {
    const vendo = new Set()
    const ioBarra = new IntersectionObserver((itens) => {
      for (const i of itens) i.isIntersecting ? vendo.add(i.target) : vendo.delete(i.target)
      barra.classList.toggle('visivel', vendo.size === 0)
    })
    document.querySelectorAll('.hero, #kits, .final, .rodape').forEach((el) => ioBarra.observe(el))
  }
})()
