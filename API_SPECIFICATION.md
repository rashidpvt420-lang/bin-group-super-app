# BIN Group: API Specification (v1.0)

This document is the "Contract" between the Backend and Frontend teams. It defines the exact request/response schemas for the Super App ecosystem.

---

## 🔑 1. Global Headers
| Header | Value | Requirement |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <Firebase_JWT>` | Mandatory for all routes except `/health`. |
| `Accept-Language`| `en` or `ar` | Controls the language of the error messages. |
| `X-Platform` | `ios`, `android`, or `web` | Used for analytics and update tracking. |

---

## 🏷️ 2. Endpoint Registry

### [POST] `/api/quotes/calculate`
*   **Purpose**: Weight-based quotation for AMC/FM contracts.
*   **Payload**: 
    ```json
    {
      "params": {
        "propertyType": "villa",
        "area": 2500,
        "communityType": "prime",
        "amenities": ["pool", "garden"]
      }
    }
    ```
*   **Response**: `200 OK` with full breakdown of maintenance vs. management fees.

### [POST] `/api/finance/waterfall`
*   **Purpose**: Real-time owner payout calculation.
*   **Payload**:
    ```json
    {
      "grossRent": 120000,
      "managementFeePerc": 0.05,
      "maintenanceCosts": 4500
    }
    ```
*   **Response**: `200 OK` with Net Payout and VAT breakdown.

### [POST] `/api/tickets/create`
*   **Purpose**: Issues a new maintenance work order.
*   **Payload**:
    ```json
    {
      "propertyId": "PROP_001",
      "category": "AC",
      "description": "Not cooling",
      "media": ["url_to_photo_1", "url_to_photo_2"]
    }
    ```
*   **Response**: `201 Created` with `ticketId`.

### [GET] `/api/assets/history/:tagId`
*   **Purpose**: Fetches the "Digital Heartbeat" of a physical asset via QR scan.
*   **Response**: `200 OK` with log of last 5 service visits.

---

## 🚦 3. Error Codes & Handling
| Code | Meaning | Action |
| :--- | :--- | :--- |
| `401` | Unauthorized | Redirect to Login Screen. |
| `403` | Forbidden | Show "Access Denied" (e.g., Tenant trying to see Owner data). |
| `422` | Unprocessable Entity | Validation error (e.g., Missing Makani number). |
| `429` | Too Many Requests | Rate-limit (Cooldown for 60 seconds). |
| `500`| Server Error | Trigger [DevOps Alert](./DEVOPS_SCALABILITY_RUNBOOK.md). |
