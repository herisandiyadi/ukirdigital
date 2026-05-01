"""
PNG -> STL / SVG / DXF converters (3 metode: heightmap, relief, silhouette)
Semua fungsi publik: (input_path, output_path, cfg: dict)
"""
import numpy as np
from PIL import Image, ImageFilter
import svgwrite
import ezdxf
from stl import mesh as stl_mesh
from typing import Any


# ── Helpers ──────────────────────────────────────────────────────────────────

def _load_gray(path: str, resolution: int = 2) -> np.ndarray:
    img = Image.open(path).convert("L")
    max_dim = max(1, 512 // resolution)
    img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    return np.array(img)


def _load_gray_and_scale(path: str, resolution: int, scale_mm_per_px: float) -> tuple[np.ndarray, float]:
    """Load grayscale and compute effective mm-per-pixel after downsampling.

    The image is downsampled to fit `max_dim = 512//resolution`. After downsampling,
    each pixel represents a larger physical area. We scale the mm-per-pixel accordingly
    so that the final physical size remains consistent with the original.
    """
    img = Image.open(path).convert("L")
    orig_w, orig_h = img.size
    max_dim = max(1, 512 // resolution)
    img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    new_w, new_h = img.size

    # Effective scale increases by the downsampling ratio.
    sx = orig_w / max(1, new_w)
    sy = orig_h / max(1, new_h)
    ratio = max(sx, sy)
    effective_mm_per_px = scale_mm_per_px * ratio

    return np.array(img), effective_mm_per_px


def _binary(gray: np.ndarray, threshold: int = 128) -> np.ndarray:
    return (gray > threshold).astype(np.uint8)


def _smooth_gray(gray: np.ndarray, blur_radius: float) -> np.ndarray:
    """Apply light gaussian blur to reduce stepping/noise before meshing."""
    if blur_radius <= 0:
        return gray
    img = Image.fromarray(gray.astype(np.uint8), mode="L")
    img = img.filter(ImageFilter.GaussianBlur(radius=float(blur_radius)))
    return np.array(img)


def _contrast_stretch(gray: np.ndarray, low_pct: float = 2.0, high_pct: float = 98.0) -> np.ndarray:
    """Robust contrast stretching to enhance midtone details.

    This helps reliefs look more detailed from photos / shaded ornaments.
    For binary logos, it usually has minimal impact.
    """
    low_pct = float(low_pct)
    high_pct = float(high_pct)
    if high_pct <= low_pct:
        return gray
    a = gray.astype(np.float32)
    lo = float(np.percentile(a, low_pct))
    hi = float(np.percentile(a, high_pct))
    if hi - lo < 1e-6:
        return gray
    out = (a - lo) / (hi - lo)
    out = np.clip(out, 0.0, 1.0)
    return (out * 255.0).astype(np.uint8)


def _gamma(gray: np.ndarray, gamma: float = 1.0) -> np.ndarray:
    """Gamma correction: gamma<1 boosts shadows, gamma>1 boosts highlights."""
    gamma = float(gamma)
    if abs(gamma - 1.0) < 1e-6:
        return gray
    a = gray.astype(np.float32) / 255.0
    out = np.power(np.clip(a, 0.0, 1.0), gamma)
    return (out * 255.0).astype(np.uint8)


def _heightmap_to_solid_triangles(
    heights: np.ndarray,
    px: float,
    base_thickness: float,
) -> list:
    """Generate a watertight solid STL from a heightmap grid.

    heights: 2D array in mm (height above base plane, can be 0)
    px: mm per cell
    base_thickness: mm
    """
    rows, cols = heights.shape
    tris: list = []

    def z_top(r: int, c: int) -> float:
        return base_thickness + float(heights[r, c])

    # Top surface
    for r in range(rows - 1):
        for c in range(cols - 1):
            x0, x1 = c * px, (c + 1) * px
            y0, y1 = (rows - r - 1) * px, (rows - (r + 1) - 1) * px

            # grid corners (r,c) .. (r+1,c+1)
            z00 = z_top(r, c)
            z10 = z_top(r, c + 1)
            z01 = z_top(r + 1, c)
            z11 = z_top(r + 1, c + 1)

            v00 = [x0, y0, z00]
            v10 = [x1, y0, z10]
            v01 = [x0, y1, z01]
            v11 = [x1, y1, z11]

            # Two triangles for the quad
            tris.append((v00, v01, v11))
            tris.append((v00, v11, v10))

    # Bottom surface (flat at z=0)
    for r in range(rows - 1):
        for c in range(cols - 1):
            x0, x1 = c * px, (c + 1) * px
            y0, y1 = (rows - r - 1) * px, (rows - (r + 1) - 1) * px
            v00 = [x0, y0, 0.0]
            v10 = [x1, y0, 0.0]
            v01 = [x0, y1, 0.0]
            v11 = [x1, y1, 0.0]
            # flip winding relative to top
            tris.append((v00, v11, v01))
            tris.append((v00, v10, v11))

    # Side walls: for each boundary edge, connect top to bottom
    # Top boundary (r=0)
    r = 0
    for c in range(cols - 1):
        x0, x1 = c * px, (c + 1) * px
        y = (rows - r - 1) * px
        z0 = z_top(r, c)
        z1 = z_top(r, c + 1)
        v0t = [x0, y, z0]
        v1t = [x1, y, z1]
        v0b = [x0, y, 0.0]
        v1b = [x1, y, 0.0]
        tris.append((v0b, v1t, v0t))
        tris.append((v0b, v1b, v1t))

    # Bottom boundary (r=rows-1)
    r = rows - 1
    for c in range(cols - 1):
        x0, x1 = c * px, (c + 1) * px
        y = (rows - r - 1) * px
        z0 = z_top(r, c)
        z1 = z_top(r, c + 1)
        v0t = [x0, y, z0]
        v1t = [x1, y, z1]
        v0b = [x0, y, 0.0]
        v1b = [x1, y, 0.0]
        tris.append((v0b, v0t, v1t))
        tris.append((v0b, v1t, v1b))

    # Left boundary (c=0)
    c = 0
    for r in range(rows - 1):
        x = c * px
        y0 = (rows - r - 1) * px
        y1 = (rows - (r + 1) - 1) * px
        z0 = z_top(r, c)
        z1 = z_top(r + 1, c)
        v0t = [x, y0, z0]
        v1t = [x, y1, z1]
        v0b = [x, y0, 0.0]
        v1b = [x, y1, 0.0]
        tris.append((v0b, v0t, v1t))
        tris.append((v0b, v1t, v1b))

    # Right boundary (c=cols-1)
    c = cols - 1
    for r in range(rows - 1):
        x = (c + 0) * px
        y0 = (rows - r - 1) * px
        y1 = (rows - (r + 1) - 1) * px
        z0 = z_top(r, c)
        z1 = z_top(r + 1, c)
        v0t = [x, y0, z0]
        v1t = [x, y1, z1]
        v0b = [x, y0, 0.0]
        v1b = [x, y1, 0.0]
        tris.append((v0b, v1t, v0t))
        tris.append((v0b, v1b, v1t))

    return tris


def _stl_from_triangles(triangles: list, output_path: str) -> None:
    n = len(triangles)
    m = stl_mesh.Mesh(np.zeros(n, dtype=stl_mesh.Mesh.dtype))
    for i, (v0, v1, v2) in enumerate(triangles):
        m.v0[i] = v0
        m.v1[i] = v1
        m.v2[i] = v2
    m.save(output_path)


def _cube_triangles(x: float, y: float, z: float, w: float, d: float, h: float) -> list:
    """12 triangles (6 faces) for a box voxel.

    Args:
        x, y, z: origin (mm)
        w: width in X (mm)
        d: depth in Y (mm)
        h: height in Z (mm)
    """
    return [
        # Bottom
        ([x, y, z],     [x+w, y, z],     [x+w, y+d, z]),
        ([x, y, z],     [x+w, y+d, z],   [x, y+d, z]),
        # Top
        ([x, y, z+h],   [x+w, y+d, z+h], [x+w, y, z+h]),
        ([x, y, z+h],   [x, y+d, z+h],   [x+w, y+d, z+h]),
        # Front
        ([x, y, z],     [x+w, y, z],     [x+w, y, z+h]),
        ([x, y, z],     [x+w, y, z+h],   [x, y, z+h]),
        # Back
        ([x, y+d, z],   [x+w, y+d, z+h], [x+w, y+d, z]),
        ([x, y+d, z],   [x, y+d, z+h],   [x+w, y+d, z+h]),
        # Left
        ([x, y, z],     [x, y+d, z+h],   [x, y+d, z]),
        ([x, y, z],     [x, y, z+h],     [x, y+d, z+h]),
        # Right
        ([x+w, y, z],   [x+w, y+d, z],   [x+w, y+d, z+h]),
        ([x+w, y, z],   [x+w, y+d, z+h], [x+w, y, z+h]),
    ]


def _get_outline_mask(rows: int, cols: int, outline_type: str) -> np.ndarray:
    """Generate outline mask (rectangle or circle)."""
    mask = np.zeros((rows, cols), dtype=np.uint8)
    
    if outline_type == "rectangle":
        # Full rectangle border around the image edges
        mask[0, :] = 1
        mask[-1, :] = 1
        mask[:, 0] = 1
        mask[:, -1] = 1
    elif outline_type == "circle":
        # Circle border - lebih tebal agar terlihat
        center_r = rows / 2.0
        center_c = cols / 2.0
        # Set radius ke edge minus small margin
        radius = min(center_r, center_c) - 2
        # Untuk circle, gunakan threshold yang lebih toleran (3 pixel thickness)
        for r in range(rows):
            for c in range(cols):
                dist = np.sqrt((r - center_r)**2 + (c - center_c)**2)
                if abs(dist - radius) < 3.0:  # 3 pixel thick outline
                    mask[r, c] = 1
    
    return mask


def _simplify_polyline(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Remove redundant collinear points from a closed or open polyline.

    Points are integer coordinates.
    """
    if len(points) < 4:
        return points

    out: list[tuple[int, int]] = []
    n = len(points)

    def is_collinear(a: tuple[int, int], b: tuple[int, int], c: tuple[int, int]) -> bool:
        # cross product == 0
        return (b[0] - a[0]) * (c[1] - b[1]) == (b[1] - a[1]) * (c[0] - b[0])

    for i in range(n):
        prev = points[(i - 1) % n]
        cur = points[i]
        nxt = points[(i + 1) % n]
        if is_collinear(prev, cur, nxt):
            continue
        out.append(cur)

    return out


def _mask_to_contour_loops(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    """Extract contour loops from a binary mask using boundary edge stitching.

    Returns:
        List of loops, each loop is a list of integer grid points (x, y).
    """
    from collections import defaultdict

    rows, cols = mask.shape

    # Build oriented boundary edges with integer coordinates on pixel grid.
    edges: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)

    def filled(r: int, c: int) -> bool:
        return 0 <= r < rows and 0 <= c < cols and bool(mask[r, c])

    for r in range(rows):
        for c in range(cols):
            if not mask[r, c]:
                continue

            # Pixel-space corners (integer grid)
            x0, x1 = c, c + 1
            y0, y1 = (rows - r - 1), (rows - r)  # invert Y so it matches other exports

            # Neighbors: up=r-1, right=c+1, down=r+1, left=c-1
            if not filled(r - 1, c):
                # top edge (clockwise)
                edges[(x0, y1)].append((x1, y1))
            if not filled(r, c + 1):
                # right edge
                edges[(x1, y1)].append((x1, y0))
            if not filled(r + 1, c):
                # bottom edge
                edges[(x1, y0)].append((x0, y0))
            if not filled(r, c - 1):
                # left edge
                edges[(x0, y0)].append((x0, y1))

    loops: list[list[tuple[int, int]]] = []

    while edges:
        start = next(iter(edges))
        cur = start
        loop: list[tuple[int, int]] = [cur]
        guard = 0

        while True:
            guard += 1
            if guard > 10_000_000:
                # Safety: prevent infinite loops
                break

            nxts = edges.get(cur)
            if not nxts:
                break
            nxt = nxts.pop()
            if not nxts:
                edges.pop(cur, None)
            cur = nxt
            if cur == start:
                break
            loop.append(cur)

        if len(loop) >= 4 and loop[0] == start:
            loops.append(_simplify_polyline(loop))

    return loops


# ── STL ───────────────────────────────────────────────────────────────────────

def convert_png_to_stl(input_path: str, output_path: str, cfg: dict[str, Any] | None = None) -> None:
    """
    Tiga metode:
      heightmap  — tinggi voxel proporsional dgn kecerahan piksel
      relief     — piksel putih diextrude ke max_height_mm di atas base
      silhouette — outline tepi diextrude sebagai dinding tipis
    
    Outline dapat diterapkan: rectangle atau circle dengan ketebalan yang dapat dikonfigurasi.
    """
    cfg = cfg or {}
    method          = str(cfg.get("method", "relief"))
    threshold       = int(cfg.get("threshold", 128))
    max_height      = float(cfg.get("max_height_mm", 4.0))
    base_thickness  = float(cfg.get("base_thickness_mm", 2.0))
    resolution      = int(cfg.get("resolution", 2))
    scale_mm_per_px = float(cfg.get("scale_mm_per_px", 0.2))
    outline_type    = cfg.get("outline_type")  # None, 'rectangle', or 'circle'
    outline_thick_mm = float(cfg.get("outline_thickness", 1.0)) if cfg.get("outline_thickness") else None
    smoothing_blur_radius = float(cfg.get("smoothing_blur_radius", 0.0) or 0.0)
    relief_detail = str(cfg.get("relief_detail", "grayscale")).lower()  # 'binary' or 'grayscale'
    contrast_stretch = bool(cfg.get("contrast_stretch", True))
    contrast_low_pct = float(cfg.get("contrast_low_pct", 2.0))
    contrast_high_pct = float(cfg.get("contrast_high_pct", 98.0))
    gamma = float(cfg.get("gamma", 1.0))

    gray, effective_mm_per_px = _load_gray_and_scale(input_path, resolution, scale_mm_per_px)
    if contrast_stretch:
        gray = _contrast_stretch(gray, contrast_low_pct, contrast_high_pct)
    gray = _gamma(gray, gamma)
    gray = _smooth_gray(gray, smoothing_blur_radius)
    rows, cols = gray.shape

    # Convert pixel units to mm units (after downsampling).
    px = effective_mm_per_px

    # Prefer a smooth surface mesh for relief/heightmap/profile.
    # Silhouette remains voxel-based edges.
    triangles: list = []

    if method == "silhouette":
        pil_gray = Image.fromarray(gray)
        edges = pil_gray.filter(ImageFilter.FIND_EDGES)
        edge_arr = np.array(edges)
        bin_edge = (edge_arr > threshold).astype(np.uint8)
        wall_height = max_height
        # Solid base voxels for silhouette (simpler implementation)
        for r in range(rows):
            for c in range(cols):
                x = float(c) * px
                y = float(rows - r - 1) * px
                triangles += _cube_triangles(x, y, 0.0, px, px, base_thickness)
                if bin_edge[r, c]:
                    triangles += _cube_triangles(x, y, base_thickness, px, px, wall_height)
    else:
        # Build height map (height above base)
        heights = np.zeros_like(gray, dtype=np.float32)
        if method == "heightmap":
            # Only raise above threshold
            m = gray.astype(np.float32)
            mask = (m > threshold).astype(np.float32)
            heights = (m / 255.0) * max_height * mask
        elif method == "profile":
            m = gray.astype(np.float32)
            heights = (1.0 - (m / 255.0)) * max_height
            heights[heights < 0.1] = 0.0
        else:
            # relief
            if relief_detail == "binary":
                mask = _binary(gray, threshold).astype(np.float32)
                heights = mask * max_height
            else:
                # grayscale relief: keep more detail by mapping brightness to height.
                # Apply threshold as a floor to remove background noise.
                m = gray.astype(np.float32)
                heights = (m / 255.0) * max_height
                heights[m <= threshold] = 0.0

        triangles = _heightmap_to_solid_triangles(heights, px, base_thickness)

    # ── Apply Outline ──────────────────────────────────────────────────────
    if outline_type in ("rectangle", "circle") and outline_thick_mm:
        outline_mask = _get_outline_mask(rows, cols, outline_type)
        outline_height = outline_thick_mm
        for r in range(rows):
            for c in range(cols):
                if outline_mask[r, c]:
                    triangles += _cube_triangles(float(c) * px, float(rows - r - 1) * px, base_thickness, px, px, outline_height)

    if not triangles:
        raise ValueError("No geometry generated — coba turunkan threshold.")

    _stl_from_triangles(triangles, output_path)


# ── SVG ───────────────────────────────────────────────────────────────────────

def convert_png_to_svg(input_path: str, output_path: str, cfg: dict[str, Any] | None = None) -> None:
    """Raster -> vector: piksel hitam menjadi path SVG dengan opsional outline."""
    cfg = cfg or {}
    threshold      = int(cfg.get("threshold", 128))
    resolution     = int(cfg.get("resolution", 2))
    scale          = float(cfg.get("scale_mm_per_px", 0.2))
    method         = str(cfg.get("method", "relief"))
    outline_type   = cfg.get("outline_type")
    outline_thick_mm = float(cfg.get("outline_thickness", 1.0)) if cfg.get("outline_thickness") else None

    gray, effective_mm_per_px = _load_gray_and_scale(input_path, resolution, scale)
    rows, cols = gray.shape
    px = effective_mm_per_px

    if method == "profile":
        # Profile/Pocket: Display dengan grayscale (darker = deeper)
        dwg = svgwrite.Drawing(output_path, size=(f"{cols*px:.2f}mm", f"{rows*px:.2f}mm"))
        dwg.add(dwg.rect(insert=(0, 0), size=("100%", "100%"), fill="white"))
        
        for r in range(rows):
            for c in range(cols):
                v = gray[r, c]
                # Grayscale representation
                gray_val = int(255 - v)  # Inverse for visualization
                gray_hex = f"#{gray_val:02x}{gray_val:02x}{gray_val:02x}"
                dwg.add(dwg.rect(
                    insert=(f"{c*px:.3f}mm", f"{r*px:.3f}mm"),
                    size=(f"{px:.3f}mm", f"{px:.3f}mm"),
                    fill=gray_hex,
                ))
    elif method == "silhouette":
        pil_gray = Image.fromarray(gray)
        arr = np.array(pil_gray.filter(ImageFilter.FIND_EDGES))
        mask = (arr > threshold).astype(np.uint8)
        
        dwg = svgwrite.Drawing(output_path, size=(f"{cols*px:.2f}mm", f"{rows*px:.2f}mm"))
        dwg.add(dwg.rect(insert=(0, 0), size=("100%", "100%"), fill="white"))
        
        for r in range(rows):
            for c in range(cols):
                if mask[r, c]:
                    dwg.add(dwg.rect(
                        insert=(f"{c*px:.3f}mm", f"{r*px:.3f}mm"),
                        size=(f"{px:.3f}mm", f"{px:.3f}mm"),
                        fill="black",
                    ))
    else:
        # Heightmap and Relief
        mask = _binary(gray, threshold)

        dwg = svgwrite.Drawing(output_path, size=(f"{cols*px:.2f}mm", f"{rows*px:.2f}mm"))
        dwg.add(dwg.rect(insert=(0, 0), size=("100%", "100%"), fill="white"))

        # Draw main content
        for r in range(rows):
            for c in range(cols):
                if mask[r, c]:
                    dwg.add(dwg.rect(
                        insert=(f"{c*px:.3f}mm", f"{r*px:.3f}mm"),
                        size=(f"{px:.3f}mm", f"{px:.3f}mm"),
                        fill="black",
                    ))

    # ── Apply Outline ──────────────────────────────────────────────────────
    if outline_type in ("rectangle", "circle") and outline_thick_mm:
        outline_mask = _get_outline_mask(rows, cols, outline_type)
        outline_color = "darkgray"
        for r in range(rows):
            for c in range(cols):
                if outline_mask[r, c]:
                    dwg.add(dwg.rect(
                        insert=(f"{c*px:.3f}mm", f"{r*px:.3f}mm"),
                        size=(f"{px:.3f}mm", f"{px:.3f}mm"),
                        fill=outline_color,
                    ))

    dwg.save()


# ── DXF ───────────────────────────────────────────────────────────────────────

def convert_png_to_dxf(input_path: str, output_path: str, cfg: dict[str, Any] | None = None) -> None:
    """Raster -> DXF contours (Aspire-friendly).

    Important:
    - For Aspire profile/cut-contour toolpaths, DXF should contain **2D vectors** (polylines),
      not raster SOLIDs.
    - This exporter generates closed LWPOLYLINE loops on layer `CONTOUR`.

    If ball_radius_mm is provided, stepover can be written as metadata text in the DXF.
    """
    cfg = cfg or {}
    threshold      = int(cfg.get("threshold", 128))
    resolution     = int(cfg.get("resolution", 2))
    scale_mm_per_px = float(cfg.get("scale_mm_per_px", 0.2))
    method         = str(cfg.get("method", "relief"))
    outline_type   = cfg.get("outline_type")
    outline_thick_mm = float(cfg.get("outline_thickness", 1.0)) if cfg.get("outline_thickness") else None
    ball_radius_mm = cfg.get("ball_radius_mm")  # Ball nose radius
    stepover_mm    = cfg.get("stepover_mm")     # Calculated stepover (10% of ball radius)

    gray, effective_mm_per_px = _load_gray_and_scale(input_path, resolution, scale_mm_per_px)
    rows, cols = gray.shape
    px = effective_mm_per_px

    doc = ezdxf.new(dxfversion="R2010")
    # Set drawing units to millimeters
    doc.header["$INSUNITS"] = 4
    msp = doc.modelspace()

    # Ensure layers exist
    if "CONTOUR" not in doc.layers:
        doc.layers.new(name="CONTOUR")

    # ── Add CNC Parameters as comment layer ────────────────────────────────
    if ball_radius_mm is not None and stepover_mm is not None:
        # Create a layer for CNC parameters (comments)
        if "CNC_PARAMS" not in doc.layers:
            doc.layers.new(name="CNC_PARAMS")
        
        # Add parameter information as text (will appear in DXF)
        param_text = f"Ball Radius: {ball_radius_mm:.2f}mm | Stepover: {stepover_mm:.3f}mm (10%)"
        msp.add_text(
            param_text,
            dxfattribs={
                "insert": (0, cols * px + 5),
                "height": 2,
                "layer": "CNC_PARAMS",
            }
        )

    # Build a binary mask to trace vectors.
    # Note: this is intentionally 2D for contour toolpaths.
    if method == "silhouette":
        pil_gray = Image.fromarray(gray)
        arr = np.array(pil_gray.filter(ImageFilter.FIND_EDGES))
        mask = (arr > threshold).astype(np.uint8)
    elif method == "profile":
        # Treat darker pixels as "to be pocketed/profiled" region
        mask = (gray < threshold).astype(np.uint8)
    else:
        # heightmap + relief
        mask = _binary(gray, threshold)

    # ── Apply Outline ──────────────────────────────────────────────────────
    if outline_type in ("rectangle", "circle") and outline_thick_mm:
        outline_mask = _get_outline_mask(rows, cols, outline_type)
        # Include outline in the contour mask
        mask = np.maximum(mask, outline_mask)

    # Extract contour loops in pixel-grid units then scale to mm.
    loops = _mask_to_contour_loops(mask)

    # Convert loops to mm coordinates.
    for loop in loops:
        pts_mm = [(x * px, y * px) for (x, y) in loop]
        # Add closed polyline
        msp.add_lwpolyline(
            pts_mm,
            close=True,
            dxfattribs={"layer": "CONTOUR"},
        )

    doc.saveas(output_path)
