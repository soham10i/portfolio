#!/usr/bin/env bash
# Deploy a fine-tuned model to Vast.ai
# Usage: ./deploy-to-vastai.sh <model_path> [gpu_type]

set -e

MODEL_PATH="${1:-./models/qwen-7b-medqa-merged}"
GPU_TYPE="${2:-RTX 3090}"

echo "========================================"
echo "  Deploy to Vast.ai"
echo "  Model: $MODEL_PATH"
echo "  GPU: $GPU_TYPE"
echo "========================================"

if [ ! -d "$MODEL_PATH" ]; then
    echo "❌ Model path not found: $MODEL_PATH"
    exit 1
fi

# Check if vast.ai CLI is installed
if ! command -v vast &> /dev/null; then
    echo "Installing Vast.ai CLI..."
    pip install vastai
fi

echo ""
echo "Step 1: Search for available $GPU_TYPE instances..."
vast search offers "gpu_name='$GPU_TYPE'"

echo ""
echo "Step 2: Create instance (manual step)"
echo "Go to https://vast.ai and rent a $GPU_TYPE instance"
echo ""
read -p "Enter instance ID (or press Enter to skip auto-deploy): " INSTANCE_ID

if [ -z "$INSTANCE_ID" ]; then
    echo ""
    echo "Manual deployment steps:"
    echo "1. Rent GPU on vast.ai"
    echo "2. SSH into instance"
    echo "3. Run:"
    echo ""
    echo "   apt-get update && apt-get install -y git python3.11 python3-pip"
    echo "   pip install vllm transformers torch"
    echo "   vllm serve $MODEL_PATH --host 0.0.0.0 --port 8000"
    echo ""
    echo "4. Copy the public IP and set LLM_API_BASE in Render"
    exit 0
fi

echo ""
echo "Step 3: Deploying model to instance $INSTANCE_ID..."

# Upload model via SCP
INSTANCE_IP=$(vast show instance "$INSTANCE_ID" | grep "ssh_host" | awk '{print $2}')
INSTANCE_PORT=$(vast show instance "$INSTANCE_ID" | grep "ssh_port" | awk '{print $2}')

echo "Instance: $INSTANCE_IP:$INSTANCE_PORT"
echo "Uploading model..."

scp -P "$INSTANCE_PORT" -r "$MODEL_PATH" root@"$INSTANCE_IP":/opt/model

echo ""
echo "Step 4: Starting vLLM server..."

ssh -p "$INSTANCE_PORT" root@"$INSTANCE_IP" << 'EOF'
    apt-get update && apt-get install -y python3-pip
    pip install vllm transformers torch
    
    # Start vLLM in background
    nohup vllm serve /opt/model \
        --host 0.0.0.0 \
        --port 8000 \
        --dtype half \
        --max-model-len 4096 \
        --gpu-memory-utilization 0.9 \
        > /var/log/vllm.log 2>&1 &
    
    echo "vLLM started on port 8000"
    sleep 5
    curl -s http://localhost:8000/health
EOF

echo ""
echo "========================================"
echo "  Deployment Complete!"
echo "========================================"
echo ""
echo "API URL: http://$INSTANCE_IP:8000/v1/chat/completions"
echo ""
echo "Set in Render Dashboard:"
echo "  LLM_API_BASE=http://$INSTANCE_IP:8000/v1"
echo ""
