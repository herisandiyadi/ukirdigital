#!/usr/bin/env python3
"""
Test script untuk memverifikasi Circle vs Rectangle outline
"""
import numpy as np
from PIL import Image, ImageDraw

def visualize_mask(mask, outline_type):
    """Visualisasi mask sebagai image"""
    # Convert mask (0/1) ke visual representation
    h, w = mask.shape
    # Create white image
    img = Image.new('RGB', (w, h), 'white')
    pixels = img.load()
    
    # Draw black pixels where mask = 1
    for r in range(h):
        for c in range(w):
            if mask[r, c] == 1:
                pixels[c, r] = (0, 0, 0)  # black
    
    return img

def create_rectangle_mask(rows, cols):
    """Rectangle outline"""
    mask = np.zeros((rows, cols), dtype=np.uint8)
    mask[0, :] = 1
    mask[-1, :] = 1
    mask[:, 0] = 1
    mask[:, -1] = 1
    return mask

def create_circle_mask(rows, cols):
    """Circle outline (fixed version)"""
    mask = np.zeros((rows, cols), dtype=np.uint8)
    center_r = rows / 2.0
    center_c = cols / 2.0
    radius = min(center_r, center_c) - 2
    
    for r in range(rows):
        for c in range(cols):
            dist = np.sqrt((r - center_r)**2 + (c - center_c)**2)
            if abs(dist - radius) < 3.0:  # 3 pixel thick outline
                mask[r, c] = 1
    
    return mask

def print_mask_text(mask):
    """Print mask as ASCII (X for 1, . for 0)"""
    h, w = mask.shape
    for r in range(h):
        row = ""
        for c in range(w):
            row += "X" if mask[r, c] == 1 else "."
        print(row)

if __name__ == "__main__":
    size = 32  # Small size untuk ASCII visualization
    
    print("=" * 50)
    print("RECTANGLE OUTLINE TEST")
    print("=" * 50)
    rect_mask = create_rectangle_mask(size, size)
    print(f"\nRectangle mask ({size}×{size}):")
    print_mask_text(rect_mask)
    print(f"\nTotal pixels: {np.sum(rect_mask)}")
    
    print("\n" + "=" * 50)
    print("CIRCLE OUTLINE TEST (FIXED)")
    print("=" * 50)
    circle_mask = create_circle_mask(size, size)
    print(f"\nCircle mask ({size}×{size}):")
    print_mask_text(circle_mask)
    print(f"\nTotal pixels: {np.sum(circle_mask)}")
    
    print("\n" + "=" * 50)
    print("COMPARISON")
    print("=" * 50)
    
    # Count pixels
    rect_pixels = np.sum(rect_mask)
    circle_pixels = np.sum(circle_mask)
    
    print(f"\nRectangle outline pixels: {rect_pixels}")
    print(f"Circle outline pixels:    {circle_pixels}")
    print(f"Difference: {abs(rect_pixels - circle_pixels)} pixels")
    
    # Check if different
    if np.array_equal(rect_mask, circle_mask):
        print("\n❌ ERROR: Rectangle dan Circle mask SAMA! (Bug masih ada)")
    else:
        print("\n✅ SUCCESS: Rectangle dan Circle mask BERBEDA!")
        
        # Analyze shape difference
        rect_corners = (
            rect_mask[0, 0] + 
            rect_mask[0, -1] + 
            rect_mask[-1, 0] + 
            rect_mask[-1, -1]
        )
        
        print(f"\nRectangle corners set: {rect_corners == 4}")
        print(f"Circle corners set: {circle_mask[0, 0]}")
        
        if rect_corners == 4 and circle_mask[0, 0] == 0:
            print("\n✅ Bentuk BERBEDA seperti yang diharapkan!")
            print("   Rectangle memiliki corner pixels")
            print("   Circle tidak memiliki corner pixels (rounded)")
    
    # Save visualization
    print("\n" + "=" * 50)
    print("SAVING VISUALIZATIONS")
    print("=" * 50)
    
    rect_img = visualize_mask(rect_mask, "rectangle")
    circle_img = visualize_mask(circle_mask, "circle")
    
    # Scale up untuk bisa dilihat
    scale = 10
    rect_img_large = rect_img.resize((size * scale, size * scale), Image.NEAREST)
    circle_img_large = circle_img.resize((size * scale, size * scale), Image.NEAREST)
    
    rect_img_large.save("/tmp/outline_rectangle_test.png")
    circle_img_large.save("/tmp/outline_circle_test.png")
    
    print(f"\n✅ Rectangle visualization: /tmp/outline_rectangle_test.png")
    print(f"✅ Circle visualization:    /tmp/outline_circle_test.png")
    print("\nBuka file-file tersebut untuk melihat perbedaan visual!")
