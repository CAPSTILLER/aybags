// 3D avatar viewer (Mysbase-style): emotes, speed, pause/scrub, PNG, on-device GLB.
const $ = (id: string) => document.getElementById(id) as any
async function start() {
  const THREE = await import('three')
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js')
  const SkeletonUtils = await import('three/examples/jsm/utils/SkeletonUtils.js')
  const box = $('av'), cv = $('avc'), msg = $('avmsg')
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true, alpha: true })
  r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d6d0, 1.6))
  const key = new THREE.DirectionalLight(0xf2f6ff, 2.2); key.position.set(2, 4, 3); scene.add(key)
  const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(-3, 2, -2); scene.add(fill)
  const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 100)
  const ctl = new OrbitControls(cam, cv); ctl.enableDamping = true; ctl.enablePan = false
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder)
  let root: any = null, mixer: any = null, cur: any = null, speed = 1, paused = false, scrubbing = false
  const size = () => { const w = box.clientWidth, h = box.clientHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix() }
  new ResizeObserver(size).observe(box); size()
  function play(clip: any, btn?: HTMLElement) {
    if (!mixer) return
    const a = mixer.clipAction(clip); a.reset(); a.setLoop(THREE.LoopRepeat, Infinity)
    if (cur && cur !== a) a.crossFadeFrom(cur, 0.25, false); a.play(); cur = a
    document.querySelectorAll('#emotes button').forEach(b => b.classList.toggle('on', b === btn))
  }
  function show(gltf: any, label: string) {
    if (root) { scene.remove(root); mixer?.stopAllAction() }
    root = SkeletonUtils.clone(gltf.scene) // safe copy for skinned meshes
    const b = new THREE.Box3().setFromObject(root), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3())
    const k = 1.8 / Math.max(s.x, s.y, s.z || 1); root.scale.setScalar(k); root.position.set(-c.x * k, -b.min.y * k, -c.z * k)
    scene.add(root)
    const h = s.y * k; ctl.target.set(0, h * 0.5, 0); cam.position.set(h * 0.9, h * 0.7, h * 2.4); ctl.update()
    mixer = new THREE.AnimationMixer(root); mixer.timeScale = paused ? 0 : speed; cur = null
    const em = $('emotes'); em.innerHTML = ''
    const clips = gltf.animations || []
    clips.forEach((cl: any, i: number) => {
      const bt = document.createElement('button'); bt.textContent = cl.name.replace(/_/g, ' ') || 'Clip ' + (i + 1)
      bt.onclick = () => play(cl, bt); em.appendChild(bt)
    })
    if (!clips.length) em.innerHTML = '<p class="small">This model has no animations.</p>'
    else { const idle = clips.findIndex((c: any) => /idle|wave|hello/i.test(c.name)); play(clips[Math.max(0, idle)], em.children[Math.max(0, idle)]) }
    msg.textContent = ''; box.dataset.model = label; box.dataset.clips = String(clips.length)
  }
    msg.textContent = 'Load your avatar GLB'
  $('avFile').onchange = (e: any) => { const f = e.target.files?.[0]; if (!f) return; const u = URL.createObjectURL(f); msg.textContent = 'Loading avatar…'; loader.load(u, g => { show(g, f.name); URL.revokeObjectURL(u) }, undefined, () => { msg.textContent = 'That file did not load as a GLB.' }) }
  $('spd').oninput = (e: any) => { speed = +e.target.value; $('spdv').textContent = speed.toFixed(1) + '×'; if (mixer && !paused) mixer.timeScale = speed }
  $('avPause').onclick = () => { paused = !paused; if (mixer) mixer.timeScale = paused ? 0 : speed; $('avPause').textContent = paused ? '▶ Play' : '⏸ Pause' }
  const sc = $('scrub')
  sc.onpointerdown = () => { scrubbing = true }; sc.onpointerup = () => { scrubbing = false }
  sc.oninput = () => { if (!cur) return; const d = cur.getClip().duration; cur.time = +sc.value * d; if (!paused) $('avPause').click(); mixer.update(0) }
  $('avShot').onclick = () => { r.render(scene, cam); const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = 'ayb-avatar.png'; a.click() }
  const clock = new THREE.Clock()
  r.setAnimationLoop(() => {
    const dt = clock.getDelta(); mixer?.update(dt); ctl.update()
    if (cur && !scrubbing) { const d = cur.getClip().duration; sc.value = String((cur.time % d) / d) }
    r.render(scene, cam)
  })
}
const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); start().catch(e => { $('avmsg').textContent = 'Viewer failed: ' + e.message }) } }, { rootMargin: '300px' })
io.observe($('av'))
