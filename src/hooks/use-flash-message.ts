"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useFlashMessage<T = string>(defaultDuration = 4000) {
  const [message, setMessageState] = useState<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setMessageState(null);
  }, []);

  const show = useCallback(
    (msg: T | null, duration = defaultDuration) => {
      clear();
      if (msg === null) return;
      setMessageState(msg);
      if (duration > 0) {
        timerRef.current = setTimeout(() => {
          setMessageState(null);
          timerRef.current = null;
        }, duration);
      }
    },
    [defaultDuration, clear]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    message,
    show,
    clear,
    setMessage: show,
  };
}
