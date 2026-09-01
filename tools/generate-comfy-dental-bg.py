import urllib.request
import urllib.parse
import json
import time
import os

COMFY_HOST = "http://10.135.66.70:8188"
CACHE_DIR = os.path.abspath(".ava-cache/comfy-dental")
os.makedirs(CACHE_DIR, exist_ok=True)

prompt = {
  "1": {
    "inputs": {
      "unet_name": "z_image_turbo_bf16.safetensors",
      "weight_dtype": "default"
    },
    "class_type": "UNETLoader"
  },
  "2": {
    "inputs": {
      "clip_name": "qwen_3_4b.safetensors",
      "type": "lumina2"
    },
    "class_type": "CLIPLoader"
  },
  "3": {
    "inputs": {
      "seed": int(time.time()),
      "steps": 8,
      "cfg": 1.0,
      "sampler_name": "euler_ancestral",
      "scheduler": "karras",
      "denoise": 1.0,
      "model": ["1", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
    },
    "class_type": "KSampler"
  },
  "4": {
    "inputs": {
      "vae_name": "ae.safetensors"
    },
    "class_type": "VAELoader"
  },
  "5": {
    "inputs": {
      "width": 1344,
      "height": 768,
      "batch_size": 1
    },
    "class_type": "EmptyLatentImage"
  },
  "6": {
    "inputs": {
      "text": "luxury futuristic dental medicine clinic and research laboratory background, clean medical navy and teal ambient glow, soft bokeh depth of field, 3D holographic dental tooth models in background blur, glassmorphic panels, cinematic studio lighting, photorealistic, 8k resolution, elegant masterpiece",
      "clip": ["2", 0]
    },
    "class_type": "CLIPTextEncode"
  },
  "7": {
    "inputs": {
      "text": "human, face, person, portrait, readable text, typo, logo, watermark, ugly, low quality, noisy, dark muddy",
      "clip": ["2", 0]
    },
    "class_type": "CLIPTextEncode"
  },
  "8": {
    "inputs": {
      "samples": ["3", 0],
      "vae": ["4", 0]
    },
    "class_type": "VAEDecode"
  },
  "9": {
    "inputs": {
      "filename_prefix": "psu_ava/dental_clinic_bg",
      "images": ["8", 0]
    },
    "class_type": "SaveImage"
  }
}

print("🚀 Submitting Dental Background prompt to ComfyUI (10.135.66.70:8188)...")
req_data = json.dumps({"prompt": prompt, "client_id": "psu-ava-bg-gen"}).encode('utf-8')
req = urllib.request.Request(f"{COMFY_HOST}/prompt", data=req_data, headers={"Content-Type": "application/json"})
res = urllib.request.urlopen(req)
submit_res = json.loads(res.read())
prompt_id = submit_res["prompt_id"]
print("Prompt ID:", prompt_id)

# Poll for completion
for _ in range(40):
    time.sleep(1.5)
    hist_req = urllib.request.urlopen(f"{COMFY_HOST}/history/{prompt_id}")
    hist = json.loads(hist_req.read())
    if prompt_id in hist:
        outputs = hist[prompt_id].get("outputs", {})
        if "9" in outputs:
            img_info = outputs["9"]["images"][0]
            filename = img_info["filename"]
            subfolder = img_info.get("subfolder", "")
            img_url = f"{COMFY_HOST}/view?filename={filename}&subfolder={subfolder}&type=output"
            print(f"✅ Generated image: {filename}, downloading...")
            local_bg = os.path.join(CACHE_DIR, "comfy_dental_bg.png")
            urllib.request.urlretrieve(img_url, local_bg)
            print(f"🎉 Saved to: {local_bg}")
            break
