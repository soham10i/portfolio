import subprocess
import os

def process_video_rife(input_path: str, output_path: str, target_fps: int = 60) -> bool:
    """
    Interpolate a video to 60fps.
    Uses ffmpeg's minterpolate with Motion Compensated Interpolation (MCI),
    which uses optical flow predictive modeling to generate intermediate frames.
    """
    if not os.path.exists(input_path):
        return False
        
    # We use ffmpeg's minterpolate filter.
    # mi_mode=mci is Motion Compensated Interpolation (Optical Flow)
    # mc_mode=aobmc is Advanced Overlapped Block Motion Compensation
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-vf", f"minterpolate=fps={target_fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
        "-c:v", "libx264",
        "-c:a", "aac",
        output_path
    ]
    
    try:
        print(f"Running interpolation (this may take a while)...")
        subprocess.run(ffmpeg_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg interpolation error: {e}")
        return False
