"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Play, Pause } from "lucide-react";

interface AudioPlayerProps {
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

const SPEEDS = [1, 1.5, 2];

export function AudioPlayer({ src, title, className }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    // Initial check in case it's already loaded
    if (audio.readyState >= 1) {
      setDuration(audio.duration);
    }

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        audioRef.current.play();
      }
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !audioRef.current || duration === 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pos * duration;
  };

  const toggleSpeed = () => {
    const nextIndex = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(nextIndex);
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEEDS[nextIndex];
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn("bg-cream border-2 border-ink p-4 shadow-panel flex flex-col gap-3 font-display", className)}>
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      
      <div className="flex justify-between text-[0.85rem] text-teal border-b border-dashed border-ink pb-2 uppercase font-bold">
        <span className="truncate mr-4" title={title}>{`>> FILE: ${title}`}</span>
        <a href={src} download={title} className="shrink-0 hover:text-ink transition-colors underline decoration-dashed underline-offset-4 cursor-pointer">
          [ DOWNLOAD ]
        </a>
      </div>
      
      <div className="flex items-center gap-2 sm:gap-3">
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
          onClick={toggleSpeed}
          className="bg-transparent border border-ink text-ink px-2 py-1 text-[0.8rem] font-bold hover:bg-ink hover:text-cream transition-colors w-[45px] shrink-0"
        >
          {SPEEDS[speedIndex].toFixed(1)}x
        </button>
      </div>
    </div>
  );
}
