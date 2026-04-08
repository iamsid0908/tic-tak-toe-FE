import { useEffect, useRef, useState } from "react";
import { type GameOver, nakamaClient, getAccount } from "../lib/nakama";
import { useNakama } from "../context/NakamaContext";
import "./GameScreen.css";

interface Props {
  matchId: string;
  onLeave: () => void;
}

const OP_GAME_STATE  = 2;
const OP_GAME_OVER   = 3;
const TURN_LIMIT_SEC = 30;

interface PlayerInfo {
  name: string;
  userId: string;
}

const AVATAR_PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899",
  "#f59e0b", "#10b981", "#3b82f6",
  "#ef4444", "#14b8a6",
];

function playerColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash + userId.charCodeAt(i)) % AVATAR_PALETTE.length;
  }
  return AVATAR_PALETTE[hash];
}

function PlayerAvatar({ name, userId }: { name: string; userId: string }) {
  const initial = (name || "?")[0].toUpperCase();
  return (
    <div className="player-avatar" style={{ background: playerColor(userId) }}>
      {initial}
    </div>
  );
}

// Circular countdown ring — radius 18, so circumference ≈ 113
const RADIUS = 18;
const CIRC   = 2 * Math.PI * RADIUS;

function TurnTimer({ seconds }: { seconds: number }) {
  const clamped  = Math.max(0, Math.min(TURN_LIMIT_SEC, seconds));
  const progress = clamped / TURN_LIMIT_SEC;          // 1 → full, 0 → empty
  const dash     = progress * CIRC;
  const urgent   = clamped <= 10;
  const color    = clamped <= 5 ? "#ef4444" : clamped <= 10 ? "#f59e0b" : "var(--accent)";

  return (
    <div className="turn-timer" aria-label={`${clamped} seconds remaining`}>
      <svg width="44" height="44" viewBox="0 0 44 44">
        {/* Track */}
        <circle
          cx="22" cy="22" r={RADIUS}
          fill="none"
          stroke="var(--border)"
          strokeWidth="3"
        />
        {/* Progress arc — starts at 12 o'clock */}
        <circle
          cx="22" cy="22" r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRC}`}
          strokeDashoffset={0}
          transform="rotate(-90 22 22)"
          style={{ transition: "stroke-dasharray 0.4s linear, stroke 0.3s" }}
        />
      </svg>
      <span
        className="turn-timer-label"
        style={{ color, fontWeight: urgent ? 700 : 500 }}
      >
        {clamped}
      </span>
    </div>
  );
}

export default function GameScreen({ matchId, onLeave }: Props) {
  const { socketRef, sessionRef, matchQueueRef } = useNakama();

  const [board, setBoard]               = useState<string[]>(Array(9).fill(""));
  const [myMark, setMyMark]             = useState<"X" | "O" | "">("");
  const [currentTurn, setCurrentTurn]   = useState<"X" | "O">("X");
  const [gameOver, setGameOver]         = useState<GameOver | null>(null);
  const [error, setError]               = useState("");
  const [turnStarted, setTurnStarted]   = useState<number>(() => Date.now());
  const [timeLeft, setTimeLeft]         = useState(TURN_LIMIT_SEC);

  const [myInfo, setMyInfo]             = useState<PlayerInfo | null>(null);
  const [opponentInfo, setOpponentInfo] = useState<PlayerInfo | null>(null);
  const playersFetchedRef               = useRef(false);

  // ── Countdown interval ───────────────────────────────────────────────────
  useEffect(() => {
    if (gameOver) return;

    const id = setInterval(() => {
      const elapsed = (Date.now() - turnStarted) / 1000;
      setTimeLeft(Math.max(0, Math.round(TURN_LIMIT_SEC - elapsed)));
    }, 500);

    return () => clearInterval(id);
  }, [turnStarted, gameOver]);

  // ── Socket handler ───────────────────────────────────────────────────────
  useEffect(() => {
    const s = socketRef.current!;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function handleMatchData(data: any) {
      const raw     = typeof data.data === "string"
        ? atob(data.data)
        : new TextDecoder().decode(data.data);
      const decoded = JSON.parse(raw);

      if (data.op_code === OP_GAME_STATE) {
        setBoard(decoded.Board);
        setCurrentTurn(decoded.CurrentTurn);

        // Reset the timer whenever the turn changes
        const started = decoded.TurnStarted
          ? new Date(decoded.TurnStarted).getTime()
          : Date.now();
        setTurnStarted(started);
        setTimeLeft(Math.max(0, Math.round(TURN_LIMIT_SEC - (Date.now() - started) / 1000)));

        const uid = sessionRef.current?.user_id;
        if (uid) {
          setMyMark(decoded.PlayerX === uid ? "X" : "O");
        }

        if (!playersFetchedRef.current && uid) {
          playersFetchedRef.current = true;
          const opId: string = decoded.PlayerX === uid ? decoded.PlayerO : decoded.PlayerX;
          const session = sessionRef.current!;

          getAccount(session)
            .then((acct) => {
              const name = acct.user?.display_name || acct.user?.username || uid;
              setMyInfo({ name, userId: uid });
            })
            .catch(() => setMyInfo({ name: uid, userId: uid }));

          nakamaClient.getUsers(session, [opId])
            .then((res) => {
              const u    = res.users?.[0];
              const name = u?.display_name || u?.username || "Opponent";
              setOpponentInfo({ name, userId: opId });
            })
            .catch(() => setOpponentInfo({ name: "Opponent", userId: opId }));
        }
      }

      if (data.op_code === OP_GAME_OVER) {
        setGameOver(decoded as GameOver);
      }
    }

    for (const data of matchQueueRef.current) {
      handleMatchData(data);
    }
    matchQueueRef.current = [];

    s.onmatchdata  = handleMatchData;
    s.ondisconnect = () => { setError("Disconnected from server."); };

    return () => {
      s.onmatchdata  = () => {};
      s.ondisconnect = () => {};
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCellClick(position: number) {
    if (myMark === "" || currentTurn !== myMark) return;
    if (board[position] !== "") return;
    if (gameOver) return;

    const s = socketRef.current;
    if (!s) return;

    s.sendMatchState(matchId, 1, JSON.stringify({ position })).catch(() => {});
  }

  function handleLeave() {
    const s = socketRef.current;
    if (s) {
      s.onmatchdata  = () => {};
      s.ondisconnect = () => {};
      s.disconnect(false);
    }
    socketRef.current = null;
    onLeave();
  }

  // ── Result ───────────────────────────────────────────────────────────────

  let resultText  = "";
  let resultStyle = "";
  if (gameOver) {
    if (gameOver.winner === "draw")        { resultText = "Draw.";     resultStyle = "";                 }
    else if (gameOver.winner === myMark)   { resultText = "You win!";  resultStyle = "game-result-win";  }
    else                                   { resultText = "You lose."; resultStyle = "game-result-lose"; }
  }

  const isMyTurn     = !gameOver && myMark !== "" && currentTurn === myMark;
  const opponentMark = myMark === "X" ? "O" : myMark === "O" ? "X" : "";
  const myUserId     = myInfo?.userId ?? "";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="game-wrapper">
      <div className="game-card">

        <div className="game-header">
          <div className="game-logo">
            <span className="game-logo-x">X</span>
            <span className="game-logo-o">O</span>
          </div>
          <button className="game-leave-btn" onClick={handleLeave}>
            Leave
          </button>
        </div>

        {error && <p className="game-error">{error}</p>}

        {myMark && (
          <div className="game-players">
            <div className={`game-player${isMyTurn ? " game-player-active" : ""}`}>
              <PlayerAvatar name={myInfo?.name ?? myUserId} userId={myUserId} />
              <div className="game-player-details">
                <span className={`game-player-mark game-sym-${myMark.toLowerCase()}`}>
                  {myMark}
                </span>
                <span className="game-player-label">You</span>
                <span className="game-player-name" title={myInfo?.name}>
                  {myInfo?.name ?? "…"}
                </span>
              </div>
            </div>

            <div className="game-vs-badge">VS</div>

            <div className={`game-player game-player-right${!isMyTurn && !gameOver ? " game-player-active" : ""}`}>
              <div className="game-player-details game-player-details-right">
                <span className={`game-player-mark game-sym-${opponentMark.toLowerCase()}`}>
                  {opponentMark}
                </span>
                <span className="game-player-label">Opponent</span>
                <span className="game-player-name" title={opponentInfo?.name}>
                  {opponentInfo?.name ?? "…"}
                </span>
              </div>
              <PlayerAvatar
                name={opponentInfo?.name ?? "?"}
                userId={opponentInfo?.userId ?? ""}
              />
            </div>
          </div>
        )}

        {gameOver && (
          <div className={`game-result ${resultStyle}`}>
            {resultText}
          </div>
        )}

        <div className="game-board">
          {board.map((cell, i) => {
            const clickable = !cell && isMyTurn;
            return (
              <button
                key={i}
                className={[
                  "game-cell",
                  cell      ? `game-cell-${cell.toLowerCase()}` : "",
                  clickable ? "game-cell-clickable"             : "",
                ].join(" ").trim()}
                onClick={() => handleCellClick(i)}
                disabled={!clickable}
                aria-label={cell || `cell ${i + 1}`}
              >
                {cell}
              </button>
            );
          })}
        </div>

        {!gameOver && myMark !== "" && (
          <div className="game-footer">
            <p className={`game-turn ${isMyTurn ? "game-turn-mine" : ""}`}>
              {isMyTurn ? "Your turn" : "Opponent's turn"}
            </p>
            <TurnTimer seconds={timeLeft} />
          </div>
        )}

        {!gameOver && myMark === "" && (
          <p className="game-turn">Joining match…</p>
        )}

        {gameOver && (
          <button className="game-lobby-btn" onClick={handleLeave}>
            Back to Lobby
          </button>
        )}

      </div>
    </div>
  );
}