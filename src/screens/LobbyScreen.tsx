import { useEffect, useRef, useState } from "react";
import {
  type NakamaSession,
  type PlayerStats,
  type LeaderboardEntry,
  createSocket,
  getAccount,
  getPlayerStats,
  getLeaderboard,
} from "../lib/nakama";
import { useNakama } from "../context/NakamaContext";
import "./LobbyScreen.css";

interface Props {
  session: NakamaSession;
  onMatch: (matchId: string) => void;
  onLogout: () => void;
}

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function LeaderboardPanel({ entries, myRank, myUserId }: {
  entries: LeaderboardEntry[];
  myRank: number;
  myUserId: string;
}) {
  return (
    <div className="lb-panel">
      <div className="lb-header-row">
        <span className="lb-col-rank">#</span>
        <span className="lb-col-name">Player</span>
        <span className="lb-col-num">W</span>
        <span className="lb-col-num">L</span>
        <span className="lb-col-num">🔥</span>
      </div>
      {entries.map((e) => {
        const isMe = e.user_id === myUserId;
        return (
          <div key={e.user_id} className={`lb-row${isMe ? " lb-row-me" : ""}`}>
            <span className="lb-col-rank">
              {RANK_MEDAL[e.rank] ?? e.rank}
            </span>
            <span className="lb-col-name lb-name-text" title={e.username}>
              {e.username}
              {isMe && <span className="lb-you-tag">you</span>}
            </span>
            <span className="lb-col-num lb-wins">{e.wins}</span>
            <span className="lb-col-num lb-losses">{e.losses}</span>
            <span className="lb-col-num lb-streak">{e.current_streak}</span>
          </div>
        );
      })}

      {/* Show caller's rank if outside top 10 */}
      {myRank > 10 && (
        <div className="lb-my-rank-footer">
          Your rank: <strong>#{myRank}</strong>
        </div>
      )}
    </div>
  );
}

export default function LobbyScreen({ session, onMatch, onLogout }: Props) {
  const { socketRef, matchQueueRef } = useNakama();

  const [username, setUsername]       = useState("");
  const [stats, setStats]             = useState<PlayerStats | null>(null);
  const [searching, setSearching]     = useState(false);
  const [error, setError]             = useState("");
  const [showLb, setShowLb]           = useState(false);
  const [lbEntries, setLbEntries]     = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank]           = useState(0);
  const [lbLoading, setLbLoading]     = useState(false);
  const [lbError, setLbError]         = useState("");

  const ticketRef   = useRef<string | null>(null);
  const ownsSocket  = useRef(false);

  useEffect(() => {
    Promise.all([
      getAccount(session),
      getPlayerStats(session),
    ]).then(([account, playerStats]) => {
      setUsername(account.user?.display_name || account.user?.username || "");
      setStats(playerStats);
    }).catch(() => {});

    return () => {
      if (ownsSocket.current) {
        socketRef.current?.disconnect(false);
        socketRef.current = null;
        ownsSocket.current = false;
      }
    };
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggleLeaderboard() {
    if (showLb) { setShowLb(false); return; }

    setShowLb(true);
    setLbError("");
    setLbLoading(true);
    try {
      const data = await getLeaderboard(session);
      setLbEntries(data.top_ten ?? []);
      setMyRank(data.my_rank ?? 0);
    } catch {
      setLbError("Failed to load leaderboard.");
    } finally {
      setLbLoading(false);
    }
  }

  async function handleFindMatch() {
    setError("");
    setSearching(true);

    const socket = createSocket();
    socketRef.current = socket;
    ownsSocket.current = true;

    socket.onmatchmakermatched = async (matched) => {
      try {
        matchQueueRef.current = [];
        socket.onmatchdata = (data) => { matchQueueRef.current.push(data); };

        const match = await socket.joinMatch(matched.match_id, matched.token);
        ticketRef.current = null;
        ownsSocket.current = false;
        onMatch(match.match_id);
      } catch (err) {
        ownsSocket.current = false;
        socketRef.current = null;
        socket.disconnect(false);
        setSearching(false);
        setError(err instanceof Error ? err.message : "Failed to join match.");
      }
    };

    socket.ondisconnect = () => {
      if (!ownsSocket.current) return;
      ownsSocket.current = false;
      socketRef.current = null;
      setSearching(false);
      setError("Disconnected. Try again.");
    };

    try {
      await socket.connect(session, true);
      const { ticket } = await socket.addMatchmaker("*", 2, 2);
      ticketRef.current = ticket;
    } catch (err) {
      ownsSocket.current = false;
      socketRef.current = null;
      socket.disconnect(false);
      setSearching(false);
      setError(err instanceof Error ? err.message : "Failed to find match.");
    }
  }

  async function handleCancel() {
    const ticket = ticketRef.current;
    const socket = socketRef.current;

    ticketRef.current = null;
    ownsSocket.current = false;
    socketRef.current = null;

    if (socket && ticket) {
      try { await socket.removeMatchmaker(ticket); } catch { /* best effort */ }
    }
    socket?.disconnect(false);
    setSearching(false);
    setError("");
  }

  function handleLogout() {
    handleCancel();
    onLogout();
  }

  return (
    <div className="lobby-wrapper">
      <div className="lobby-card">
        <div className="lobby-logo">
          <span className="lobby-logo-x">X</span>
          <span className="lobby-logo-o">O</span>
        </div>

        <div className="lobby-header">
          <div>
            <h1 className="lobby-title">Tic-Tac-Toe</h1>
            {username && <p className="lobby-username">Hey, {username}!</p>}
          </div>
          <button className="lobby-logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>

        {stats && (
          <>
            <div className="lobby-stats">
              <div className="lobby-stat">
                <span className="lobby-stat-value lobby-stat-win">{stats.wins}</span>
                <span className="lobby-stat-label">Wins</span>
              </div>
              <div className="lobby-stat-divider" />
              <div className="lobby-stat">
                <span className="lobby-stat-value lobby-stat-loss">{stats.losses}</span>
                <span className="lobby-stat-label">Losses</span>
              </div>
              <div className="lobby-stat-divider" />
              <div className="lobby-stat">
                <span className="lobby-stat-value">{stats.draws}</span>
                <span className="lobby-stat-label">Draws</span>
              </div>
            </div>

            <div className="lobby-streaks">
              <div className="lobby-streak">
                <span className="lobby-streak-fire">🔥</span>
                <span className="lobby-streak-num">{stats.current_streak}</span>
                <span className="lobby-streak-label">Current streak</span>
              </div>
              <div className="lobby-streak-divider" />
              <div className="lobby-streak">
                <span className="lobby-streak-fire">🏆</span>
                <span className="lobby-streak-num lobby-streak-num-best">{stats.best_streak}</span>
                <span className="lobby-streak-label">Best streak</span>
              </div>
            </div>
          </>
        )}

        {/* Leaderboard toggle */}
        <button className="lobby-lb-btn" onClick={handleToggleLeaderboard}>
          {showLb ? "Hide Leaderboard" : "🏅 Global Leaderboard"}
        </button>

        {showLb && (
          <div className="lb-wrapper">
            {lbLoading && <p className="lb-loading">Loading…</p>}
            {lbError  && <p className="lb-err">{lbError}</p>}
            {!lbLoading && !lbError && (
              <LeaderboardPanel
                entries={lbEntries}
                myRank={myRank}
                myUserId={session.user_id ?? ""}
              />
            )}
          </div>
        )}

        {searching ? (
          <div className="lobby-searching">
            <div className="lobby-dots">
              <span /><span /><span />
            </div>
            <p className="lobby-waiting-text">Waiting for opponent…</p>
            <button className="lobby-cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        ) : (
          <>
            {error && <p className="lobby-error">{error}</p>}
            <button className="lobby-find-btn" onClick={handleFindMatch}>
              Find Match
            </button>
          </>
        )}
      </div>
    </div>
  );
}