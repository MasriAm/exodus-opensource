"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Play, Pause, Maximize } from "lucide-react";

interface VideoPlayerProps {
  src: string;
  title: string;
  className?: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function VideoPlayer({ src, title, className }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => setDuration(video.duration);
    const onEnded = () => setIsPlaying(false);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("ended", onEnded);

    if (video.readyState >= 1) {
      setDuration(video.duration);
    }

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        videoRef.current.play();
      }
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !videoRef.current || duration === 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pos * duration;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerRef.current.requestFullscreen();
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div ref={containerRef} className={cn("bg-cream border-2 border-ink p-3 sm:p-4 shadow-panel flex flex-col gap-3 font-display w-full", className)}>
      <div className="flex justify-between text-[0.85rem] text-teal border-b border-dashed border-ink pb-2 uppercase font-bold">
        <span className="truncate mr-4" title={title}>{`>> VISUAL_REC: ${title}`}</span>
        <a href={src} download={title} className="shrink-0 hover:text-ink transition-colors underline decoration-dashed underline-offset-4 cursor-pointer">
          [ DOWNLOAD ]
        </a>
      </div>
      
      <div 
        className="border-2 border-ink bg-black relative aspect-[9/16] flex items-center justify-center overflow-hidden cursor-pointer"
        onClick={togglePlay}
      >
        <video 
          ref={videoRef} 
          src={src} 
          playsInline 
          preload="metadata"
          className="w-full h-full object-contain" 
        />
      </div>
      
      <div className="flex items-center gap-2 sm:gap-3 bg-paper p-2 border border-ink">
        <button
          type="button"
          onClick={togglePlay}
          className="bg-transparent text-ink border-none p-1 transition-colors hover:text-teal active:translate-y-[1px]"
        >
          {isPlaying ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5" fill="currentColor" />}
        </button>
        
        <div className="text-[0.8rem] font-bold text-ink min-w-[35px] sm:min-w-[40px] text-center">
          {formatTime(currentTime)}
        </div>
        
        <div
          ref={progressRef}
          onClick={handleProgressClick}
          className="flex-1 h-3 bg-ink/5 border border-ink relative cursor-pointer overflow-hidden"
        >
          <div
            className="h-full bg-body border-r-2 border-ink"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        
        <button
          type="button"
          onClick={toggleFullscreen}
          className="bg-transparent text-ink border-none p-1 transition-colors hover:text-teal active:translate-y-[1px] shrink-0"
        >
          <Maximize className="size-5" />
        </button>
      </div>
    </div>
  );
}
