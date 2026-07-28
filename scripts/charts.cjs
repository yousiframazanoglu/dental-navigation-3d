/**
 * Charts built from the project's own nnU-Net validation output
 * (scripts/metrikler.json, derived from summary.json + the training log).
 * Vector SVG so they stay crisp at A0 poster size.
 * Palette validated with the dataviz validator (all checks pass).
 *
 * Emits one file per language into public/img/:
 *   egitim_egrisi.svg     dice_f_vs_p.svg     dice_siniflar.svg      (tr)
 *   egitim_egrisi.en.svg  dice_f_vs_p.en.svg  dice_siniflar.en.svg   (en)
 *   egitim_egrisi.ar.svg  dice_f_vs_p.ar.svg  dice_siniflar.ar.svg   (ar)
 *
 * The <svg> root carries direction="ltr" on purpose. Without it the
 * Arabic page's dir=rtl propagates in, text-anchor start/end swap, and
 * every left-hand label lands on top of its bar. Arabic label runs still
 * shape right-to-left on their own — bidi resolves them inside the run.
 *
 * Run:  node scripts/charts.js
 */
const fs = require('fs')
const path = require('path')

const INK = '#0E1116', MUT = '#5C6675', GRID = '#E3E5E9'
const PRI = '#1B44E5', DANGER = '#C9342B', AMBER = '#A9761B'
const FONT = "'Inter Tight','Inter',system-ui,sans-serif"
const MONO = "'JetBrains Mono',ui-monospace,monospace"

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

/* ---------- localisation ---------- */
// keys follow the fixed order of the arrays in metrikler.json
const KEYS = ['mandible', 'pharynx', 'lowerTeeth', 'upperTeeth', 'sinus', 'canal', 'maxilla']

const L10N = {
  tr: {
    dec: ',',
    classTitle: 'Sınıf bazında Dice katsayısı',
    classSub: (n) => `Yapının referansta etiketli olduğu vakalar · ${n} doğrulama hacmi · nnU-Net v2`,
    classAria: (n) => `Sınıf bazında Dice katsayısı, ${n} doğrulama vakası`,
    mean: 'ort.',
    curveTitle: 'Eğitim eğrisi — pseudo-Dice',
    curveSub: (b) => `100 epoch · 3d_fullres · RTX 5070 Ti · en iyi EMA ${b}`,
    curveAria: (b) => `100 epoch boyunca pseudo-Dice eğitim eğrisi, en iyi EMA ${b}`,
    legendEma: 'EMA pseudo-Dice',
    legendPer: 'epoch başına',
    axisEpoch: 'epoch',
    fvspTitle: 'Eksik etiketlerin ölçüme etkisi',
    fvspSub: 'Yapı referansta yoksa Dice sıfır yazılır; bu vakalar ortalamayı yapay olarak düşürür',
    fvspAria: 'Tam etiketli ve kısmi etiketli doğrulama alt kümelerinde sınıf bazında Dice karşılaştırması',
    legendLabelled: 'Yapı etiketliyken',
    legendRaw: 'Ham ortalama (96 vaka)',
    note: (n) => `yalnız ${n}/96 vakada etiketli`,
    names: {
      mandible: 'Alt çene', pharynx: 'Farenks', lowerTeeth: 'Alt dişler', upperTeeth: 'Üst dişler',
      sinus: 'Maksiller sinüs', canal: 'Alveoler kanal', maxilla: 'Üst çene',
    },
  },
  en: {
    dec: '.',
    classTitle: 'Dice coefficient by class',
    classSub: (n) => `Cases where the structure is annotated in the reference · ${n} validation volumes · nnU-Net v2`,
    classAria: (n) => `Dice coefficient by class across ${n} validation cases`,
    mean: 'mean',
    curveTitle: 'Training curve — pseudo-Dice',
    curveSub: (b) => `100 epochs · 3d_fullres · RTX 5070 Ti · best EMA ${b}`,
    curveAria: (b) => `Pseudo-Dice training curve over 100 epochs, best EMA ${b}`,
    legendEma: 'EMA pseudo-Dice',
    legendPer: 'per epoch',
    axisEpoch: 'epoch',
    fvspTitle: 'How missing labels depress the score',
    fvspSub: 'A structure absent from the reference scores Dice zero; those cases pull the mean down artificially',
    fvspAria: 'Per-class Dice compared across the fully and partially annotated validation subsets',
    legendLabelled: 'Where the structure is labelled',
    legendRaw: 'Raw mean (96 cases)',
    note: (n) => `labelled in only ${n}/96 cases`,
    names: {
      mandible: 'Mandible', pharynx: 'Pharynx', lowerTeeth: 'Lower teeth', upperTeeth: 'Upper teeth',
      sinus: 'Maxillary sinus', canal: 'Alveolar canal', maxilla: 'Maxilla',
    },
  },
  ar: {
    dec: '.',
    classTitle: 'معامل Dice لكلّ صنف',
    classSub: (n) => `الحالات التي تحمل توسيمًا مرجعيًّا للبنية · ${n} حجم تحقّق · nnU-Net v2`,
    classAria: (n) => `معامل Dice لكلّ صنف على ${n} حالة تحقّق`,
    mean: 'المتوسّط',
    curveTitle: 'منحنى التدريب — pseudo-Dice',
    curveSub: (b) => `100 epochs · 3d_fullres · RTX 5070 Ti · أفضل EMA ${b}`,
    curveAria: (b) => `منحنى تدريب pseudo-Dice على امتداد 100 حقبة، أفضل EMA ${b}`,
    legendEma: 'EMA pseudo-Dice',
    legendPer: 'لكلّ حقبة',
    axisEpoch: 'الحقبة',
    fvspTitle: 'أثر التوسيم الناقص على القياس',
    fvspSub: 'البنية الغائبة عن المرجع تُسجَّل Dice صفرًا؛ وهذه الحالات تخفض المتوسّط خفضًا مصطنعًا',
    fvspAria: 'مقارنة Dice لكلّ صنف بين مجموعتَي التحقّق كاملة التوسيم وجزئيّته',
    legendLabelled: 'حين تكون البنية موسَّمة',
    legendRaw: 'المتوسّط الخام (96 حالة)',
    note: (n) => `موسَّمة في ${n}/96 حالة فقط`,
    names: {
      mandible: 'الفكّ السفلي', pharynx: 'البلعوم', lowerTeeth: 'الأسنان السفلية', upperTeeth: 'الأسنان العلوية',
      sinus: 'الجيب الفكّي العلوي', canal: 'القناة السنخية', maxilla: 'الفكّ العلوي',
    },
  },
}

const mk = (lang) => {
  const t = L10N[lang]
  return {
    t,
    fmt: (v) => v.toFixed(4).replace('.', t.dec),
    fmt2: (v) => v.toFixed(2).replace('.', t.dec),
    name: (key) => t.names[key] || key,
  }
}

const SVG_OPEN = (W, H, aria) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" direction="ltr" aria-label="${esc(aria)}">`

/* ---------- 1) per-class Dice, scored only where the structure is annotated ---------- */
function classDice(rows, { mean, n }, lang) {
  const { t, fmt, fmt2, name } = mk(lang)
  const W = 780, rowH = 30, gap = 11, L = 215, R = 74
  const H = 74 + rows.length * (rowH + gap) + 30
  const plot = W - L - R
  const x = (v) => L + v * plot

  const bars = rows.map((r, i) => {
    const y = 74 + i * (rowH + gap)
    const w = Math.max(3, r.dice * plot)
    const c = r.kritik ? DANGER : PRI
    const nlbl = r.n != null ? `<tspan fill="${MUT}" font-size="11.5"> n=${r.n}</tspan>` : ''
    return `
    <text x="${L - 16}" y="${y + rowH / 2 + 5}" text-anchor="end" font-family="${FONT}" font-size="15" fill="${INK}">${esc(name(r.key))}${nlbl}</text>
    <rect x="${L}" y="${y}" width="${w}" height="${rowH}" rx="4" fill="${c}"/>
    <text x="${L + w + 12}" y="${y + rowH / 2 + 5}" font-family="${MONO}" font-size="14" fill="${INK}">${fmt(r.dice)}</text>`
  }).join('')

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((tk) => `
    <line x1="${x(tk)}" y1="60" x2="${x(tk)}" y2="${H - 30}" stroke="${GRID}" stroke-width="1"/>
    <text x="${x(tk)}" y="${H - 12}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="${MUT}">${fmt2(tk)}</text>`).join('')

  return `${SVG_OPEN(W, H, t.classAria(n))}
  <text x="0" y="20" font-family="${FONT}" font-size="17" font-weight="600" fill="${INK}">${esc(t.classTitle)}</text>
  <text x="0" y="42" font-family="${MONO}" font-size="12.5" fill="${MUT}">${esc(t.classSub(n))}</text>
  ${ticks}
  <line x1="${x(mean)}" y1="60" x2="${x(mean)}" y2="${H - 30}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="5 4"/>
  <text x="${x(mean)}" y="56" text-anchor="middle" font-family="${MONO}" font-size="12" fill="${INK}">${esc(t.mean)} ${fmt(mean)}</text>
  ${bars}
  <line x1="${L}" y1="${H - 30}" x2="${W - R}" y2="${H - 30}" stroke="${INK}" stroke-width="1"/>
</svg>`
}

/* ---------- 2) training curve ---------- */
function trainingCurve(epochs, lang) {
  const { t, fmt, fmt2 } = mk(lang)
  // T leaves room for title + subtitle + legend; B for tick row + axis caption
  const W = 780, H = 366, L = 60, R = 24, T = 92, B = 58
  const pw = W - L - R, ph = H - T - B
  const x = (e) => L + (e / (epochs.length - 1)) * pw
  const y = (v) => T + (1 - v) * ph

  const line = (key, color, width, opacity = 1) => {
    const d = epochs.map((e, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(e[key]).toFixed(1)}`).join(' ')
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" opacity="${opacity}"/>`
  }

  const gy = [0, 0.25, 0.5, 0.75, 1].map((tk) => `
    <line x1="${L}" y1="${y(tk)}" x2="${W - R}" y2="${y(tk)}" stroke="${GRID}" stroke-width="1"/>
    <text x="${L - 12}" y="${y(tk) + 4}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${MUT}">${fmt2(tk)}</text>`).join('')
  const gx = [0, 25, 50, 75, 99].map((e) => `
    <text x="${x(e)}" y="${H - B + 22}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="${MUT}">${e + 1}</text>`).join('')

  const last = epochs[epochs.length - 1]
  const best = Math.max(...epochs.map((e) => e.ema ?? 0))

  // legend labels differ in width per language, so lay the second swatch out
  // after the first label instead of at a hard-coded x
  const emaW = t.legendEma.length * 6.6 + 46

  return `${SVG_OPEN(W, H, t.curveAria(fmt(best)))}
  <text x="0" y="20" font-family="${FONT}" font-size="17" font-weight="600" fill="${INK}">${esc(t.curveTitle)}</text>
  <text x="0" y="42" font-family="${MONO}" font-size="12.5" fill="${MUT}">${esc(t.curveSub(fmt(best)))}</text>
  ${gy}${gx}
  ${line('pdice', PRI, 1.5, 0.32)}
  ${line('ema', PRI, 2.5)}
  <circle cx="${x(epochs.length - 1)}" cy="${y(last.ema)}" r="4.5" fill="${PRI}" stroke="#fff" stroke-width="2"/>
  <text x="${x(epochs.length - 1) - 10}" y="${y(last.ema) - 12}" text-anchor="end" font-family="${MONO}" font-size="13" fill="${INK}">${fmt(last.ema)}</text>
  <g font-family="${MONO}" font-size="12" fill="${MUT}">
    <rect x="0" y="60" width="22" height="2.5" rx="1.2" fill="${PRI}"/>
    <text x="30" y="66" fill="${INK}">${esc(t.legendEma)}</text>
    <rect x="${emaW}" y="60" width="22" height="2" rx="1" fill="${PRI}" opacity="0.32"/>
    <text x="${emaW + 30}" y="66">${esc(t.legendPer)}</text>
  </g>
  <text x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle" font-family="${MONO}" font-size="11.5" fill="${MUT}">${esc(t.axisEpoch)}</text>
</svg>`
}

/* ---------- 3) why the headline number is depressed: F vs P ---------- */
function fvsp(rows, lang) {
  const { t, fmt2, name } = mk(lang)
  const W = 780, rowH = 15, inner = 4, gap = 21, L = 260, R = 74
  const groupH = rowH * 2 + inner
  const H = 92 + rows.length * (groupH + gap) + 30
  const plot = W - L - R
  const x = (v) => L + v * plot

  const bars = rows.map((r, i) => {
    const y = 92 + i * (groupH + gap)
    const wf = Math.max(3, r.f * plot), wp = Math.max(3, r.p * plot)
    // where the two bars diverge, the gap is the annotation artefact — say so
    // under the category name, which always has room (a right-side note overflows)
    const fark = r.f - r.p
    const nameY = fark > 0.05 ? y + groupH / 2 - 1 : y + groupH / 2 + 5
    const note = fark > 0.05
      ? `<text x="${L - 16}" y="${y + groupH / 2 + 14}" text-anchor="end" font-family="${MONO}" font-size="11" fill="${AMBER}">${esc(t.note(r.n))}</text>`
      : ''
    return `
    <text x="${L - 16}" y="${nameY}" text-anchor="end" font-family="${FONT}" font-size="15" fill="${INK}">${esc(name(r.key))}</text>
    <rect x="${L}" y="${y}" width="${wf}" height="${rowH}" rx="3.5" fill="${PRI}"/>
    <text x="${L + wf + 10}" y="${y + rowH - 2}" font-family="${MONO}" font-size="12" fill="${INK}">${fmt2(r.f)}</text>
    <rect x="${L}" y="${y + rowH + inner}" width="${wp}" height="${rowH}" rx="3.5" fill="${AMBER}"/>
    <text x="${L + wp + 10}" y="${y + groupH - 1}" font-family="${MONO}" font-size="12" fill="${MUT}">${fmt2(r.p)}</text>
    ${note}`
  }).join('')

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((tk) => `
    <line x1="${x(tk)}" y1="78" x2="${x(tk)}" y2="${H - 30}" stroke="${GRID}" stroke-width="1"/>
    <text x="${x(tk)}" y="${H - 12}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="${MUT}">${fmt2(tk)}</text>`).join('')

  const labelledW = t.legendLabelled.length * 6.6 + 46

  return `${SVG_OPEN(W, H, t.fvspAria)}
  <text x="0" y="20" font-family="${FONT}" font-size="17" font-weight="600" fill="${INK}">${esc(t.fvspTitle)}</text>
  <text x="0" y="42" font-family="${MONO}" font-size="12.5" fill="${MUT}">${esc(t.fvspSub)}</text>
  <g font-family="${MONO}" font-size="12">
    <rect x="0" y="58" width="22" height="10" rx="3" fill="${PRI}"/>
    <text x="30" y="67" fill="${INK}">${esc(t.legendLabelled)}</text>
    <rect x="${labelledW}" y="58" width="22" height="10" rx="3" fill="${AMBER}"/>
    <text x="${labelledW + 30}" y="67" fill="${INK}">${esc(t.legendRaw)}</text>
  </g>
  ${ticks}${bars}
  <line x1="${L}" y1="${H - 30}" x2="${W - R}" y2="${H - 30}" stroke="${INK}" stroke-width="1"/>
</svg>`
}

module.exports = { classDice, trainingCurve, fvsp }

/* CLI: write one set of files per language */
if (require.main === module) {
  const root = path.resolve(__dirname, '..')
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, 'metrikler.json'), 'utf8'))
  const out = path.join(root, 'public', 'img')
  fs.mkdirSync(out, { recursive: true })

  // metrikler.json carries Turkish display names; attach stable keys by position
  const keyed = (arr) => arr.map((r, i) => ({ ...r, key: KEYS[i] }))
  const classes = keyed(m.f_siniflar)
  const compare = keyed(m.karsilastirma)

  for (const lang of ['tr', 'en', 'ar']) {
    const sfx = lang === 'tr' ? '' : `.${lang}`
    fs.writeFileSync(path.join(out, `dice_siniflar${sfx}.svg`),
      classDice(classes.slice().sort((a, b) => b.dice - a.dice), { mean: m.f_ortalama, n: m.vaka_sayisi }, lang))
    fs.writeFileSync(path.join(out, `egitim_egrisi${sfx}.svg`), trainingCurve(m.epochs, lang))
    fs.writeFileSync(path.join(out, `dice_f_vs_p${sfx}.svg`), fvsp(compare, lang))
    console.log(`${lang}: 3 grafik yazildi`)
  }
  console.log('->', out)
}
