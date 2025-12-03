"""
FBX to GLB Converter using Blender
Converts all FBX files in the animation folder to GLB format
"""

import bpy
import os
import sys

# Input/Output directories
input_dir = "/Users/jinsoolee/Projects/archiple-1.0/public/animation"
output_dir = "/Users/jinsoolee/Projects/archiple-1.0/public/animation"

# Get all FBX files
fbx_files = [f for f in os.listdir(input_dir) if f.endswith('.fbx')]

print(f"Found {len(fbx_files)} FBX files to convert")

for fbx_file in fbx_files:
    # Clear the scene
    bpy.ops.wm.read_factory_settings(use_empty=True)

    input_path = os.path.join(input_dir, fbx_file)
    output_filename = fbx_file.replace('.fbx', '.glb').replace(' ', '_')
    output_path = os.path.join(output_dir, output_filename)

    print(f"Converting: {fbx_file} -> {output_filename}")

    try:
        # Import FBX
        bpy.ops.import_scene.fbx(filepath=input_path)

        # Export as GLB
        bpy.ops.export_scene.gltf(
            filepath=output_path,
            export_format='GLB',
            export_animations=True,
            export_skins=True,
            export_morph=True,
            export_apply=False
        )

        print(f"  ✓ Success: {output_filename}")

    except Exception as e:
        print(f"  ✗ Error: {e}")

print("\nConversion complete!")
