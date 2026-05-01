#!/usr/bin/env python3
"""
Test script untuk memverifikasi profile method sudah berfungsi
"""
import requests
import json
from pathlib import Path

BASE_URL = "http://localhost:8000/api"

# Test credentials (adjust as needed)
LOGIN_URL = f"{BASE_URL}/auth/login"
CONVERT_URL = f"{BASE_URL}/conversions"

# Credentials
EMAIL = "admin@example.com"
PASSWORD = "admin123"

def test_profile_method():
    """Test profile method conversion"""
    
    print("=" * 60)
    print("TEST: Profile Method Conversion")
    print("=" * 60)
    
    # 1. Login
    print("\n1. Logging in...")
    login_data = {
        "email": EMAIL,
        "password": PASSWORD
    }
    resp = requests.post(LOGIN_URL, json=login_data)
    
    if resp.status_code != 200:
        print(f"❌ Login failed: {resp.status_code}")
        print(resp.json())
        return False
    
    token = resp.json()["access_token"]
    print("✅ Login successful")
    
    # 2. Prepare test image
    print("\n2. Preparing test image...")
    test_image_path = Path("/tmp/test_profile.png")
    
    if not test_image_path.exists():
        print("⚠️  Creating simple test image...")
        try:
            from PIL import Image, ImageDraw
            # Create 100x100 grayscale image
            img = Image.new('L', (100, 100), color=200)
            draw = ImageDraw.Draw(img)
            # Draw a circle
            draw.ellipse([20, 20, 80, 80], fill=50)
            img.save(test_image_path)
            print(f"✅ Test image created at {test_image_path}")
        except Exception as e:
            print(f"❌ Failed to create test image: {e}")
            return False
    else:
        print(f"✅ Test image found at {test_image_path}")
    
    # 3. Send conversion request with profile method
    print("\n3. Sending conversion request with profile method...")
    
    with open(test_image_path, 'rb') as f:
        files = {
            'file': ('test.png', f, 'image/png')
        }
        data = {
            'method': 'profile',  # THIS IS THE TEST
            'formats': 'stl',
            'max_height_mm': 5.0,
            'base_thickness_mm': 2.0,
        }
        headers = {
            'Authorization': f'Bearer {token}'
        }
        
        resp = requests.post(CONVERT_URL, files=files, data=data, headers=headers)
    
    print(f"Response Status: {resp.status_code}")
    
    if resp.status_code in [200, 202]:
        result = resp.json()
        print("✅ Conversion request accepted!")
        print(f"Job ID: {result.get('id')}")
        print(f"Status: {result.get('status')}")
        return True
    else:
        print(f"❌ Conversion failed: {resp.status_code}")
        print(f"Response: {json.dumps(resp.json(), indent=2)}")
        return False

if __name__ == "__main__":
    success = test_profile_method()
    print("\n" + "=" * 60)
    if success:
        print("✅ PROFILE METHOD TEST PASSED")
    else:
        print("❌ PROFILE METHOD TEST FAILED")
    print("=" * 60)
