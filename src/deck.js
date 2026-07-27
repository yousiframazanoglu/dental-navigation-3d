import { JawScene } from './scene.js'
import { DeviceViewer } from './device.js'

const BASE = import.meta.env.BASE_URL
const slides = [...document.querySelectorAll('.slide')]
const canvas = document.getElementById('scene')
const jaw = new JawScene(canvas)
jaw.setTheme('dark')

/* ---------- loader ---------- */
const loader = document.getElementById('loader')
const bar = document.getElementById('loader-bar')
let creep = 0, real = 0
const timer = setInterval(() => { creep = Math.min(creep + 0.03, 0.9); paint() }, 110)
function paint() { bar.style.width = (Math.max(creep, real) * 100).toFixed(1) + '%' }

jaw.load(`${BASE}models/jaw.glb?v=6`, (p) => { real = p * 0.95; paint() })
  .then(() => {
    clearInterval(timer); real = 1; paint()
    setTimeout(() => { loader.classList.add('hide'); document.body.dataset.ready = '1' }, 300)
  })
  .catch((e) => { clearInterval(timer); console.error(e); loader.classList.add('hide') })

/* ---------- HoloLens viewer (lazy: only when its slide is reached) ---------- */
const deviceCanvas = document.getElementById('deviceCanvas')
const device = deviceCanvas ? new DeviceViewer(deviceCanvas, `${BASE}models/hololens.glb`) : null

/* ---------- navigation ---------- */
const countEl = document.getElementById('count')
const barFill = document.getElementById('bar-fill')
const help = document.getElementById('help')
const video = document.getElementById('deckVideo')
let index = 0

function show(i, push = true) {
  index = Math.max(0, Math.min(slides.length - 1, i))
  slides.forEach((s, n) => s.classList.toggle('is-active', n === index))
  const slide = slides[index]

  // the jaw model only appears on slides that ask for it
  const jawAt = slide.dataset.jaw
  canvas.classList.toggle('on', jawAt !== undefined)
  if (jawAt !== undefined) jaw.setProgress(parseFloat(jawAt))

  // the device viewer boots the first time its slide is shown
  const wantsDevice = slide.hasAttribute('data-device')
  if (device) { if (wantsDevice) device.start(); device.setVisible(wantsDevice) }

  // never let the video keep playing behind another slide
  if (video && !slide.hasAttribute('data-video')) video.pause()

  countEl.textContent = `${index + 1} / ${slides.length}`
  barFill.style.width = ((index / (slides.length - 1)) * 100).toFixed(2) + '%'
  if (push) history.replaceState(null, '', '#' + (index + 1))
  help.classList.toggle('fade', index > 0)
}

const next = () => show(index + 1)
const prev = () => show(index - 1)

document.getElementById('next').addEventListener('click', next)
document.getElementById('prev').addEventListener('click', prev)
document.getElementById('full').addEventListener('click', toggleFullscreen)

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen?.().catch(() => {})
}

function toggleOverview() {
  const on = document.body.classList.toggle('overview')
  if (!on) show(index, false)
}

window.addEventListener('keydown', (e) => {
  // don't hijack keys while scrubbing the video
  if (e.target.tagName === 'VIDEO' && ['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) return
  switch (e.key) {
    case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); next(); break
    case 'ArrowLeft': case 'PageUp': e.preventDefault(); prev(); break
    case 'Home': e.preventDefault(); show(0); break
    case 'End': e.preventDefault(); show(slides.length - 1); break
    case 'f': case 'F': toggleFullscreen(); break
    case 'Escape': toggleOverview(); break
  }
})

// click a thumbnail in overview to jump there
slides.forEach((s, n) => s.addEventListener('click', () => {
  if (document.body.classList.contains('overview')) { document.body.classList.remove('overview'); show(n) }
}))

// deep link: #7 opens slide 7
const fromHash = parseInt(location.hash.slice(1), 10)
show(Number.isFinite(fromHash) && fromHash > 0 ? fromHash - 1 : 0, false)

/* ---------- annotations tracked to the 3D model ---------- */
const annoEls = {}
document.querySelectorAll('.anno').forEach((el) => { annoEls[el.dataset.key] = el })

function placeAnnotations() {
  const on = canvas.classList.contains('on')
  const pos = on ? jaw.screenAnchors() : {}
  for (const key in annoEls) {
    const el = annoEls[key], p = pos[key]
    if (p) { el.style.transform = `translate(${p.x}px, ${p.y}px)`; el.classList.add('show') }
    else el.classList.remove('show')
  }
}

/* ---------- render loop ---------- */
function frame() {
  jaw.render()
  device?.render()
  placeAnnotations()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
