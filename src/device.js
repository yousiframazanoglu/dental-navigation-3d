import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * Interactive viewer for the HoloLens 2 model.
 * Own canvas + renderer, initialised lazily when the section is first seen,
 * renders only while on screen so it never competes with the jaw scene.
 * Drag to orbit; it idles back into a slow auto-spin once you let go.
 */
export class DeviceViewer {
  constructor(canvas, url) {
    this.canvas = canvas
    this.url = url
    this.visible = false
    this.started = false
    this.clock = new THREE.Clock()
    this.idle = 0
  }

  start() {
    if (this.started) return
    this.started = true

    const r = this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
    })
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.toneMappingExposure = 1.35
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap

    const scene = this.scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(r)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100)
    this.camera.position.set(1.45, 0.32, 2.75)

    // studio-style rig: warm key, cool rims either side to read the dark shell
    const key = new THREE.DirectionalLight(0xfff4e8, 3.2)
    key.position.set(2.5, 3.5, 3)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 0.5
    key.shadow.camera.far = 12
    key.shadow.bias = -0.0015
    scene.add(key)

    const rimL = new THREE.DirectionalLight(0x8fd4ff, 3.6); rimL.position.set(-4, 1.2, -2.5); scene.add(rimL)
    const rimR = new THREE.DirectionalLight(0xffffff, 2.0); rimR.position.set(4, -0.5, -2); scene.add(rimR)
    const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(0, -2, 3); scene.add(fill)
    scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x20272f, 0.7))

    // soft contact shadow so the device sits in space instead of floating
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.ShadowMaterial({ opacity: 0.32 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.95
    ground.receiveShadow = true
    scene.add(ground)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.enablePan = false
    this.controls.enableZoom = false          // keep the page scrollable over the canvas
    this.controls.rotateSpeed = 0.6
    this.controls.minPolarAngle = Math.PI * 0.18
    this.controls.maxPolarAngle = Math.PI * 0.82
    this.controls.target.set(0, 0, 0)
    this.controls.addEventListener('start', () => { this.idle = 0; this.canvas.classList.add('grabbing') })
    this.controls.addEventListener('end', () => this.canvas.classList.remove('grabbing'))

    this._resize()
    window.addEventListener('resize', () => this._resize())

    new GLTFLoader().load(this.url, (gltf) => {
      const root = gltf.scene
      const box = new THREE.Box3().setFromObject(root)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      root.position.sub(center)
      root.scale.setScalar(1.75 / Math.max(size.x, size.y, size.z))
      root.traverse((o) => {
        if (!o.isMesh) return
        o.castShadow = true
        const m = o.material
        if (m) {
          m.envMapIntensity = 1.35
          if (m.metalness !== undefined) m.metalness = Math.min(m.metalness ?? 0.5, 0.85)
          if (m.roughness !== undefined) m.roughness = THREE.MathUtils.clamp(m.roughness ?? 0.5, 0.18, 0.85)
        }
      })
      scene.add(root)
      this.model = root
      this.canvas.classList.add('ready')
    }, undefined, (e) => console.error('HoloLens model failed:', e))
  }

  setVisible(v) { this.visible = v }

  _resize() {
    if (!this.renderer) return
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  render() {
    if (!this.started || !this.visible || !this.renderer) return
    const dt = Math.min(this.clock.getDelta(), 0.05)
    // resume the gentle auto-spin a moment after the user stops dragging
    this.idle += dt
    if (this.model && this.idle > 2.5) {
      this.controls.object.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.12)
    }
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
}
