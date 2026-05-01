#!/usr/bin/env python3
"""
Test script untuk verifikasi base layer implementation
Membuat test image dan mengkonversi dengan berbagai methods
"""
import sys
from pathlib import Path

# Cek apakah PIL tersedia
try:
    from PIL import Image, ImageDraw
except ImportError:
    print("❌ PIL tidak tersedia. Install dengan: pip install pillow")
    sys.exit(1)

try:
    import numpy as np
    from stl import mesh as stl_mesh
except ImportError:
    print("❌ numpy atau stl tidak tersedia")
    sys.exit(1)


def create_test_image():
    """Buat simple test image dengan berbagai pola"""
    img = Image.new('L', (100, 100), color=255)  # White background
    draw = ImageDraw.Draw(img)
    
    # Draw black circle in center
    draw.ellipse([25, 25, 75, 75], fill=50)
    
    # Draw black rectangle
    draw.rectangle([10, 80, 40, 95], fill=30)
    
    # Draw gradient area
    for x in range(50, 90):
        gray_val = int(100 + (x - 50) * 3)
        gray_val = min(255, max(0, gray_val))
        draw.line([(x, 10), (x, 20)], fill=gray_val)
    
    test_path = Path("/tmp/test_base_layer.png")
    img.save(test_path)
    print(f"✅ Test image created: {test_path}")
    return test_path


def analyze_stl_structure(stl_path):
    """Analyze STL file to check base layer"""
    try:
        m = stl_mesh.Mesh.from_file(str(stl_path))
        
        # Get Z coordinates from vertices
        z_coords = []
        for v in m.vectors:
            for vertex in v:
                z_coords.append(vertex[2])
        
        if not z_coords:
            print("❌ No vertices found in STL")
            return False
        
        z_min = min(z_coords)
        z_max = max(z_coords)
        z_unique = len(set(round(z, 2) for z in z_coords))
        
        print(f"   Z Range: {z_min:.2f}mm - {z_max:.2f}mm")
        print(f"   Total Height: {z_max - z_min:.2f}mm")
        print(f"   Unique Z levels: ~{z_unique}")
        
        # Check if base layer exists (should have Z values close to 0)
        base_layer_pixels = sum(1 for z in z_coords if z < 0.5)
        total_pixels = len(z_coords)
        base_layer_percent = (base_layer_pixels / total_pixels * 100) if total_pixels > 0 else 0
        
        print(f"   Base layer coverage: {base_layer_percent:.1f}%")
        
        if z_min > 0.5:
            print("   ⚠️  WARNING: No base layer detected (Z min > 0.5mm)")
            return False
        
        print("   ✅ Base layer detected")
        return True
        
    except Exception as e:
        print(f"   ❌ Error analyzing STL: {e}")
        return False


def test_conversions():
    """Test konversi dengan berbagai methods"""
    print("\n" + "="*70)
    print("BASE LAYER IMPLEMENTATION TEST")
    print("="*70)
    
    # Create test image
    print("\n[1] Creating test image...")
    test_img = create_test_image()
    
    if not test_img.exists():
        print("❌ Failed to create test image")
        return False
    
    # Import converter
    print("\n[2] Loading converter module...")
    try:
        sys.path.insert(0, '/Users/herisandiyadi/Documents/png-converter-app/backend')
        from app.utils.converters import convert_png_to_stl
        print("✅ Converter loaded")
    except Exception as e:
        print(f"❌ Failed to load converter: {e}")
        return False
    
    # Test each method
    methods = ['heightmap', 'relief', 'profile', 'silhouette']
    results = {}
    
    for method in methods:
        print(f"\n[3.{methods.index(method)+1}] Testing {method.upper()} method...")
        
        output_path = Path(f"/tmp/test_{method}.stl")
        config = {
            'method': method,
            'threshold': 128,
            'max_height_mm': 4.0,
            'base_thickness_mm': 2.0,
            'resolution': 2,
        }
        
        try:
            convert_png_to_stl(str(test_img), str(output_path), config)
            print(f"   ✅ STL generated: {output_path}")

            # Check XY scale roughly matches expected mm based on scale_mm_per_px * resolution
            try:
                # Expect final size = pixel_count * scale_mm_per_px * resolution.
                # test image is 100x100, but converter downsamples to max_dim=512//resolution.
                # So we validate only that XY is in mm (not raw pixels): should be <= 512*scale*res.
                from stl import mesh as stl_mesh
                m = stl_mesh.Mesh.from_file(str(output_path))
                mins = m.vectors.reshape(-1, 3).min(axis=0)
                maxs = m.vectors.reshape(-1, 3).max(axis=0)
                size = maxs - mins
                if size[0] > 1000 or size[1] > 1000:
                    print(f"   ⚠️  WARNING: XY size looks too large (not mm-scaled): {size[0]:.2f}×{size[1]:.2f}")
            except Exception:
                pass
            
            # Analyze structure
            if analyze_stl_structure(output_path):
                results[method] = True
            else:
                results[method] = False
                
        except Exception as e:
            print(f"   ❌ Conversion failed: {e}")
            results[method] = False

    # Test DXF contour exporter outputs polylines (Aspire-friendly)
    print(f"\n[4] Testing DXF contour export...")
    try:
        from app.utils.converters import convert_png_to_dxf
        import ezdxf
        dxf_path = Path('/tmp/test_contour.dxf')
        convert_png_to_dxf(str(test_img), str(dxf_path), {
            'method': 'relief',
            'threshold': 128,
            'scale_mm_per_px': 0.2,
            'resolution': 2,
        })
        doc = ezdxf.readfile(str(dxf_path))
        msp = doc.modelspace()
        types = {e.dxftype() for e in msp}
        lw_count = sum(1 for e in msp if e.dxftype() == 'LWPOLYLINE')
        if types == {'LWPOLYLINE'} and lw_count > 0:
            print(f"   ✅ DXF generated with {lw_count} LWPOLYLINE entities: {dxf_path}")
        else:
            print(f"   ❌ DXF unexpected entities: {types}")
            results['dxf'] = False
    except Exception as e:
        print(f"   ❌ DXF conversion failed: {e}")
        results['dxf'] = False
    
    # Summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    
    for method, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{method.upper():12} : {status}")
    
    all_passed = all(results.values())
    print("\n" + "="*70)
    if all_passed:
        print("✅ ALL TESTS PASSED - Base layer implementation working!")
    else:
        print("❌ SOME TESTS FAILED - Check output above")
    print("="*70 + "\n")
    
    return all_passed


if __name__ == "__main__":
    success = test_conversions()
    sys.exit(0 if success else 1)
