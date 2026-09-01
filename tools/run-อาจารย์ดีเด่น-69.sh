#!/bin/bash
set -e

echo "=========================================================================================="
echo "🎬 PSU AVA — EXECUTING WORKFLOW: อาจารย์ดีเด่น-69 (Vlog Lifestyle Doodle Master)"
echo "=========================================================================================="

echo "\n[Step 1/3] Generating Photorealistic Background from ComfyUI GPU Server..."
python3 tools/generate-comfy-dental-bg.py

echo "\n[Step 2/3] Synthesizing Title Bumper, AR Cover Card & Climax Quote Card..."
python3 tools/generate-perfect-vlog-suite.py

echo "\n[Step 3/3] Assembling Multitrack Timeline & Exporting Premiere Pro XML..."
python3 tools/build-real-production-v2.py

echo "\n=========================================================================================="
echo "🏆 WORKFLOW COMPLETED 100%! Ready for Broadcast & Premiere Pro."
echo "=========================================================================================="
