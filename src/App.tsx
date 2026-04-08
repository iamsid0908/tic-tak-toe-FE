import { useEffect, useState } from "react";
import { type NakamaSession, clearSession, restoreSession } from "./lib/nakama";
import { useNakama } from "./context/NakamaContext";
import AuthScreen from "./screens/AuthScreen";
import LobbyScreen from "./screens/LobbyScreen";
import GameScreen from "./screens/GameScreen";

function App() {
  const { sessionRef } = useNakama();
  const [session, setSession] = useState<NakamaSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [matchId, setMatchId] = useState<string | null>(null);

  useEffect(() => {
    restoreSession().then((s) => {
      sessionRef.current = s;
      setSession(s);
      setChecking(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) return null;

  if (!session) {
    return (
      <AuthScreen
        onAuth={(s) => {
          sessionRef.current = s;
          setSession(s);
        }}
      />
    );
  }

  if (matchId) {
    return (
      <GameScreen
        matchId={matchId}
        onLeave={() => setMatchId(null)}
      />
    );
  }

  return (
    <LobbyScreen
      session={session}
      onMatch={setMatchId}
      onLogout={() => {
        clearSession();
        sessionRef.current = null;
        setSession(null);
      }}
    />
  );
}

export default App;
