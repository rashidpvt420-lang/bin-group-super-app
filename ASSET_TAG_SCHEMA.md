# BIN Group: QR Asset Tagging Schema

To minimize manual data entry and ensure technician accountability, every major asset in a property (AC units, Heaters, Pumps) is mapped to a unique QR ID.

---

## 🏗️ 1. QR Payload Format (JSON-v1)

When a technician scans a sticker, the app decodes the following JSON to fetch real-time data:

```json
{
  "tag_id": "BIN-DXB-AC-00982",
  "category": "hvac",
  "type": "split_unit",
  "brand": "O-General",
  "capacity": "2.0 Ton",
  "install_date": "2024-05-12",
  "location_ref": "bedroom_01",
  "history_url": "https://api.homeos.ae/assets/history/BIN-DXB-AC-00982"
}
```

---

## 🗓️ 2. Service History Lifecycle
The "Digital Heartbeat" of the asset:
1.  **Scan**: Unlocks the maintenance history for that specific unit.
2.  **Diagnostic**: AI analyzes previous fail-patterns (e.g., "Frequent gas leak") to suggest parts.
3.  **Update**: Technician logs a "Service Pulse" after completion, updating the next "Preventive Maintenance" date.

---

## 🛠️ 3. Physical Tagging Standard
*   **Material**: Weatherproof, heat-resistant UV stickers (Essential for outdoor condenser units).
*   **Placement**: Eye-level, adjacent to the serial number plate.
*   **Tamper Proof**: Notification sent if a tag ID is scanned from a location > 50 meters away from the registered GPS property coordinate.

---

## 📈 4. Benefits for Owners
*   **Asset Valuation**: Proof of maintenance history increases property resale/rental value.
*   **Audit Trail**: Immutable record of which technician touched which machine and when.
