import { createContext, useContext, useRef } from "react";
import type { Session, Socket } from "@heroiclabs/nakama-js";

interface NakamaContextValue {
  socketRef:     React.RefObject<Socket   | null>;
  sessionRef:    React.RefObject<Session  | null>;
  // Buffer for match data that arrives before GameScreen mounts its handler
  matchQueueRef: React.RefObject<any[]>;
}

const NakamaContext = createContext<NakamaContextValue | null>(null);

export function NakamaProvider({ children }: { children: React.ReactNode }) {
  const socketRef     = useRef<Socket   | null>(null);
  const sessionRef    = useRef<Session  | null>(null);
  const matchQueueRef = useRef<any[]>([]);
  return (
    <NakamaContext.Provider value={{ socketRef, sessionRef, matchQueueRef }}>
      {children}
    </NakamaContext.Provider>
  );
}


export function useNakama() {
  const ctx = useContext(NakamaContext);
  if (!ctx) throw new Error("useNakama must be used within NakamaProvider");
  return ctx;
}