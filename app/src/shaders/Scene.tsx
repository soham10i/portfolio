import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { GlassAiButton } from "@designcodeio/threeui";
import "@designcodeio/threeui/style.css";

export function Scene() {
  return (
    <div className="shader-frame relative">
      {/* Floating navigation and info banner */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between p-4 sm:p-6 pointer-events-none">
        <Link
          to="/#lab"
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-[13px] font-medium text-neutral-800 shadow-sm backdrop-blur-md transition-all hover:bg-white/90 hover:shadow"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Lab</span>
        </Link>

        <div className="pointer-events-auto hidden sm:flex items-center gap-2 rounded-full border border-black/10 bg-white/50 px-4 py-2 text-[12px] text-neutral-700 backdrop-blur-md">
          <Sparkles className="h-3.5 w-3.5 text-blue-600 animate-pulse" />
          <span>Click the button to trigger particle burst & launch Assistant</span>
        </div>
      </header>

      {/* Main 3D Canvas Button */}
      <GlassAiButton />
    </div>
  );
}

export default Scene;
