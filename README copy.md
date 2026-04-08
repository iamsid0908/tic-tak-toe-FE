# Multiplayer Tic-Tac-Toe — Nakama Backend

Go plugin backend for a real-time multiplayer Tic-Tac-Toe game built on [Nakama](https://heroiclabs.com/nakama/).

---

## Stack

| Layer | Technology |
|---|---|
| Game server | Nakama 3.38.0 |
| Plugin language | Go 1.26.1 |
| Database | PostgreSQL 16 |
| Real-time | WebSocket (built into Nakama) |

---

## Running Locally

### Prerequisites
- Docker + Docker Compose

### Start the server

```bash
docker compose up -d
```

This will:
1. Build the Go plugin using `nakama-pluginbuilder`
2. Start PostgreSQL
3. Start Nakama (loads the plugin automatically)

| Port | Purpose |
|---|---|
| `7350` | HTTP REST API |
| `7349` | WebSocket (real-time) |
| `7351` | Admin console (browser) |

Admin console login: `http://localhost:7351` → `admin` / `password`

### Rebuild after code changes

```bash
docker compose run --rm plugin-builder
docker compose restart nakama
```

---

## Board Layout

```
 0 | 1 | 2
-----------
 3 | 4 | 5
-----------
 6 | 7 | 8
```

Positions 0–8 are used when sending moves.

---

## API Reference

### Base URL
```
http://localhost:7350
```

### Auth Header (all requests except authenticate)
```
Authorization: Bearer <token>
```

The `token` is returned from the authenticate endpoint.

---

## 1. Register / Login

**Endpoint**
```
POST /v2/account/authenticate/email?create=true
```

Use `create=true` to register a new account. Use `create=false` to login to an existing one.

**Headers**
```
Authorization: Basic base64("defaultkey:")
Content-Type: application/json
```

The basic auth value for `defaultkey:` is always:
```
Authorization: Basic ZGVmYXVsdGtleTo=
```

**Request Body**
```json
{
  "email": "player@example.com",
  "password": "yourpassword"
}
```

**Response**
```json
{
  "token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "created": true
}
```

| Field | Description |
|---|---|
| `token` | Session token — use this in all future requests |
| `refresh_token` | Use to get a new token when the current one expires |
| `created` | `true` if new account was created, `false` if existing login |

**Token expiry:** 2 hours (configured in docker-compose)

---

## 2. Refresh Token

**Endpoint**
```
POST /v2/account/authenticate/refresh
```

**Headers**
```
Content-Type: application/json
```

**Request Body**
```json
{
  "refresh_token": "eyJhbGci..."
}
```

**Response** — same as authenticate response with new `token` and `refresh_token`.

---

## 3. Get My Account

**Endpoint**
```
GET /v2/account
```

**Response**
```json
{
  "user": {
    "id": "5b0bfe42-7ffc-4095-a9d1-60a61d1a8b3b",
    "username": "player1",
    "display_name": "",
    "avatar_url": "",
    "create_time": "2026-04-05T10:00:00Z",
    "update_time": "2026-04-05T10:00:00Z"
  },
  "email": "player@example.com"
}
```

---

## 4. Get Player Stats (Wins / Losses / Draws)

**Endpoint**
```
GET /v2/storage/player_stats
```

**Response**
```json
{
  "objects": [
    {
      "collection": "player_stats",
      "key": "stats",
      "user_id": "5b0bfe42-7ffc-4095-a9d1-60a61d1a8b3b",
      "value": {
        "wins": 3,
        "losses": 1,
        "draws": 0
      },
      "version": "abc123",
      "permission_read": 1,
      "permission_write": 0,
      "create_time": "2026-04-05T10:00:00Z",
      "update_time": "2026-04-05T12:00:00Z"
    }
  ]
}
```

Stats are automatically initialized to `{wins:0, losses:0, draws:0}` on first register and updated after every game.

---

## 5. Join Matchmaker (Find a Game)

This adds the player to Nakama's matchmaker queue. When 2 players are in the queue, they are automatically paired.

**Endpoint**
```
POST /v2/matchmaker
```

**Request Body**
```json
{
  "min_count": 2,
  "max_count": 2
}
```

**Response**
```json
{
  "ticket": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

The `ticket` is used to cancel the search if needed. The actual `match_id` arrives via WebSocket event — see WebSocket section below.

---

## 6. Cancel Matchmaking

**Endpoint**
```
DELETE /v2/matchmaker/<ticket>
```

No body required. Returns `200 OK` on success.

---

## WebSocket — Real-Time Game

All game actions (joining a match, sending moves, receiving board updates) happen over WebSocket.

### Connect

```
ws://localhost:7350/ws?token=<token>&status=true
```

Use the `token` from the authenticate response.

---

### WebSocket Message Format

All messages sent and received follow this Nakama envelope format:

**Sending (client → server):**
```json
{
  "match_data_send": {
    "match_id": "<match_id>",
    "op_code": 1,
    "data": "<base64 encoded JSON>"
  }
}
```

**Receiving (server → client):**
```json
{
  "match_data": {
    "match_id": "<match_id>",
    "op_code": 2,
    "data": "<base64 encoded JSON>",
    "presence": {
      "user_id": "<sender_user_id>",
      "username": "<username>"
    }
  }
}
```

The `data` field is always **base64 encoded JSON**. Decode it to get the actual payload.

---

### Op Codes

| Op Code | Direction | Meaning |
|---|---|---|
| `1` | Client → Server | Player sends a move |
| `2` | Server → Clients | Current board state |
| `3` | Server → Clients | Game over |

---

### Event: Matchmaker Matched

Received automatically when Nakama pairs 2 players.

```json
{
  "matchmaker_matched": {
    "match_id": "be7ec024-9eb7-46ec-bb2a-a248a47d51ef.nakama1",
    "ticket": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "users": [
      { "presence": { "user_id": "...", "username": "player1" } },
      { "presence": { "user_id": "...", "username": "player2" } }
    ]
  }
}
```

After receiving this, **immediately join the match**:

```json
{
  "match_join": {
    "match_id": "be7ec024-9eb7-46ec-bb2a-a248a47d51ef.nakama1"
  }
}
```

---

### Event: Game State (Op Code 2)

Received after joining the match and after every valid move.

Decoded `data`:
```json
{
  "Board": ["X", "", "", "", "O", "", "", "", ""],
  "PlayerX": "5b0bfe42-7ffc-4095-a9d1-60a61d1a8b3b",
  "PlayerO": "9c1cff53-8ggd-5106-b0e2-71b72e2b9c4c",
  "CurrentTurn": "X",
  "Status": "playing",
  "Winner": "",
  "LoserID": "",
  "TurnStarted": "2026-04-05T12:00:00Z"
}
```

| Field | Values | Description |
|---|---|---|
| `Board` | Array of 9 strings | Each cell: `"X"`, `"O"`, or `""` |
| `PlayerX` | user ID | Who is playing as X |
| `PlayerO` | user ID | Who is playing as O |
| `CurrentTurn` | `"X"` or `"O"` | Whose turn it is |
| `Status` | `"waiting"` `"playing"` `"done"` | Match status |
| `Winner` | `"X"` `"O"` `"draw"` `""` | Set when game ends |
| `TurnStarted` | timestamp | When current turn started — use for 30s countdown |

---

### Sending a Move (Op Code 1)

Encode this JSON to base64 and send as `data`:
```json
{
  "position": 4
}
```

Position is 0–8 (see board layout above). Position 4 is the center cell.

Full WebSocket message:
```json
{
  "match_data_send": {
    "match_id": "<match_id>",
    "op_code": 1,
    "data": "eyJwb3NpdGlvbiI6NH0="
  }
}
```

`eyJwb3NpdGlvbiI6NH0=` is base64 of `{"position":4}`.

Invalid moves (wrong turn, cell taken, out of bounds) are silently ignored by the server — the board state is not updated.

---

### Event: Game Over (Op Code 3)

Received when the game ends for any reason.

Decoded `data`:
```json
{
  "winner": "X",
  "loser_id": "9c1cff53-8ggd-5106-b0e2-71b72e2b9c4c",
  "reason": "move"
}
```

| Field | Values | Description |
|---|---|---|
| `winner` | `"X"` `"O"` `"draw"` | Who won |
| `loser_id` | user ID or `""` | User ID of the loser (empty on draw) |
| `reason` | `"move"` `"draw"` `"timeout"` `"disconnect"` `"server_shutdown"` | Why the game ended |

---

## React Implementation Steps

### Step 1 — Install Nakama JS SDK

```bash
npm install @heroiclabs/nakama-js
```

### Step 2 — Create Nakama client

```js
import { Client } from "@heroiclabs/nakama-js";

const client = new Client("defaultkey", "localhost", "7350", false);
// false = use HTTP not HTTPS (for local dev)
```

### Step 3 — Auth (Register / Login)

```js
// Register (create=true) or Login (create=false)
const session = await client.authenticateEmail(email, password, true);

// Save session
localStorage.setItem("nakama_token", session.token);
localStorage.setItem("nakama_refresh_token", session.refresh_token);
```

### Step 4 — Restore session on page reload

```js
const token = localStorage.getItem("nakama_token");
const refreshToken = localStorage.getItem("nakama_refresh_token");

let session = Session.restore(token, refreshToken);

// If expired, refresh it
if (session.isexpired(Date.now() / 1000)) {
  session = await client.sessionRefresh(session);
}
```

### Step 5 — Connect WebSocket

```js
const socket = client.createSocket(false, false);
await socket.connect(session, true);
```

### Step 6 — Join Matchmaker

```js
const ticket = await socket.addMatchmaker("*", 2, 2);
// Save ticket.ticket if you want to allow cancellation
```

### Step 7 — Listen for match found

```js
socket.onmatchmakermatched = async (matched) => {
  const matchId = matched.match_id;
  
  // Join the match
  await socket.joinMatch(matchId);
  
  // Save match ID in state
  setMatchId(matchId);
};
```

### Step 8 — Listen for game state updates

```js
socket.onmatchdata = (data) => {
  // Decode base64 data
  const decoded = JSON.parse(atob(data.data));

  if (data.op_code === 2) {
    // Game state update
    setBoard(decoded.Board);
    setCurrentTurn(decoded.CurrentTurn);
    setPlayerX(decoded.PlayerX);
    setPlayerO(decoded.PlayerO);
    setTurnStarted(new Date(decoded.TurnStarted));
  }

  if (data.op_code === 3) {
    // Game over
    setWinner(decoded.winner);
    setGameOverReason(decoded.reason);
  }
};
```

### Step 9 — Send a move

```js
const sendMove = async (position) => {
  const payload = JSON.stringify({ position });
  const encoded = btoa(payload); // base64 encode

  await socket.sendMatchState(matchId, 1, encoded);
};
```

### Step 10 — 30 second countdown timer

```js
// In a useEffect, recalculate every second
useEffect(() => {
  const interval = setInterval(() => {
    if (!turnStarted) return;
    const elapsed = (Date.now() - turnStarted.getTime()) / 1000;
    const remaining = Math.max(0, 30 - elapsed);
    setTimeLeft(Math.floor(remaining));
  }, 1000);

  return () => clearInterval(interval);
}, [turnStarted]);
```

### Step 11 — Get player stats

```js
const getStats = async () => {
  const objects = await client.readStorageObjects(session, {
    object_ids: [{
      collection: "player_stats",
      key: "stats",
      user_id: session.user_id
    }]
  });

  const stats = objects.objects[0]?.value;
  // { wins: 3, losses: 1, draws: 0 }
};
```

---

## Game Flow Summary

```
1. Register / Login          → GET token
2. Connect WebSocket         → persistent connection
3. Add to Matchmaker         → wait for opponent
4. Receive matchmaker_matched → auto-paired with opponent
5. Join Match                → receive initial board state (op 2)
6. Send moves (op 1)         → server validates and broadcasts new state (op 2)
7. Receive game over (op 3)  → show winner, update stats
8. GET /v2/storage/player_stats → display updated win/loss/draw counts
```

---

## Error Codes

| Code | Meaning |
|---|---|
| `3` | Invalid argument (bad request body) |
| `5` | Not found |
| `13` | Internal server error |
| `16` | Unauthenticated (missing or invalid token) |