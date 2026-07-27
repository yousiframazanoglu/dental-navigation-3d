import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const ROLE = {
  mandible: 'bone', maxilla: 'bone',
  upper_teeth: 'teeth', lower_teeth: 'teeth',
  nerve_canal: 'nerve', sinus: 'sinus',
}

// per-stage keyframes: azimuth, polar, distance, targetY, screen-offset-x, focus
const KF = [
  { az: -0.45, po: 0.16, d: 3.05, ty: 0.02, ox: -0.62, focus: 'all'      }, // 0 hero (jaw right)
  { az:  0.28, po: 0.10, d: 3.10, ty:-0.02, ox: -0.70, focus: 'mandible' }, // 1
  { az:  0.80, po:-0.12, d: 2.80, ty:-0.04, ox: -0.68, focus: 'nerve'    }, // 2 nerve close
  { az: -0.28, po: 0.34, d: 3.00, ty: 0.04, ox: -0.70, focus: 'sinus'    }, // 3 sinus
  { az: -0.90, po: 0.14, d: 3.00, ty: 0.00, ox:  0.00, focus: 'all'      }, // 4 problem (backdrop)
  { az: -1.55, po: 0.18, d: 3.05, ty: 0.00, ox:  0.00, focus: 'all'      }, // 5
  { az: -2.20, po: 0.10, d: 3.00, ty: 0.00, ox:  0.00, focus: 'all'      }, // 6
  { az: -2.95, po:-0.02, d: 2.70, ty:-0.02, ox:  0.00, focus: 'teeth'    }, // 7 AI
  { az: -3.70, po: 0.16, d: 3.10, ty: 0.00, ox:  0.00, focus: 'all'      }, // 8
  { az: -4.45, po: 0.22, d: 2.85, ty: 0.00, ox:  0.00, focus: 'nerve'    }, // 9
  { az: -5.30, po: 0.12, d: 3.15, ty: 0.00, ox:  0.00, focus: 'all'      }, // 10 ekip
]

const UP = new THREE.Vector3(0, 1, 0)

export class JawScene {
  constructor(canvas) {
    this.canvas = canvas
    this.progress = 0
    this.tProgress = 0
    this.structures = {}
    this.markers = {}
    this.clock = new THREE.Clock()
    this._tmpTarget = new THREE.Vector3()
    this._tmpRight = new THREE.Vector3()
    this._tmpDir = new THREE.Vector3()
    this._init()
  }

  _init() {
    const r = this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
    })
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    r.setSize(window.innerWidth, window.innerHeight)
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.toneMappingExposure = 1.05

    const scene = this.scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(r)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 100)

    this.key = new THREE.DirectionalLight(0xffffff, 2.4); this.key.position.set(3, 5, 4); scene.add(this.key)
    this.fill = new THREE.DirectionalLight(0xdce7f5, 1.0); this.fill.position.set(-4, 1, 2); scene.add(this.fill)
    this.rim = new THREE.DirectionalLight(0xffffff, 1.0); this.rim.position.set(-2, -1, -5); scene.add(this.rim)
    this.hemi = new THREE.HemisphereLight(0xdfe9f5, 0x39312e, 0.8); scene.add(this.hemi)
    this.theme = null   // null so the first setTheme() actually applies a preset
    this.envIntensity = 0.55

    // spin group rotates about world-Y for subtle idle motion; model holds axis correction
    this.spin = new THREE.Group()
    scene.add(this.spin)

    this.isMobile = window.innerWidth < 760
    window.addEventListener('resize', () => this._resize())
  }

  load(url, onProgress) {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(url, (gltf) => {
        const root = gltf.scene
        // remap medical axes -> upright dental arch.
        // step 1: 180° about (1,1,0) puts SI on Y (but inverted) and AP on Z
        // step 2: 180° about Z flips it right-side up (upper teeth above lower)
        const qCorrect = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 1, 0).normalize(), Math.PI)
        const qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)
        root.quaternion.copy(qFlip.multiply(qCorrect))
        root.updateMatrixWorld(true)

        // recenter after reorientation: wrap and offset so the bounding-box center sits at origin
        const wrapper = new THREE.Group()
        wrapper.add(root)
        wrapper.updateMatrixWorld(true)
        const c2 = new THREE.Box3().setFromObject(wrapper).getCenter(new THREE.Vector3())
        wrapper.position.sub(c2)

        this.spin.add(wrapper)
        this.model = wrapper

        root.traverse((o) => {
          if (!o.isMesh) return
          const name = (o.name || '').toLowerCase()
          let key = null
          for (const k of Object.keys(ROLE)) if (name.includes(k)) key = k
          if (!key) for (const k of Object.keys(ROLE)) if ((o.parent?.name || '').toLowerCase().includes(k)) key = k
          o.userData.key = key
          o.userData.role = key ? ROLE[key] : 'bone'
          this._prepMaterial(o)
          if (key) this.structures[key] = o
        })

        this._buildMarkers()
        resolve()
      }, (e) => {
        if (onProgress && e.total) onProgress(e.loaded / e.total)
      }, reject)
    })
  }

  _prepMaterial(mesh) {
    const role = mesh.userData.role
    const m = mesh.material
    m.envMapIntensity = this.envIntensity
    mesh.userData.baseOpacity = m.opacity ?? 1
    if (!m.emissive) m.emissive = new THREE.Color(0x000000)
    mesh.userData.emColor = new THREE.Color(
      role === 'nerve' ? 0xff4436 : role === 'sinus' ? 0x3f86d6 : 0x3a1a12
    )
    if (role === 'sinus') { m.transparent = true; m.opacity = 0.32; m.depthWrite = false; m.roughness = 0.15; m.metalness = 0; mesh.userData.baseOpacity = 0.32 }
    if (role === 'teeth') { m.roughness = 0.22; m.metalness = 0.02; m.envMapIntensity = 1.2 }
    if (role === 'bone') { m.roughness = 0.6; m.metalness = 0.0 }
    if (role === 'nerve') { m.roughness = 0.4; m.metalness = 0.0; m.emissiveIntensity = 0.3 }
    m.needsUpdate = true
    mesh.userData.emphasis = 0; mesh.userData.emphasisTarget = 0
    mesh.userData.dim = 0; mesh.userData.dimTarget = 0
  }

  _buildMarkers() {
    this.model.updateMatrixWorld(true)
    const mk = (key, srcKeys) => {
      const centers = []
      for (const sk of srcKeys) {
        const mesh = this.structures[sk]; if (!mesh) continue
        const b = new THREE.Box3().setFromObject(mesh)
        centers.push(b.getCenter(new THREE.Vector3()))
      }
      if (!centers.length) return
      const w = centers.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / centers.length)
      const marker = new THREE.Object3D()
      marker.position.copy(this.model.worldToLocal(w.clone()))
      this.model.add(marker)
      this.markers[key] = marker
    }
    mk('mandible', ['mandible'])
    mk('nerve', ['nerve_canal'])
    mk('maxilla', ['maxilla'])
    mk('sinus', ['sinus'])
    mk('teeth', ['upper_teeth', 'lower_teeth'])
  }

  setProgress(p) { this.progress = p }

  // light page: flatter, brighter, no rim halo. dark page: rim separates the model from the ink.
  setTheme(theme) {
    if (theme === this.theme) return
    this.theme = theme
    const dark = theme === 'dark'
    // light page needs directional contrast so the form reads against paper;
    // dark page needs a rim to separate the model from the ink.
    this.key.intensity = dark ? 2.5 : 3.1
    this.fill.intensity = dark ? 0.85 : 0.5
    this.rim.intensity = dark ? 2.0 : 0.25
    this.rim.color.set(dark ? 0x9fd8ff : 0xffffff)
    this.hemi.intensity = dark ? 0.5 : 0.35
    this.renderer.toneMappingExposure = dark ? 1.05 : 0.92
    this.envIntensity = dark ? 0.9 : 0.55
    for (const k in this.structures) this.structures[k].material.envMapIntensity = this.envIntensity
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight
    this.isMobile = w < 760
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  _sampleKF(pf) {
    const i = Math.max(0, Math.min(KF.length - 2, Math.floor(pf)))
    const t = THREE.MathUtils.clamp(pf - i, 0, 1)
    const e = t * t * (3 - 2 * t)
    const a = KF[i], b = KF[i + 1]
    return {
      az: a.az + (b.az - a.az) * e, po: a.po + (b.po - a.po) * e,
      d: a.d + (b.d - a.d) * e, ty: a.ty + (b.ty - a.ty) * e,
      ox: a.ox + (b.ox - a.ox) * e, focus: e < 0.5 ? a.focus : b.focus,
    }
  }

  currentFocus() { return this._sampleKF(this.tProgress * (KF.length - 1)).focus }

  render() {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.tProgress += (this.progress - this.tProgress) * Math.min(1, dt * 5.5)
    const k = this._sampleKF(this.tProgress * (KF.length - 1))

    if (this.model) {
      // mobile: center the model, shrink it, raise it into the upper area for readability
      let d = k.d, ox = k.ox, oy = 0
      // oy>0 pans the view up => subject moves DOWN; use negative to raise into the top band
      if (this.isMobile) { d = k.d * 1.3; ox = 0; oy = k.ox !== 0 ? -0.72 : 0 }

      const cx = Math.sin(k.az) * Math.cos(k.po) * d
      const cz = Math.cos(k.az) * Math.cos(k.po) * d
      const cy = Math.sin(k.po) * d + k.ty
      const target = this._tmpTarget.set(0, k.ty, 0)
      this.camera.position.set(cx, cy, cz)
      this.camera.lookAt(target)
      // horizontal screen offset: pan camera+target along right vector
      if (ox) {
        this._tmpDir.subVectors(target, this.camera.position).normalize()
        this._tmpRight.crossVectors(this._tmpDir, UP).normalize()
        this.camera.position.addScaledVector(this._tmpRight, ox)
        target.addScaledVector(this._tmpRight, ox)
        this.camera.lookAt(target)
      }
      // vertical screen offset (mobile): oy>0 raises the subject on screen
      if (oy) {
        this.camera.position.addScaledVector(UP, oy)
        target.addScaledVector(UP, oy)
        this.camera.lookAt(target)
      }

      this.spin.rotation.y = Math.sin(this.clock.elapsedTime * 0.1) * 0.06

      const focus = k.focus
      for (const key in this.structures) {
        const mesh = this.structures[key], role = mesh.userData.role
        let tgt = 0, dim = 0
        if (focus === 'mandible') { tgt = key === 'mandible' ? 1 : 0; dim = key === 'mandible' ? 0 : 0.55 }
        // nerve/sinus sit INSIDE bone, so the surrounding bone has to go near-glass
        else if (focus === 'nerve') { tgt = key === 'nerve_canal' ? 1 : 0; dim = key === 'nerve_canal' ? 0 : 0.88 }
        else if (focus === 'sinus') { tgt = key === 'sinus' ? 1 : 0; dim = key === 'sinus' ? 0 : 0.8 }
        else if (focus === 'teeth') { tgt = role === 'teeth' ? 1 : 0; dim = role === 'teeth' ? 0 : 0.62 }
        mesh.userData.emphasisTarget = tgt; mesh.userData.dimTarget = dim
      }

      for (const key in this.structures) {
        const mesh = this.structures[key], u = mesh.userData, m = mesh.material, role = u.role
        u.emphasis += (u.emphasisTarget - u.emphasis) * Math.min(1, dt * 4)
        u.dim += (u.dimTarget - u.dim) * Math.min(1, dt * 4)
        m.emissive.copy(u.emColor)
        const baseEm = role === 'nerve' ? 0.32 : role === 'sinus' ? 0.14 : 0.0
        m.emissiveIntensity = baseEm + u.emphasis * (role === 'nerve' ? 1.6 : role === 'sinus' ? 1.0 : 0.4)
        if (role === 'sinus') {
          m.opacity = 0.30 + u.emphasis * 0.5 - u.dim * 0.2
          m.depthWrite = false
        } else {
          m.transparent = u.dim > 0.01
          m.opacity = u.baseOpacity * (1 - u.dim * 0.92)
          // stop writing depth once glassy, otherwise bone hides the structure inside it
          m.depthWrite = m.opacity > 0.55
        }
      }
    }
    this.renderer.render(this.scene, this.camera)
  }

  screenAnchors() {
    const out = {}
    if (!this.model) return out
    const focus = this.currentFocus()
    const want = { mandible: ['mandible'], nerve: ['nerve'], sinus: ['sinus'], teeth: ['teeth'], all: [] }[focus] || []
    const w = window.innerWidth, h = window.innerHeight
    for (const key of want) {
      const marker = this.markers[key]; if (!marker) continue
      const world = marker.getWorldPosition(new THREE.Vector3())
      const v = world.project(this.camera)
      if (v.z > 1) continue
      const x = (v.x * 0.5 + 0.5) * w
      const y = (-v.y * 0.5 + 0.5) * h
      if (x < 40 || x > w - 40 || y < 90 || y > h - 60) continue
      out[key] = { x, y }
    }
    return out
  }
}
