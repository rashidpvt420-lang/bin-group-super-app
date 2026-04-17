# BIN Group: UX/UI High-Fidelity Wireframes

This document provides the visual and structural requirements for the two most critical operational views of the BIN Group Super App.

---

## 🏛️ 1. Owner's ROI & Portfolio View

**Objective**: Provide absolute financial transparency to the landlord, transforming the app into a high-precision investment tool.

![Owner ROI Dashboard](C:\Users\My-PC\.gemini\antigravity\brain\22e24698-6831-49d3-b429-ece743806731\owner_roi_dashboard_1773444092650.png)

### Key HUD Elements

* **Total Portfolio ROI**: A large, central KPI reflecting the net yield after all waterfall deductions.
* **Rental Waterfall Chart**: A visual bar chart representing `Gross Rent -> Management -> Maintenance -> Net`.
* **Occupancy Heatmap**: A mini-map of properties colored by vacancy status (Green=Occupied, Red=Vacant).
* **Ejari Sync Pulse**: A small status indicator showing real-time connectivity with DLD.

### Design Tokens

* **Theme**: Dark Mode (Glassmorphism).
* **Color Palette**: Midnight Blue (#0A0E17), Gold Accents (#D4AF37), and Positive Green (#00C853).
* **Interactions**: Tap ROI Widget to view historical yield trends (5-year forecast).

---

## 🛠️ 2. Technician's "Morning Gate" Check-in

**Objective**: Enforce operational discipline and inventory accountability before any field work begins.

![Technician Morning Gate](C:\Users\My-PC\.gemini\antigravity\brain\22e24698-6831-49d3-b429-ece743806731\technician_morning_gate_1773444109860.png)

### Tech HUD Elements

* **Check-in Timer**: A countdown/stopwatch showing the 08:00 AM mandatory sync time.
* **Van Inventory Check**: A high-priority button that opens the camera. The tech must photograph the van stock (tools/parts) to unlock the job list.
* **QR Scanner Hub**: The primary interaction point for tagging assets at the building site.
* **Daily Job Pipeline**: A prioritized list of tickets, geo-sorted by the shortest travel time.

### Tech Design Tokens

* **Theme**: Ruggedized Clean (High contrast for outdoor visibility).
* **Color Palette**: Slate Grey (#1E293B) and Safety Orange (#FF6B00).
* **Interactions**: Swipe-to-start job logic to prevent accidental job closures.

---

## 🚀 UX Strategic Flow

1. **Transparency First**: Owners see the "Money" (ROI) the second they open the app.
2. **Discipline First**: Technicians cannot see "Jobs" until they have validated their "Tools" (Inventory).
3. **No-Call Seamlessness**: Both users have direct 24/7 access to the **Gemini AI Concierge** for troubleshooting.
