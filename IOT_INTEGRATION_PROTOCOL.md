# BIN Group: IoT Integration Protocol (SOP)

This document defines the standard for connecting smart building sensors (Water, HVAC, Power) to the BIN Group maintenance engine.

---

## 🏗️ 1. Architecture: Sensor to Ticket

`Sensor Trigger` -> `IoT Gateway (MQTT/HTTPS)` -> `BIN API (/api/iot/trigger)` -> `AI Triage` -> `Work Order`.

---

## 📡 2. Payload Schema (JSON)

Every IoT device must pulse data in the following format to trigger a maintenance response:

```json
{
  "event_id": "GW-DXB-772-20260314T032500Z-000184",
  "device_id": "ST-WTR-MAR-102",
  "property_id": "PROP_DXB_772",
  "event_type": "leak_detected",
  "urgency": "critical",
  "telemetry": {
    "moisture_level": 88.5,
    "battery_status": 92.0,
    "location_zone": "kitchen_main_valve"
  },
  "timestamp": "2026-03-14T03:25:00Z"
}
```

The gateway secret is sent only in the `x-iot-gateway-token` HTTPS header. It
must never appear in the JSON body, URL, device logs, or audit metadata.

The API rejects events more than five minutes from server time. `event_id` is
required and is transactionally deduplicated; replaying the same event returns
an acknowledgement without creating another ticket. Every device must also
exist as an active `iot_devices/{device_id}` record bound to `property_id`.

---

## 🛠️ 3. Hardware Standard

To ensure <200ms trigger latency, BIN Group recommends the following connectivity:

* **LPWAN (LoRaWAN/NB-IoT)**: Preferred for tower-wide water and fire safety sensors.
* **Zigbee/Wi-Fi**: Acceptable for internal unit temperature and lighting controls.
* **Local Gateway**: All data must be aggregated to a local gateway before being sent to the cloud via TLS 1.3.

---

## 🚨 4. Fail-Safe Protocol

1. **Duplicate Check**: Gateways must reuse the same `event_id` for retries. The API creates one deterministic telemetry record and at most one critical ticket for that event.
2. **Connectivity Offline**: If a "Heartbeat" is missed for >30 mins, trigger a "Device Offline" low-priority maintenance ticket for investigation.
3. **Critical Override**: "Fire" or "Gas Leak" payloads bypass the standard queue and trigger immediate SMS/Phone call to the Building Manager.
