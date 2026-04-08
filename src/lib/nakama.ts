// ---------------------------------------------------------------------------
// Nakama client — uses @heroiclabs/nakama-js SDK
// REST: auth, account, storage  |  WebSocket: matchmaker, match, moves
// ---------------------------------------------------------------------------

import { Client, Session } from "@heroiclabs/nakama-js";

const HOST    = import.meta.env.VITE_NAKAMA_HOST  ?? "localhost";
const PORT    = import.meta.env.VITE_NAKAMA_PORT  ?? "7350";
const USE_SSL = import.meta.env.VITE_NAKAMA_USE_SSL === "true";
const SERVER_KEY = "defaultkey";

const TOKEN_KEY   = import.meta.env.VITE_NAKAMA_TOKEN_KEY;
const REFRESH_KEY = import.meta.env.VITE_NAKAMA_REFRESH_KEY;

export const nakamaClient = new Client(SERVER_KEY, HOST, PORT, USE_SSL);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Re-export the SDK Session as our session type — it carries .token,
// .refresh_token, .user_id, .isexpired(), etc.
export type NakamaSession = Session;

export interface PlayerStats {
  wins: number;
  losses: number;
  draws: number;
  current_streak: number;
  best_streak: number;
}

export interface GameState {
  Board: string[];           // 9 cells: "X" | "O" | ""
  PlayerX: string;           // user_id
  PlayerO: string;           // user_id
  CurrentTurn: "X" | "O";
  Status: "waiting" | "playing" | "done";
  Winner: "X" | "O" | "draw" | "";
  TurnStarted: string;       // ISO timestamp
}

export interface GameOver {
  winner: "X" | "O" | "draw";
  loser_id: string;
  reason: "move" | "draw" | "timeout" | "disconnect" | "server_shutdown";
}

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------

export function saveSession(session: Session): void {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(REFRESH_KEY, session.refresh_token);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export async function restoreSession(): Promise<Session | null> {
  const token        = localStorage.getItem(TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!token || !refreshToken) return null;

  let session = Session.restore(token, refreshToken);

  if (!session.isexpired(Date.now() / 1000)) return session;

  try {
    session = await nakamaClient.sessionRefresh(session);
    saveSession(session);
    return session;
  } catch {
    clearSession();
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth  (REST)
// ---------------------------------------------------------------------------

export function register(email: string, password: string): Promise<Session> {
  return nakamaClient.authenticateEmail(email, password, true);
}

export function login(email: string, password: string): Promise<Session> {
  return nakamaClient.authenticateEmail(email, password, false);
}

// ---------------------------------------------------------------------------
// Account  (REST)
// ---------------------------------------------------------------------------

export function getAccount(session: Session) {
  return nakamaClient.getAccount(session);
}

// ---------------------------------------------------------------------------
// Player stats  (SDK — readStorageObjects, respects OWNER_READ permission)
// ---------------------------------------------------------------------------

export async function getPlayerStats(session: Session): Promise<PlayerStats> {
  try {
    const result = await nakamaClient.readStorageObjects(session, {
      object_ids: [{ collection: "player_stats", key: "stats", user_id: session.user_id }],
    });
    const obj = result.objects?.[0];
    if (!obj) return { wins: 0, losses: 0, draws: 0, current_streak: 0, best_streak: 0 };
    // SDK may return value already parsed or as a JSON string
    const raw = obj.value as unknown;
    const stats: PlayerStats = typeof raw === "string" ? JSON.parse(raw) : raw as PlayerStats;
    return stats;
  } catch {
    return { wins: 0, losses: 0, draws: 0, current_streak: 0, best_streak: 0 };
  }
}

// ---------------------------------------------------------------------------
// Socket factory  (WebSocket via SDK)
// Matchmaker, match join/leave, and move sending all go through the socket.
// ---------------------------------------------------------------------------

export function createSocket() {
  return nakamaClient.createSocket(false, USE_SSL);
}

// ---------------------------------------------------------------------------
// Leaderboard  (RPC)
// ---------------------------------------------------------------------------

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  wins: number;
  losses: number;
  draws: number;
  current_streak: number;
  best_streak: number;
}

export interface LeaderboardResponse {
  top_ten: LeaderboardEntry[];
  my_rank: number;
}

export async function getLeaderboard(session: Session): Promise<LeaderboardResponse> {
  const res = await nakamaClient.rpc(session, "get_leaderboard", {});
  const payload = res.payload as unknown;
  const data: LeaderboardResponse = typeof payload === "string"
    ? JSON.parse(payload)
    : payload as LeaderboardResponse;
  return data;
}

// ---------------------------------------------------------------------------
// Move helpers  (used by GameScreen)
// ---------------------------------------------------------------------------

export function encodeMove(position: number): string {
  return JSON.stringify({ position });
}

export function decodeData<T>(data: string | Uint8Array): T {
  const text = typeof data === "string" ? data : new TextDecoder().decode(data);
  return JSON.parse(text) as T;
}
