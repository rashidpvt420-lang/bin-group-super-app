# BIN Group: Professional FM Pricing Strategy (UAE Dual-Engine Model)

This document defines the dual-engine pricing logic utilized by the BIN GROUP Super App, benchmarked against tier-1 UAE facility management firms (EFS, Emrill, Farnek).

---

## ⚙️ 1. The Dual-Engine Logic

Our platform uses two distinct algorithms depending on asset complexity to ensure market-accurate bidding.

### 🏎️ Engine A: Small Properties (B2C Focus)

* **Target**: Individual Villas, Townhouses, and Small Apartment units.
* **Model**: **Per-Unit Flat Rate**.
* **Standard UAE Villa Tiers**:
  * **Basic**: AED 1,200 / year (Minor MEP + AC check)
  * **Standard**: AED 2,000 / year (Standard quarterly cycles)
  * **Premium**: AED 4,000 / year (24/7 Priority + Unlimited call-outs)

### 🚀 Engine B: Large Properties (Institutional FM)

* **Target**: Towers, Malls, Skyscrapers, Schools, Hospitals.
* **Model**: **RERA-Aligned Per-Square-Foot (Sqft) Calculation**.
* **Market Benchmarks (AED/sqft/year)**:

    | Property Type | Service Charge (AED/sqft/yr) | Notes |
    | :--- | :--- | :--- |
    | **Affordable/Mid Residential** | 8 – 18 | JVC, Discovery Gardens, Silicon Oasis |
    | **Premium Residential** | 18 – 28 | Dubai Marina, Business Bay |
    | **Luxury Residential** | 25 – 40+ | Downtown Dubai, Palm Jumeirah |
    | **Commercial Building** | 12 – 30 | DIFC, Business Bay (Commercial) |
    | **Retail / Mall** | 25 – 45 | Large Malls & High-Street Retail |
    | **Villa Community** | 8 – 12 | Compound FM & Green Scaping |
    | **Warehouse / Light Industrial** | 3 – 6 | JAFZA, DIC, Al Quoz |

---

## 🏢 2. Property Management (PM) Fees

Standard PM fees in the UAE are percentage-based on gross rental income:

| Category | Typical Fee (%) |
| :--- | :--- |
| **Residential Apartments** | 5% – 8% |
| **Villa / Luxury Residences** | 7% – 10% |
| **Commercial Units** | 7% – 10% |

---

## 📈 2. ROI Integrity & Financial Logic

The engine doesn't just calculate costs; it simulates the owner's **Net Operating Income (NOI)** to demonstrate value.

* **Gross Revenue**: `Annual Rental Income`
* **Maintenance Load**: `(Integrated Contract Cost / Annual Rent) %`
* **Net Income**: `Gross Revenue - (Maintenance + PM Fee)`
* **Asset Security Score**: `Contract Cost / Property Market Value` (Usually < 1% for major towers).

---

## 💎 3. Smart Upsell Packages (The "Executive" Layer)

Owners can toggle premium modules to increase building value and reduce long-term risk:

| Module | Cost Adder | Impact |
| :--- | :--- | :--- |
| **Predictive AI** | +5% – 8% | Predict AC/Pump failure with 90% accuracy. |
| **Energy Monitor** | +4% | Reduce Chiller/Electricity bills by 15% through IoT. |
| **Asset Lifecycle** | +3% | Full RUL (Remaining Useful Life) reporting for REITs. |
| **Emergency SLA** | +AED 15k/yr | Guaranteed 60-min response for critical MEP. |

---

## 🏗️ 4. The Integrated FM (IFM) Cost Breakdown

Large contracts are calculated using a component-based "Waterfall" to ensure transparency:

| Component | Weight (%) | Includes |
| :--- | :--- | :--- |
| **MEP Maintenance** | 35% | HVAC, Plumbing, Electrical, Civil |
| **Cleaning (Soft FM)** | 25% | Common areas, facade, sanitation |
| **Security** | 25% | Guarding, CCTV, Access control |
| **Management Fee** | 15% | FM Manager, Reporting, Compliance |

---

## 🧮 3. High-Rise & Skyscraper Formula (Staff-Based)

For ultra-complex assets (60+ floors), the system validates the area-rate against a **Manpower Loading Model**:
`Contract Value = (Direct Labor + Materials + Equipment) + Profit Margin (20-30%)`

---

## 🏢 4. Property Management (PM) Fee

Calculated independently, capturing the administrative yield of the asset.

* **Standard BIN Fee**: **5% of Annual Rental Income**.
* **Integrated Advantage**: If PM is bundled with IFM, the platform applies a **10% Integrated Discount**.

---

## 📉 5. Portfolio & Loyalty Ladder

We incentivize portfolio migration through automated quantity discounts:

| Portfolio Size | Discount |
| :--- | :--- |
| **5 Properties** | 1.5% |
| **10 Properties** | 3.0% |
| **15 Properties** | 4.0% |
| **20+ Properties** | 5.0% |

---

## 💎 6. Example: Dubai Residential Tower

* **Attributes**: 30 Floors, 200 Units, 150k sqft.
* **IFM Quote (@ 12 AED/sqft)**: **AED 1,800,000 / year**
* **PM Fee (@ 5% of 6M Rent)**: **AED 300,000 / year**
* **Integrated Bundle**: (1.8M + 0.3M) * 0.90 = **AED 1,890,000 / year**
* **Revenue Captivity**: BIN Group captures both the physical maintenance and the rental administration.
