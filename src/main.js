import Lenis from 'lenis'
import { JawScene } from './scene.js'
import { DeviceViewer } from './device.js'

const canvas = document.getElementById('scene')
const jaw = new JawScene(canvas)
if (import.meta.env.DEV) window.__jaw = jaw   // dev-only inspection handle

/* ---------- loader ---------- */
const loader = document.getElementById('loader')
const bar = document.getElementById('loader-bar')
const pctEl = document.getElementById('loader-pct')

function setLoad(p) {
  const v = Math.max(0, Math.min(1, p))
  bar.style.width = (v * 100).toFixed(1) + '%'
  pctEl.textContent = String(Math.round(v * 100)).padStart(2, '0')
}

let creep = 0, lastReal = 0
const creepTimer = setInterval(() => {
  creep = Math.min(creep + 0.02, 0.85)
  setLoad(Math.max(creep, lastReal))
}, 120)

// runtime URLs must carry the deploy base — Vite only rewrites markup, not JS strings
const BASE = import.meta.env.BASE_URL

jaw.load(`${BASE}models/jaw.glb?v=6`, (p) => { lastReal = p * 0.95; setLoad(Math.max(creep, lastReal)) })
  .then(() => {
    clearInterval(creepTimer)
    setLoad(1)
    setTimeout(() => { loader.classList.add('hide'); document.body.dataset.ready = '1' }, 320)
  })
  .catch((err) => {
    clearInterval(creepTimer)
    console.error('GLB load failed:', err)
    pctEl.textContent = '—'
    loader.classList.add('hide')
  })

/* ---------- smooth scroll ---------- */
const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1.0, smoothWheel: true })
lenis.on('scroll', onScroll)
if (import.meta.env.DEV) window.__lenis = lenis

const railFill = document.getElementById('rail-fill')
const nav = document.getElementById('nav')

function scrollProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
}

function onScroll() {
  const p = scrollProgress()
  jaw.setProgress(p)
  railFill.style.width = (p * 100).toFixed(2) + '%'
  nav.classList.toggle('solid', window.scrollY > 40)
  // the model leads through hero + the three anatomy chapters, then recedes
  canvas.style.opacity = p > 0.34 ? '0' : '1'
}
canvas.style.transition = 'opacity .6s ease'

/* ---------- theme: a section owns the theme while it crosses the viewport middle ---------- */
const themed = [...document.querySelectorAll('[data-theme]')].filter((el) => el !== document.body)
const themeIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      const t = e.target.dataset.theme
      document.body.dataset.theme = t
      jaw.setTheme(t)   // scene dedupes internally
    }
  })
}, { rootMargin: '-50% 0px -50% 0px', threshold: 0 })
themed.forEach((el) => themeIO.observe(el))
jaw.setTheme(document.body.dataset.theme || 'light')   // apply the starting preset

/* ---------- reveal ---------- */
const revealSel = '.sec-head, .hero-copy, .hero-metrics, .stage-panel, .figures, .listing, .layers, .ai-grid, .shot, .shot-pair, .table-full, .team, .foot'
document.querySelectorAll(revealSel).forEach((el) => el.classList.add('rv'))

const revealIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return
    e.target.classList.add('in')
    e.target.querySelectorAll?.('.bar').forEach((b, i) => setTimeout(() => b.classList.add('run'), 90 * i))
    revealIO.unobserve(e.target)
  })
}, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' })
document.querySelectorAll('.rv').forEach((el) => revealIO.observe(el))

/* ---------- HoloLens viewer (lazy, renders only while on screen) ---------- */
const deviceCanvas = document.getElementById('deviceCanvas')
const device = deviceCanvas ? new DeviceViewer(deviceCanvas, `${BASE}models/hololens.glb`) : null
if (import.meta.env.DEV) window.__device = device
if (device) {
  const stage = document.getElementById('deviceStage')
  new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) device.start()
      device.setVisible(e.isIntersecting)
    })
  }, { rootMargin: '150px 0px' }).observe(stage)
}

/* ---------- cinematic reel: ambient loop -> full record on demand ---------- */
const reel = document.getElementById('reel')
if (reel) {
  const loop = document.getElementById('reelLoop')
  const full = document.getElementById('reelFull')
  const playBtn = document.getElementById('reelPlay')

  playBtn.addEventListener('click', () => {
    reel.classList.add('playing')
    loop.pause()
    full.play().catch(() => {})   // user gesture, but don't explode if blocked
  })
  full.addEventListener('ended', () => {
    reel.classList.remove('playing')
    loop.play().catch(() => {})
  })

  // only let the ambient loop run while it is actually on screen
  new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (reel.classList.contains('playing')) return
      if (e.isIntersecting) loop.play().catch(() => {})
      else loop.pause()
    })
  }, { threshold: 0.15 }).observe(reel)
}

/* ---------- annotations ---------- */
const annoWrap = document.getElementById('annotations')
const annoEls = {}
annoWrap.querySelectorAll('.anno').forEach((el) => { annoEls[el.dataset.key] = el })

function placeAnnotations() {
  if (scrollProgress() > 0.32) {
    for (const key in annoEls) annoEls[key].classList.remove('show')
    return
  }
  const pos = jaw.screenAnchors()
  for (const key in annoEls) {
    const el = annoEls[key], p = pos[key]
    if (p) {
      el.style.transform = `translate(${p.x}px, ${p.y}px)`
      el.classList.add('show')
    } else {
      el.classList.remove('show')
    }
  }
}

/* ---------- RAF ---------- */
function frame(time) {
  lenis.raf(time)
  jaw.render()
  device?.render()
  placeAnnotations()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href')
    if (id.length > 1) {
      const t = document.querySelector(id)
      if (t) { e.preventDefault(); lenis.scrollTo(t, { offset: 0 }) }
    }
  })
})

onScroll()
