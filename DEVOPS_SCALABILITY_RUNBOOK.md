# BIN Group: DevOps & Scalability Runbook (Middle East Scaling)

This document outlines the path from 1,000 properties to **100,000 properties** across the Middle East.

---

## 🏗️ 1. Infrastructure Architecture

*   **Provider**: Google Cloud Platform (GCP) / Firebase.
*   **Region**: `me-central2` (Dammam, KSA) or `me-central1` (Doha, Qatar) for GCC data residency.
*   **Sovereignty Note**: GCP does not currently have a physical data center inside the UAE. If strict onshore UAE data residency is legally mandated by your government clients, backend storage must be migrated to Azure (UAE North) or AWS (me-central-1).
*   **Compute**: Kubernetes Engine (GKE) for the API layer; Firebase Cloud Functions for event-driven logic.

---

## 📈 2. Scalability Strategy

### Horizontal Scaling (API)

*   **Auto-scaling**: Configure GKE to scale based on CPU utilization > 60%.
*   **Latency Guard**: Use **Cloud Load Balancing** with **Cloud CDN** to serve static assets (technician media) from edge nodes in Dubai and Abu Dhabi.

### Database Optimization (Firestore)

1.  **Composite Indexing**: Pre-define indexes for `propertyId + status` and `ownerId + timestamp` to ensure <200ms query times.
2.  **Anti-Hotspotting Strategy**: For the `/telemetry` collection (IoT), use distributed counters or random document ID prefixes to prevent write bottlenecks during peak morning-gate check-ins.
3.  **Caching Layer**: Implement **Redis (MemoryStore)** for frequently accessed pricing benchmarks and community data.

---

## 🛠️ 3. Reliability & Monitoring

*   **Logging**: Cloud Logging (Fluentd) captures all FATAL and ERROR level logs for immediate triage.
*   **Monitoring**: **DataDog Dashboard** showing:
    *   API Latency (p99).
    *   Payment Success Rate (Stripe/PayTabs).
    *   Active Technicians vs. Unassigned Work Orders.
*   **Alerting**: PagerDuty triggers for any `status: 500` error frequency > 1% over 5 minutes.

---

## 🛡️ 4. Disaster Recovery (DR)

*   **RTO (Recovery Time Objective)**: 15 minutes.
*   **RPO (Recovery Point Objective)**: 5 minutes.
*   **Action**: Enable **Point-in-Time Recovery (PITR)** on Firestore to allow minute-by-minute rollbacks up to 7 days; Cross-region replica in `europe-west4` (Encrypted) for extreme failover.

---

## 🚀 5. Deployment Pipeline (CI/CD)

1.  **Commit**: Code pushed to `main` branch.
2.  **Build**: GitHub Actions runs Unit Tests.
3.  **Staging**: Automated deploy to Staging Environment.
4.  **QA Gate**: Manual sign-off on the **Arabic mirrored UI**.
5.  **Production**: Blue-Green deployment to minimize downtime.
