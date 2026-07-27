import SimpleITK as sitk
import numpy as np
from skimage import measure
from scipy import ndimage
import trimesh
import sys

SRC = r"C:\Users\PC\Desktop\Dental Navigasyon\Data Set\tahmin_sonuclari\ToothFairy2F_001.mha"
OUT = r"C:\Users\PC\Desktop\Projects\dental-navigasyon-3d\public\models\jaw.glb"

# Fraction of the maxilla's own height to keep. Cropping it detaches the palatal
# shelf from the arch and looks worse than the scan's flat upper cut, so it's off.
MAXILLA_KEEP = None

# label -> (name, color RGBA 0-255, target_faces, smooth_iters, keep_ratio, min_mm)
# keep_ratio: min component area as a fraction of the largest component.
# min_mm:     absolute min bounding-box diagonal in mm — kills speckle reliably,
#             since a real tooth is >10 mm while segmentation noise is a few mm.
STRUCTS = {
    # dental-model look: warm gingival coral for the jawbones, ivory enamel for teeth
    1: ("mandible",   (188,  98,  84, 255), 55000, 14, 0.55, 45.0),  # lower jawbone - coral
    2: ("maxilla",    (198, 108,  94, 255), 40000, 14, 0.55, 45.0),  # upper jawbone (cropped)
    # teeth/nerve/sinus: no area-ratio test (a molar dwarfs an incisor, a canal
    # branch dwarfs its tip) — the absolute size threshold alone drops the noise.
    5: ("upper_teeth",(247, 243, 234, 255), 30000, 8,  0.0, 6.0),   # upper teeth - ivory enamel
    6: ("lower_teeth",(247, 243, 234, 255), 26000, 8,  0.0, 6.0),   # lower teeth
    3: ("nerve_canal",(198,  44,  36, 255), 14000, 10, 0.0, 18.0),  # inferior alveolar canal - RED
    4: ("sinus",      ( 56, 126, 214, 200), 16000, 10, 0.0, 18.0),  # maxillary sinus - blue
}

def srgb_to_linear(c):
    """glTF baseColorFactor is LINEAR. Colors above are authored as sRGB, so they
    must be converted or the viewer's linear->sRGB step washes them out."""
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def si_axis_and_sign(arr):
    """Find the superior-inferior array axis and which direction is superior,
    by comparing the upper-teeth (label 5) and lower-teeth (label 6) centroids."""
    up = np.argwhere(arr == 5).mean(0)
    lo = np.argwhere(arr == 6).mean(0)
    delta = up - lo
    ax = int(np.argmax(np.abs(delta)))
    return ax, (1 if delta[ax] > 0 else -1)


def crop_superior(mask, ax, sign, keep_frac):
    """Trim the superior part of a structure, keeping the inferior `keep_frac`
    of its own extent. The CBCT is cut off above the maxilla, which otherwise
    renders as a rectangular slab instead of an alveolar arch."""
    idx = np.argwhere(mask)
    if not len(idx):
        return mask
    lo_i, hi_i = idx[:, ax].min(), idx[:, ax].max()
    extent = hi_i - lo_i
    if extent < 4:
        return mask
    out = mask.copy()
    sl = [slice(None)] * mask.ndim
    if sign > 0:   # superior = increasing index -> cut the top
        cut = int(lo_i + extent * keep_frac)
        sl[ax] = slice(cut, None)
    else:          # superior = decreasing index -> cut the bottom
        cut = int(hi_i - extent * keep_frac)
        sl[ax] = slice(None, cut + 1)
    out[tuple(sl)] = 0
    return out


def extract(arr, label, spacing, target_faces, smooth_iters, keep_ratio, min_mm,
            crop_frac=None, si=None):
    mask = (arr == label).astype(np.uint8)
    if mask.sum() < 200:
        return None
    if crop_frac is not None and si is not None:
        mask = crop_superior(mask, si[0], si[1], crop_frac)
    # close small holes, keep largest components
    mask = ndimage.binary_closing(mask, iterations=1)
    # pad so surfaces close at borders
    mask = np.pad(mask, 1, mode="constant")
    # marching cubes (spacing in z,y,x order matching array axes)
    verts, faces, normals, _ = measure.marching_cubes(
        mask.astype(np.float32), level=0.5, spacing=spacing, allow_degenerate=False
    )
    m = trimesh.Trimesh(vertices=verts, faces=faces, process=True)
    # role-aware component filtering (drop speckle, keep individual teeth)
    comps = m.split(only_watertight=False)
    if len(comps) > 1:
        comps = sorted(comps, key=lambda c: c.area, reverse=True)
        def big_enough(c):
            diag = float(np.linalg.norm(c.bounds[1] - c.bounds[0]))
            return c.area > comps[0].area * keep_ratio and diag >= min_mm
        keep = [c for c in comps if big_enough(c)]
        if not keep:
            keep = [comps[0]]
        print(f"    components {len(comps)} -> kept {len(keep)}")
        m = trimesh.util.concatenate(keep)
    # Taubin smoothing (shrink-free)
    trimesh.smoothing.filter_taubin(m, lamb=0.53, nu=-0.53, iterations=smooth_iters)
    # decimate
    if len(m.faces) > target_faces:
        try:
            m = m.simplify_quadric_decimation(face_count=target_faces)
        except Exception as e:
            print("  decimate skipped:", e)
    return m

def main():
    img = sitk.ReadImage(SRC)
    arr = sitk.GetArrayFromImage(img)          # (z, y, x)
    sp = img.GetSpacing()                        # (x, y, z)
    spacing = (sp[2], sp[1], sp[0])              # match array axes z,y,x
    print("volume", arr.shape, "spacing", spacing)

    si = si_axis_and_sign(arr)
    print("superior-inferior axis:", si)

    scene = trimesh.Scene()
    all_v = []
    meshes = {}
    for label, (name, color, tf, sm, kr, mm) in STRUCTS.items():
        # the scan is cut off above the maxilla; keep its lower part so it reads
        # as an alveolar arch rather than a rectangular slab
        crop = MAXILLA_KEEP if name in ("maxilla", "sinus") else None
        m = extract(arr, label, spacing, tf, sm, kr, mm, crop_frac=crop, si=si)
        if m is None:
            print("skip", name); continue
        meshes[name] = (m, color)
        print(f"{name:12s} faces={len(m.faces):6d} verts={len(m.vertices):6d}")

    # drop components that sit far from the jaw body (isolated segmentation noise)
    ref = meshes["mandible"][0].bounds.mean(0)
    span = float(np.linalg.norm(meshes["mandible"][0].bounds[1] - meshes["mandible"][0].bounds[0]))
    for name, (m, color) in list(meshes.items()):
        comps = m.split(only_watertight=False)
        if len(comps) < 2:
            continue
        near = [c for c in comps if np.linalg.norm(c.bounds.mean(0) - ref) < span * 0.5]
        if near and len(near) != len(comps):
            print(f"    {name}: dropped {len(comps)-len(near)} distant component(s)")
            meshes[name] = (trimesh.util.concatenate(near), color)

    for name, (m, color) in meshes.items():
        all_v.append(m.vertices)
    allv = np.vstack(all_v)
    center = (allv.min(0) + allv.max(0)) / 2.0
    scale = 1.0 / (allv.max(0) - allv.min(0)).max()   # normalize to ~1 unit

    for name, (m, color) in meshes.items():
        m.apply_translation(-center)
        m.apply_scale(scale)
        # reorient: array axes (z,y,x) -> nice three.js. Rotate so jaw faces camera, Y up.
        # swap so anterior-posterior is depth, superior-inferior is up
        mat = trimesh.transformations.rotation_matrix(np.deg2rad(-90), [1,0,0])
        m.apply_transform(mat)
        # PBR material w/ transparency for sinus
        alpha = color[3]
        mat_pbr = trimesh.visual.material.PBRMaterial(
            baseColorFactor=[srgb_to_linear(color[0]), srgb_to_linear(color[1]),
                             srgb_to_linear(color[2]), alpha/255],
            metallicFactor=0.0,
            roughnessFactor=0.55 if name not in ("upper_teeth","lower_teeth") else 0.25,
            alphaMode="BLEND" if alpha < 255 else "OPAQUE",
            doubleSided=True,
        )
        m.visual = trimesh.visual.TextureVisuals(material=mat_pbr)
        scene.add_geometry(m, geom_name=name, node_name=name)

    scene.export(OUT)
    import os
    print("EXPORTED", OUT, round(os.path.getsize(OUT)/1e6,2), "MB")

if __name__ == "__main__":
    main()
