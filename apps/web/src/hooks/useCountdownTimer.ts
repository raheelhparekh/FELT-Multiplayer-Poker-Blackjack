import { useEffect, useRef, useState } from "react";
import { soundEngine } from "../audio/sound-engine";

export interface UseCountdownTimerOptions {
  deadline: number | null | undefined;
  isPaused?: boolean | undefined;
  pausedRemainingMs?: number | null | undefined;
  totalDurationSec?: number | undefined;
  playTickAudio?: boolean | undefined;
  resetKey?: string | number | undefined;
}

export interface CountdownTimerResult {
  seconds: number | null;
  fraction: number;
  isUrgent: boolean;
  isExpired: boolean;
  isPaused: boolean;
  formatted: string;
}

/**
 * High-precision countdown timer hook for live casino game deadlines.
 * Reactively ticks down with sub-second accuracy, handles server-side pauses,
 * and plays audio/visual urgency indicators without drift.
 */
export function useCountdownTimer({
  deadline,
  isPaused = false,
  pausedRemainingMs = null,
  totalDurationSec = 30,
  playTickAudio = false,
  resetKey,
}: UseCountdownTimerOptions): CountdownTimerResult {
  const [remainingMs, setRemainingMs] = useState<number | null>(() => {
    if (isPaused && pausedRemainingMs !== null) {
      return Math.max(0, pausedRemainingMs);
    }
    if (deadline) {
      return Math.max(0, deadline - Date.now());
    }
    return null;
  });

  const lastTickedSecondRef = useRef<number | null>(null);

  useEffect(() => {
    lastTickedSecondRef.current = null;

    if (isPaused) {
      if (pausedRemainingMs !== null) {
        setRemainingMs(Math.max(0, pausedRemainingMs));
      }
      return;
    }

    if (!deadline) {
      setRemainingMs(null);
      return;
    }

    const compute = () => {
      const now = Date.now();
      const diff = Math.max(0, deadline - now);
      setRemainingMs(diff);

      const sec = Math.ceil(diff / 1000);
      if (playTickAudio && sec <= 5 && sec > 0 && lastTickedSecondRef.current !== sec) {
        lastTickedSecondRef.current = sec;
        soundEngine.play("timer_tick");
      }
    };

    // Calculate immediately on deadline or phase change
    compute();

    // Check every 100ms for responsive tick down
    const interval = setInterval(compute, 100);

    return () => {
      clearInterval(interval);
    };
  }, [deadline, isPaused, pausedRemainingMs, playTickAudio, resetKey]);

  if (remainingMs === null) {
    return {
      seconds: null,
      fraction: 0,
      isUrgent: false,
      isExpired: false,
      isPaused,
      formatted: "--",
    };
  }

  const seconds = Math.ceil(remainingMs / 1000);
  const totalMs = (totalDurationSec || 30) * 1000;
  const fraction = Math.min(1, Math.max(0, remainingMs / totalMs));
  const isUrgent = seconds <= 5 && seconds > 0;
  const isExpired = seconds === 0;

  return {
    seconds,
    fraction,
    isUrgent,
    isExpired,
    isPaused,
    formatted: `${seconds}s`,
  };
}
