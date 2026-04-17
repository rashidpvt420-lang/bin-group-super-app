# BIN Group: Offline-First Sync Strategy

Because technicians often work in low-connectivity areas (Basements, Elevator Shafts), the app must function perfectly without an active internet connection.

---

## 🏗️ 1. Technical Architecture (Local Database)

* **Database**: SQLite (React Native) or Hive (Flutter) for local persistence.
* **Photo Storage**: Store high-res images in the device's temporary cache using unique UUIDs.

---

## 🔄 2. The Sync Lifecycle

1. **Capture (Offline)**: User takes a "Before Photo," logs a meter reading, and collects a signature.
2. **Queue**: Action is stored in a `pending_sync` queue with a timestamp.
3. **Heartbeat**: A background background-task (WorkManager/JobScheduler) pings `https://api.homeos.ae/health` every 60 seconds.
4. **Reconciliation (Online)**: Once signal returns, the queue is pushed in a **single atomic transaction** to prevent data corruption.

---

## 🖼️ 3. Media Heavy-Sync Protocol

* **Progressive Upload**: Send metadata (text/IDs) first, then upload heavy media (photos/videos) in the background.
* **Compression**: All technician photos are auto-compressed (80% Quality, 1080p Max) on the device *before* upload to save bandwidth and storage costs.

---

## ✅ 4. Conflict Resolution

* If two users (e.g., a Tech and an Admin) edit the same ticket simultaneously, the **"Server Timestamp Authority"** wins, but the Admin is notified: *"Duplicate edit detected; your version took precedence."*
