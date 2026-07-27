# Dental Navigasyon — 3B Kurumsal Tanıtım Sitesi

TÜBİTAK 2242 / TEKNOFEST "Dental İmplantoloji ve Lokal Anestezide 3B Tomografi
Entegrasyonlu Dinamik Cerrahi Navigasyon Sistemi" projesi için scroll-tabanlı,
gerçek 3D çene modeli içeren kurumsal tek sayfa site.

## Öne çıkan
- **Gerçek 3D çene modeli:** `public/models/jaw.glb` — CSS ile çizilmiş değil.
  nnU-Net v2'nin gerçek CBCT segmentasyon çıktısından
  (`Data Set/tahmin_sonuclari/ToothFairy2F_001.mha`) marching-cubes ile üretildi.
  Ayrı ayrı: mandibula, maksilla, üst/alt dişler, **alt alveolar sinir kanalı (kırmızı)**,
  maksiller sinüs (mavi/yarı saydam).
- **Scroll koreografisi:** three.js sahnesi kaydırmayla kamera yörüngesi çizer;
  her anatomik yapı sırayla vurgulanır (kemik saydamlaşır, sinir kanalı içeriden parlar).
- **Gerçek ekran görüntüleri:** WPF kontrol arayüzü + Unity UDP konsolu.
- three.js + Lenis (yumuşak kaydırma), Vite. Karanlık, klinik, kurumsal tasarım.

## Çalıştırma
```bash
npm install
npm run dev      # http://localhost:4180
npm run build    # dist/ üretir (deploy'a hazır statik site)
```

## 3D modeli yeniden üretme
`ToothFairy2F_001.mha` dışında bir tahmin dosyasından üretmek istersen
`scripts/build_jaw.py` içindeki `SRC` yolunu değiştir ve çalıştır
(gereksinim: `SimpleITK scikit-image trimesh fast_simplification scipy`).
GLB değişince `src/main.js` içindeki `?v=N` önbellek kırıcıyı artır.

## Medya hattı (yeniden üretmek gerekirse)

**HoloLens modeli** — Sketchfab'den inen 32.6 MB'lık GLB web için ağır; şu komutla
946 KB'a indirildi (dokular 2048 px + webp; draco YOK, yoksa ayrıca çözücü gerekir):
```bash
npx @gltf-transform/cli optimize <kaynak>.glb public/models/hololens.glb \
  --texture-size 2048 --texture-compress webp --compress false
```

**Video** — ham kayıt 35 MB, 1920x1080, alt kenarda Windows görev çubuğu var.
`ffmpeg` (yoksa `pip install imageio-ffmpeg`) ile üç çıktı üretiliyor:
```bash
# tam kayıt: görev çubuğu kırpılır, 1280 px, sessiz  -> ~2.3 MB
ffmpeg -i "VR Video.mp4" -vf "crop=1920:1032:0:0,scale=1280:-2" \
  -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -movflags +faststart -an public/video/vr.mp4
# arka planda dönen sessiz döngü (güvenlik uyarısı anı, 64-80 sn) -> ~0.24 MB
ffmpeg -ss 64 -t 16 -i "VR Video.mp4" -vf "crop=1920:1032:0:0,scale=1280:-2" \
  -c:v libx264 -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart -an public/video/vr-loop.mp4
# kapak karesi (kırmızı uyarı ekranda)
ffmpeg -ss 70 -i "VR Video.mp4" -vframes 1 -vf "crop=1920:1032:0:0,scale=1600:-2" -q:v 3 public/img/vr-poster.jpg
```

## Yapı
- `index.html` — bölümler (hero, anatomi, sorun, özgünlük, mimari, yapay zekâ, arayüz, hassasiyet, ekip)
- `src/scene.js` — three.js sahnesi, GLB yükleme, scroll kamera/vurgu koreografisi
- `src/main.js` — Lenis kaydırma, reveal animasyonları, anotasyonlar, ilerleme çubuğu
- `src/style.css` — tasarım
- `public/models/jaw.glb` — gerçek segmentasyondan çene (~3.3 MB)
- `public/img/` — GençBiyo logosu + gerçek WPF/Unity ekran görüntüleri
