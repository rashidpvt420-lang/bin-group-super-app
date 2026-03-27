# FINANCIAL LOGIC - HOME OS
**"Total Care" Revenue & Expense Management**

---

## 1. Pricing Hard-Coded Constants

### Annual Maintenance Contracts (AMC)

| Unit Type | Annual Price | Monthly Equivalent |
|-----------|-------------|-------------------|
| Studio/1-Bed | AED 3,500 | AED 291.67 |
| Small Villa | AED 12,000 | AED 1,000 |
| Large Villa | AED 25,000 | AED 2,083.33 |
| Tower | AED 12/sq.ft | Variable |

**Configuration:**
```json
{
  "AMC_PRICING": {
    "STUDIO_1BED": 3500,
    "VILLA_SMALL": 12000,
    "VILLA_LARGE": 25000,
    "TOWER": "12_per_sqft",
    "BILLING_CYCLE": "ANNUAL",
    "CURRENCY": "AED"
  }
}
```

---

### Pay-Per-Use Services

| Service | Price | Trigger |
|---------|-------|---------|
| Emergency Call | AED 350 | When tenant marks SOS |
| Turnover Studio | AED 950 | When move-out date set |
| Turnover 1-Bed | AED 1,400 | When move-out date set |

**Configuration:**
```json
{
  "PAY_PER_USE": {
    "EMERGENCY_CALL": 350,
    "TURNOVER_STUDIO": 950,
    "TURNOVER_1BED": 1400,
    "CURRENCY": "AED"
  }
}
```

---

## 2. Enterprise Discount Logic

### Rule: "IF Owner has ≥4 properties THEN apply 3.3% discount"

**Algorithm:**
```python
def calculate_owner_discount(owner_id):
    """
    Applies 3.3% discount to all invoices if owner owns >= 4 properties
    """
    property_count = count_owner_properties(owner_id)
    
    if property_count >= 4:
        discount_percentage = 3.3
        discount_applicable = True
        # Store in owner document for quick reference
        update_owner({
            'discountApplicable': True,
            'discountTriggerDate': now()
        })
    else:
        discount_percentage = 0
        discount_applicable = False
    
    return {
        'applicable': discount_applicable,
        'percentage': discount_percentage,
        'property_count': property_count
    }
```

**Application Example:**
```
Base Invoice Total: AED 10,000
Discount (3.3%): -AED 330
Final Price: AED 9,670
```

---

## 3. Parts Markup Engine

### Rule: "Client_Price = Technician_Cost_Input + 20%"

**Algorithm:**
```python
def calculate_parts_markup(technician_cost, parts_list):
    """
    Applies fixed 20% markup on technician cost
    Owner never sees technician cost (confidential)
    """
    
    total_technician_cost = sum(part['cost'] for part in parts_list)
    markup_percentage = 20
    markup_amount = total_technician_cost * (markup_percentage / 100)
    
    client_price = total_technician_cost + markup_amount
    
    return {
        'technician_cost': total_technician_cost,  # NOT shown to owner
        'markup_percentage': markup_percentage,
        'markup_amount': markup_amount,
        'client_price': client_price,
        'currency': 'AED'
    }
```

**Invoice Example:**
```
Parts Used:
  - AC Capacitor (Technician Cost: AED 150)
  - Wiring (Technician Cost: AED 75)

Total Technician Cost: AED 225
Markup (20%): AED 45
Client Price: AED 270

[Owner sees only: AED 270 under "Parts"]
```

---

## 4. Rent Collection Waterfall (Priority Logic)

### Sequence: BIN Management Fee → Outstanding Invoices → Owner Transfer

**Algorithm:**
```python
def process_rent_collection(tenant_id, owner_id, rent_amount):
    """
    Implements financial waterfall for monthly rent collection
    """
    
    collection = {
        'totalReceived': rent_amount,
        'currency': 'AED',
        'breakdown': {}
    }
    
    # Step 1: Deduct BIN Group Management Fee (5%)
    bin_fee = rent_amount * 0.05
    collection['breakdown']['binGroupFee'] = {
        'percentage': 5,
        'amount': bin_fee,
        'recipientId': 'BINGROUP_TREASURY'
    }
    remaining = rent_amount - bin_fee
    
    # Step 2: Deduct Outstanding Maintenance Invoices
    outstanding_invoices = get_owner_outstanding_invoices(owner_id)
    invoices_deducted = 0
    
    for invoice in outstanding_invoices:
        if remaining >= invoice['amount']:
            invoices_deducted += invoice['amount']
            remaining -= invoice['amount']
            mark_invoice_paid(invoice['id'])
        else:
            # Partial payment
            invoices_deducted += remaining
            update_invoice_partial_payment(invoice['id'], remaining)
            remaining = 0
            break
    
    collection['breakdown']['maintenanceInvoices'] = {
        'count': len(outstanding_invoices),
        'totalDeducted': invoices_deducted,
        'recipientId': owner_id
    }
    
    # Step 3: Transfer remaining balance to Owner
    owner_payout = remaining
    collection['breakdown']['ownerPayout'] = {
        'amount': owner_payout,
        'recipientId': owner_id,
        'transferMethod': 'BANK_TRANSFER',
        'scheduledDate': get_next_business_day()
    }
    
    # Record transaction
    create_payment_record(collection)
    
    return collection
```

**Example with Real Numbers:**
```
Tenant Monthly Rent: AED 2,500

Step 1: BIN Group Fee (5%)
  Amount: AED 125
  Recipient: BIN Group Treasury

Step 2: Outstanding Invoices
  Previous Invoice 1: AED 380 (PAID)
  Previous Invoice 2: AED 250 (PAID)
  Total Deducted: AED 630
  Recipient: Owner

Remaining for Owner: AED 1,745

Step 3: Owner Payout
  Amount: AED 1,745
  Transfer: Bank Account
  Settlement Date: Next Business Day
```

---

## 5. Two-Strike Suspension Rule

### Rule: "IF Unpaid_Invoices >= 2 THEN Suspend"

**Algorithm:**
```python
def check_and_apply_suspension(owner_id):
    """
    Monitors unpaid invoice count and applies suspension if threshold exceeded
    """
    
    unpaid_invoices = get_owner_unpaid_invoices(owner_id)
    unpaid_count = len(unpaid_invoices)
    
    owner = get_owner(owner_id)
    
    if unpaid_count >= 2:
        # Trigger suspension
        suspend_owner(owner_id, {
            'reason': 'UNPAID_INVOICES_THRESHOLD',
            'unpaidCount': unpaid_count,
            'invoiceIds': [inv['id'] for inv in unpaid_invoices]
        })
        
        # Block Owner App Access
        disable_app_access(owner_id)
        
        # Suspend Emergency Services
        suspend_emergency_services(owner_id)
        
        # Send Alert
        send_notification(owner_id, {
            'type': 'ALERT_SUSPENSION',
            'message': f'Services Suspended. {unpaid_count} unpaid invoices. Pay now to reactivate.',
            'totalOverdue': sum(inv['amount'] for inv in unpaid_invoices),
            'channel': 'PUSH' | 'EMAIL' | 'SMS'
        })
        
        # Log to audit trail
        create_audit_log({
            'action': 'TWO_STRIKE_SUSPENSION',
            'userId': owner_id,
            'timestamp': now(),
            'details': unpaid_invoices
        })
        
        return {
            'suspended': True,
            'reason': 'UNPAID_INVOICES',
            'suspensionLevel': 'FULL'
        }
    
    elif unpaid_count == 1:
        # Send warning
        send_notification(owner_id, {
            'type': 'WARNING_ONE_UNPAID',
            'message': '1 unpaid invoice. Pay within 7 days to avoid suspension.',
            'dueAmount': unpaid_invoices[0]['amount']
        })
        
        return {
            'suspended': False,
            'warning': 'ONE_UNPAID_INVOICE'
        }
    
    else:
        # Clear any suspension flag if invoices now paid
        if owner['suspensionStatus'] == 'SUSPENDED':
            reactivate_owner(owner_id)
        
        return {
            'suspended': False,
            'status': 'CLEAR'
        }
```

**Suspension Consequences:**
```
Owner Actions When Suspended:
├── App Login: DISABLED
├── Emergency Services: DISABLED
├── New Job Requests: REJECTED
├── Notifications: DAILY (Payment reminders)
└── Reactivation: Automatic upon full payment

Tenant Impact (Indirect):
├── Emergency Tickets: QUEUED (not assigned)
├── Regular Tickets: DELAYED (low priority)
└── Notification: "Maintenance may be delayed"
```

---

## 6. Health Score Algorithm

### Metric: 0-100 points based on activity

**Calculation:**
```python
def calculate_health_score(property_id):
    """
    Computes health score for property based on maintenance activity
    """
    
    property = get_property(property_id)
    base_score = 100
    
    # Component 1: Open Tickets (-5 points each)
    open_tickets = count_open_tickets(property_id)
    open_ticket_penalty = open_tickets * 5
    
    # Component 2: Completed PPM (+10 points each)
    completed_ppm = count_completed_preventive_maintenance(property_id)
    ppm_bonus = min(completed_ppm * 10, 30)  # Max +30 from PPM
    
    # Component 3: Late Payments (-5 points each)
    late_payments = count_late_payments(property_id)
    late_payment_penalty = late_payments * 5
    
    # Component 4: Tenant Satisfaction (+15 if avg rating >= 4.5)
    avg_tenant_rating = get_avg_tenant_rating(property_id)
    satisfaction_bonus = 15 if avg_tenant_rating >= 4.5 else 0
    
    # Component 5: Maintenance Responsiveness (0-43 points)
    # Based on avg time to complete tickets
    avg_completion_time = get_avg_ticket_completion_hours(property_id)
    if avg_completion_time <= 4:
        responsiveness_bonus = 43
    elif avg_completion_time <= 8:
        responsiveness_bonus = 30
    elif avg_completion_time <= 24:
        responsiveness_bonus = 15
    else:
        responsiveness_bonus = 0
    
    # Calculate final score
    health_score = base_score - open_ticket_penalty - late_payment_penalty \
                   + ppm_bonus + satisfaction_bonus + responsiveness_bonus
    
    # Clamp to 0-100
    health_score = max(0, min(100, health_score))
    
    # Store in database
    update_property({
        'healthScore': health_score,
        'scoreBreakdown': {
            'openTickets': -open_ticket_penalty,
            'completedPPM': ppm_bonus,
            'latePayments': -late_payment_penalty,
            'tenantRating': satisfaction_bonus,
            'maintenanceResponsiveness': responsiveness_bonus
        },
        'lastScoreCalculatedAt': now()
    })
    
    return health_score
```

**Example Score Breakdown:**
```
Property: PROP_001

Base: 100 points
- Open Tickets (3): -15 points
- Late Payments (1): -5 points
+ Completed PPM (2): +20 points
+ Tenant Rating (4.7): +15 points
+ Response Time (avg 6 hrs): +30 points

Final Health Score: 145 → Clamped to 100
Display Score: 100 (Excellent)
```

---

## 7. Invoice Generation Rules

### Automatic Triggers

```python
def auto_generate_invoices():
    """
    Runs daily to create invoices for:
    1. Completed maintenance jobs
    2. Monthly AMC charges
    3. Overdue payment reminders
    """
    
    # Rule 1: Job Completion Invoice
    completed_jobs = get_jobs_completed_today()
    for job in completed_jobs:
        create_invoice({
            'ownerId': job['ownerId'],
            'invoiceType': 'MAINTENANCE',
            'description': f"Job {job['jobId']} - {job['issueCategory']}",
            'amount': job['totalInvoiced'],
            'dueDate': today() + 30days,
            'linkedTicket': job['ticketId']
        })
    
    # Rule 2: Monthly AMC Billing
    active_properties = get_all_active_properties()
    for prop in active_properties:
        amc_amount = calculate_amc_for_month(prop['propertyId'])
        create_invoice({
            'ownerId': prop['ownerId'],
            'invoiceType': 'AMC',
            'description': f"Monthly AMC - {prop['propertyName']}",
            'amount': amc_amount,
            'dueDate': end_of_month() + 15days
        })
    
    # Rule 3: Overdue Reminders
    overdue_invoices = get_invoices(status='OVERDUE')
    for invoice in overdue_invoices:
        days_overdue = (today() - invoice['dueDate']).days
        if days_overdue > 0 and days_overdue % 7 == 0:  # Weekly reminders
            send_payment_reminder(invoice)
```

---

## 8. Financial Reporting Dashboard

**Owner Dashboard Query:**
```python
def get_owner_financial_summary(owner_id, period='2026-02'):
    """
    Returns comprehensive financial view for period
    """
    
    # Rent collections for period
    rent_collected = get_rent_collected(owner_id, period)
    
    # Maintenance expenses
    maintenance_expenses = get_maintenance_expenses(owner_id, period)
    
    # BIN Group Fees (5% of collected rent)
    bin_fees = rent_collected * 0.05
    
    # Apply discount if applicable
    owner = get_owner(owner_id)
    discount_applied = 0
    if owner['discountApplicable']:
        discount_applied = (rent_collected - bin_fees) * 0.033
    
    # Calculate net payout
    net_payout = rent_collected - bin_fees - maintenance_expenses + discount_applied
    
    return {
        'period': period,
        'totalRentCollected': rent_collected,
        'binGroupFee': bin_fees,
        'maintenanceExpenses': maintenance_expenses,
        'discountApplied': discount_applied,
        'netPayout': net_payout,
        'currency': 'AED',
        'transferDate': get_next_transfer_date()
    }
```

---

## 9. Currency & Calculations

**Precision Rules:**
- All amounts: 2 decimal places
- Percentages: Calculated before rounding
- Conversions: Use ECB rates, updated daily
- Currency: Default AED

**Example Precision:**
```
Order Total: AED 1000.00
Discount (3.3%): AED 33.00
Tax (0%): AED 0.00
Final: AED 967.00
```

---

## 10. Audit & Compliance

Every financial transaction logged with:
```json
{
  "transactionId": "TXN_001",
  "timestamp": "2026-02-19T10:30:00Z",
  "userId": "ADMIN_001",
  "action": "PAYMENT_PROCESSED",
  "beforeState": {...},
  "afterState": {...},
  "ipAddress": "192.168.1.1",
  "status": "SUCCESS",
  "notes": "Monthly rent collection processed"
}
```

Records retained for **7 years** (UAE regulatory requirement).
