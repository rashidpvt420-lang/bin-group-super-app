# BIN Group: Quotation Engine UI & Logic (Dual-Engine Framework)

This document defines the interface and computational steps for the BIN Group Quote Engine, optimized for both individual owners (B2C) and institutional developers (B2B).

---

## 📱 1. Professional 4-Screen Quote Wizard

### Screen 1: Property Foundation

* **Property Type**: Dropdown (Villa, Apartment, Tower, Mall, etc.).
* **Location**: Dropdown (Downtown, Marina, JVC, Business Bay).
* **Total BUA (sqft)**: Number input (Primary sizing factor).
* **Floors/Units**: Complexity drivers.
* **Year Built**: Used for Building Age Multipliers.

### Screen 2: Amenities & Facilities (Factor Toggles)

* [ ] **Swimming Pool** (+3% FM Rate)
* [ ] **Gymnasium** (+2% FM Rate)
* [ ] **Concierge Service** (+2.5% FM Rate)
* [ ] **Valet/Parking Mgmt** (+2% FM Rate)
* [ ] **Retail Shells** (+2% FM Rate)
* [ ] **Smart IoT Hub** (Trigger for Upsell AI)

### Screen 3: Rental & Income Portfolio

* **Status**: Toggle (Rented / Vacant).
* **Annual Rental Income**: Used for PM Fee (5-10%).
* **Management Fee %**: Slider based on property type defaults.
* **Portfolio Size**: Number of total managed assets for loyalty discount.

### Screen 4: Contract Strategy & Term

* **Service Level**: Maintenance Only, PM Only, or Integrated.
* **Contract Term**: Dropdown (1 Year, 2 Years [2% Discount], 3 Years [5% Discount]).
* **Smart Add-ons**: Upsell toggles for Predictive AI, Energy IoT, etc.

---

## 🧮 2. The Computational Algorithm

### A. Maintenance Component (IFM)

The system calculates the core maintenance cost based on building complexity:
`FM_Price = (Base_Rate * Area * Multipliers) + Staffing_Loading`

| Market Segment | Rate (AED/sqft) | Community Context |
| :--- | :--- | :--- |
| **Affordable/Mid Res.** | 8 – 18 | JVC, Silicon Oasis, Discovery Gardens |
| **Premium Res.** | 18 – 28 | Dubai Marina, Business Bay |
| **Luxury Res.** | 25 – 40+ | Downtown Dubai, Palm Jumeirah |
| **Commercial / Office** | 12 – 30 | DIFC, Sheikh Zayed Road |
| **Retail Mall** | 25 – 45 | Large Malls (e.g., Dubai Mall area) |
| **Warehouses** | 3 – 6 | JAFZA, DIC, Al Quoz |

**The Component Pulse**: The UI displays a cost breakdown for transparency:

* **Technical (MEP)**: 35%
* **Soft FM (Cleaning)**: 25%
* **Security**: 25%
* **Mgmt Fee**: 15%

### B. Management Component (PM)

`PM_Fee = Annual_Rental_Income * 0.05`

### C. Smart Upsell Modules (Add-ons)

The UI provides toggles for premium tech layers:

* [ ] **Predictive AI Suite** (+8% maint cost)
* [ ] **Energy Efficiency IoT** (+4% maint cost)
* [ ] **REIT Asset Compliance** (+3% maint cost)

---

## 📉 3. Integrated Pricing & ROI Dashboard

### The Integrated Combo

If owner selects both IFM + PM:
`Final_Quote = (IFM_Cost + PM_Fee + Add-ons) * 0.90` (10% Bundle Discount)

### 📊 The ROI Impact View (Quote Page Result)

To build massive trust, the result screen shows:

1. **Estimated Gross Yield**: `Annual Rental Income`
2. **Maintenance Intensity**: `(Contract Price / Rent) %`
3. **Net Owner Income (NOI)**: `Rent - (Maintenance + PM Fee)`
4. **Asset Protection Cost**: `Quote / Asset Value %` (e.g., "Secure your 50M asset for just 0.8% annually.")

### Portfolio Loyalty Scale

| Units | Discount |
| :--- | :--- |
| **5 Units / Bldgs** | 1.5% |
| **10 Units / Bldgs** | 3.0% |
| **20+ Units / Bldgs** | 5.0% |

---

## 📈 4. Institutional Trust Benchmarks

The engine displays three "Reality Checks" to the owner:

1. **Estimated Total FM Budget**: Calculated using industry benchmarks.
2. **Asset Security Ratio**: `Quote / Asset Value`. (e.g., "0.85% for total protection").
3. **Cost per Unit Dashboard**: (e.g., "Annual upkeep = 1,350 AED per resident").
