# Deployment & Operations Guide — Felt

This guide covers running **Felt** locally on your workstation, running the headless load test, and deploying to production on **Fly.io** (with Neon Postgres), **Railway**, or via **Docker**.

---

## 1. Quick Start (Running Locally on Your System)

Felt is architected with a dual-mode database service. If `DATABASE_URL` is omitted, the server automatically boots an **in-memory database**, allowing instant local play without running Postgres or Docker!

### Prerequisites
- **Node.js**: >= 22.0.0
- **pnpm**: >= 9.0.0

### Step-by-Step Local Run

1. **Clone & Install Dependencies**:
   ```bash
   pnpm install
   ```

2. **Configure Environment**:
   ```bash
   cp .env.example .env
   ```
   *(Optional: If you don't have Postgres running locally, you can comment out or remove `DATABASE_URL` in `.env` to use the built-in in-memory store!)*

3. **Start the Development Servers**:
   ```bash
   pnpm dev
   ```
   This command starts:
   - **Backend API & WebSocket Server** on `http://localhost:3001`
   - **Vite Web Client** on `http://localhost:5173` (with `/api` and `/socket.io` proxied to port 3001)

4. **Play**:
   - Open your browser to **`http://localhost:5173`**
   - Click **Create Table** (or join with the 6-character room code from your phone or an incognito tab!)
   - You can copy the invite link or QR-style code to connect multiple browser tabs or devices on the same local network.

---

## 2. Running Local Production Build

To test the unified production build (where Fastify directly serves the compiled web app and WebSockets on a single port):

```bash
# 1. Build all packages and web assets
pnpm build

# 2. Run the production server
pnpm --filter @felt/server start
```
Open **`http://localhost:3001`**. Both the web client, WebSocket engine, and API run unified on port 3001.

---

## 3. Running the 12-Client Headless Load Test

To stress-test server concurrency, real-time sync, and hidden-card data leak prevention with 12 headless players:

```bash
# In one terminal, ensure the server is running:
pnpm --filter @felt/server dev

# In another terminal, run the load test:
pnpm load-test
```

This spawns 12 concurrent Socket.IO clients (1 host, 1 dealer, 6 seated players, 4 spectators), joins a room, plays full betting and card rounds, verifies zero hole-card leaks with `scanForLeaks`, and completes settlement.

---

## 4. Production Deployment: Fly.io (Recommended)

Fly.io provides low-latency edge hosting with Docker containers and WebSocket support.

### Step 1: Install Flyctl & Log In
```bash
brew install flyctl
fly auth login
```

### Step 2: Create a Neon Postgres Database
1. Go to [neon.tech](https://neon.tech) and create a free PostgreSQL database.
2. Copy the connection string (`postgresql://username:password@ep-...neon.tech/neondb?sslmode=require`).

### Step 3: Launch Fly App
```bash
fly launch --no-deploy
```
- Select your region: choose **`bom` (Mumbai, India)** or **`sin` (Singapore)** for lowest latency to India/Southeast Asia.
- When prompted to set up a database, decline (we use Neon Postgres).

### Step 4: Configure Secrets
```bash
fly secrets set \
  DATABASE_URL="postgresql://username:password@ep-...neon.tech/neondb?sslmode=require" \
  JWT_SECRET="a-very-long-random-secret-string-here" \
  ALLOWED_ORIGINS="https://felt-blackjack.fly.dev"
```

### Step 5: Verify `fly.toml`
Ensure `fly.toml` has:
```toml
[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1
```
> **Important**: `auto_stop_machines = "off"` and `min_machines_running = 1` ensure that active live games aren't put to sleep mid-hand.

### Step 6: Deploy
```bash
fly deploy
```

Once deployed, visit `https://felt-blackjack.fly.dev/healthz` to verify health status.

---

## 5. Live Room Snapshots & Zero-Downtime Redeploys

Felt implements **SIGTERM room snapshots**:
1. When a redeploy is triggered, Fly.io sends a `SIGTERM` signal to the running container.
2. The server serializes all live room states (seats, stacks, active hands, bets, chat, and participants) into the `room_snapshots` table in PostgreSQL.
3. On reboot, the newly deployed container reads `room_snapshots` and restores active tables in memory.
4. Clients reconnect using their saved reconnect tokens and continue playing seamlessly.
5. When a session ends or the room is destroyed, the snapshot is deleted.

---

## 6. Alternative: Railway / Render / Self-Hosted Docker

### Docker Run
```bash
# Build the Docker image
docker build -t felt:latest .

# Run container
docker run -p 8080:8080 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="your-secret" \
  felt:latest
```

### Health Check Endpoint
- **URL**: `GET /healthz`
- **Response**:
  ```json
  {
    "status": "ok",
    "ts": 1727958000000,
    "rooms": 2
  }
  ```
