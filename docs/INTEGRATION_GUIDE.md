# INTEGRATION GUIDE - HOME OS
**Third-Party API & Service Setup**

---

## 1. GOOGLE MAPS API (Technician Tracking)

### Purpose
Real-time tracking of technicians in the field for live map display in admin panel.

### Setup

#### 1.1 Create Google Cloud Project
```bash
# Via Google Cloud Console
1. Go to https://console.cloud.google.com
2. Create new project: "HOME OS - Maps"
3. Enable APIs:
   - Maps JavaScript API
   - Maps SDK for Android
   - Maps SDK for iOS
   - Geolocation API
```

#### 1.2 Generate API Keys
```
# Web API Key (Admin Panel)
GOOGLE_MAPS_API_KEY_WEB=AIzaSy...

# Android API Key (Technician App)
GOOGLE_MAPS_API_KEY_ANDROID=AIzaSy...

# iOS API Key (Technician App)
GOOGLE_MAPS_API_KEY_IOS=AIzaSy...
```

#### 1.3 Implementation

**Backend - Location Update Endpoint:**
```javascript
// POST /api/technician/{id}/location
app.post('/api/technician/:id/location', async (req, res) => {
    const { latitude, longitude, timestamp } = req.body;
    
    // Store in real-time database
    await db.collection('technician-locations').doc(req.params.id).set({
        lat: latitude,
        lng: longitude,
        lastUpdated: timestamp,
        accuracy: req.body.accuracy || null
    });
    
    res.json({ success: true });
});
```

**Technician App - Foreground Service (Android):**
```java
// LocationManager.java
class LocationManager {
    private LocationRequest locationRequest;
    
    public void startTracking() {
        locationRequest = LocationRequest.create();
        locationRequest.setInterval(30000);  // Every 30 seconds
        locationRequest.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);
        
        LocationServices.FusedLocationProviderClient
            .requestLocationUpdates(locationRequest, callback, null);
    }
    
    private LocationCallback callback = new LocationCallback() {
        @Override
        public void onLocationResult(LocationResult result) {
            Location location = result.getLastLocation();
            sendLocationToBackend(location);
        }
    };
}
```

**Admin Panel - Live Map Display:**
```javascript
// AdminMap.jsx
import { GoogleMap, Marker } from '@react-google-maps/api';

function LiveTechnicianMap() {
    const [technicians, setTechnicians] = useState([]);
    
    useEffect(() => {
        const ref = db.collection('technician-locations');
        const unsubscribe = ref.onSnapshot(snapshot => {
            const techs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setTechnicians(techs);
        });
        
        return unsubscribe;
    }, []);
    
    return (
        <GoogleMap center={{ lat: 25.2048, lng: 55.2708 }} zoom={11}>
            {technicians.map(tech => (
                <Marker
                    key={tech.id}
                    position={{ lat: tech.lat, lng: tech.lng }}
                    title={tech.name}
                />
            ))}
        </GoogleMap>
    );
}
```

### Cost Estimate
- Maps API: $7/1000 map loads
- Geolocation API: $0.50/1000 requests
- **Estimated Monthly**: AED 150-300 (low volume)

### Rate Limits
- 100,000 requests/24 hours (free tier)
- Standard: 25,000 requests/day

---

## 2. OPENAI VISION API (Image Analysis)

### Purpose
Auto-categorize maintenance issues from tenant photos/videos.

### Setup

#### 2.1 Create OpenAI Account
```
1. Go to https://platform.openai.com
2. Create API key
3. Set up billing
```

#### 2.2 Configuration
```env
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4-vision
```

#### 2.3 Implementation

**Ticket Creation - Auto-Tagging:**
```python
# backend/services/image_analyzer.py
import openai
import base64

class ImageAnalyzer:
    def __init__(self):
        self.client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
    
    def analyze_maintenance_image(self, image_url):
        """
        Sends image to OpenAI Vision for categorization
        Returns: category, confidence, description
        """
        try:
            response = self.client.chat.completions.create(
                model="gpt-4-vision",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": """Analyze this maintenance issue photo. 
                                Return JSON with:
                                1. category: AC_ISSUE|LEAK|ELECTRICAL|PLUMBING|OTHER
                                2. confidence: 0-1
                                3. description: 1 sentence
                                4. urgency: ROUTINE|HIGH|CRITICAL
                                
                                Be conservative - if uncertain, return OTHER."""
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": image_url}
                            }
                        ]
                    }
                ],
                max_tokens=200
            )
            
            # Parse response
            content = response.choices[0].message.content
            analysis = json.loads(content)
            
            return {
                'detectedCategory': analysis['category'],
                'confidence': analysis['confidence'],
                'description': analysis['description'],
                'urgency': analysis['urgency']
            }
        
        except Exception as e:
            logger.error(f"Image analysis failed: {e}")
            return {
                'detectedCategory': 'OTHER',
                'confidence': 0.0,
                'description': 'Manual categorization required',
                'urgency': 'ROUTINE'
            }
```

**Endpoint Integration:**
```python
# backend/routes/tickets.py
@app.post('/api/tickets/create')
def create_ticket_with_analysis(request):
    photo_url = request.get('photoUrl')
    
    # Auto-analyze if photo provided
    if photo_url:
        analysis = ImageAnalyzer().analyze_maintenance_image(photo_url)
    else:
        analysis = {'detectedCategory': 'OTHER', 'confidence': 0}
    
    ticket = {
        'category': request.get('category') or analysis['detectedCategory'],
        'photoUrl': photo_url,
        'aiAnalysis': analysis
    }
    
    return save_ticket(ticket)
```

### Cost Estimate
- GPT-4 Vision: $0.01 per image
- **Estimated Monthly**: AED 200-400 (20-40 tickets/day)

### Rate Limits
- 3,500 requests per minute (with billing)

---

## 3. STRIPE / NETWORK INTERNATIONAL (Payments)

### Purpose
Process owner payments, subscription billing, and emergency call charges.

### Setup

#### 3.1 Stripe Configuration (Recommended for UAE)
```
1. Go to https://dashboard.stripe.com
2. Create account
3. Verify UAE business
4. Generate API keys
```

**API Keys:**
```env
STRIPE_API_KEY=sk_live_...
STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

#### 3.2 Network International (Alternative UAE Gateway)
```
1. Go to https://developer.nispayments.com
2. Register
3. Generate credentials
```

**Credentials:**
```env
NI_API_KEY=...
NI_MERCHANT_ID=...
NI_OUTGOING_IP_WHITELIST=...
```

#### 3.3 Implementation

**Backend - Pay Invoice Endpoint:**
```python
# backend/routes/payments.py
import stripe

stripe.api_key = os.getenv('STRIPE_API_KEY')

@app.post('/api/payments/process')
def process_payment(request):
    """
    Charges owner for invoice or emergency call
    """
    owner_id = request.get('ownerId')
    amount = request.get('amount')  # In fils (1 AED = 100 fils)
    invoice_id = request.get('invoiceId')
    
    try:
        # Create payment intent
        intent = stripe.PaymentIntent.create(
            amount=int(amount),  # In fils
            currency='aed',
            payment_method=request.get('paymentMethodId'),
            confirm=True,
            description=f'Invoice {invoice_id}',
            metadata={
                'owner_id': owner_id,
                'invoice_id': invoice_id
            }
        )
        
        if intent.status == 'succeeded':
            # Record payment in database
            payment = {
                'paymentId': intent.id,
                'ownerId': owner_id,
                'amount': amount / 100,
                'currency': 'AED',
                'status': 'COMPLETED',
                'transactionId': intent.id,
                'processedAt': datetime.now()
            }
            
            save_payment(payment)
            mark_invoice_paid(invoice_id)
            
            return {
                'success': True,
                'paymentId': intent.id,
                'status': 'COMPLETED'
            }
        else:
            return {
                'success': False,
                'status': intent.status
            }
    
    except stripe.error.CardError as e:
        return {'success': False, 'error': str(e)}, 402
```

**Webhook - Payment Confirmation:**
```python
@app.post('/api/webhooks/stripe')
def handle_stripe_webhook():
    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature')
    
    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            os.getenv('STRIPE_WEBHOOK_SECRET')
        )
    except ValueError:
        return 'Invalid payload', 400
    
    if event['type'] == 'payment_intent.succeeded':
        intent = event['data']['object']
        mark_invoice_paid(intent['metadata']['invoice_id'])
        notify_owner_payment_received(intent['metadata']['owner_id'])
    
    return 'OK', 200
```

### Cost Structure
- **Stripe**: 2.9% + 0.30 AED per transaction
- **Network International**: 1.5-2% per transaction

### Rate Limits
- 1,000 requests per second

---

## 4. WHATSAPP BUSINESS API (Notifications)

### Purpose
Send rent reminders, maintenance updates, and payment confirmations.

### Setup

#### 4.1 Business Account Registration
```
1. Go to https://developers.facebook.com
2. Create WhatsApp Business Account
3. Verify phone number: +971-XXX-XXXX
4. Request API access
```

#### 4.2 Configuration
```env
WHATSAPP_BUSINESS_ACCOUNT_ID=...
WHATSAPP_API_URL=https://graph.instagram.com/v18.0
WHATSAPP_BEARER_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
```

#### 4.3 Implementation

**Send Rent Reminder:**
```python
# backend/services/whatsapp_service.py
import requests

class WhatsAppService:
    def __init__(self):
        self.url = os.getenv('WHATSAPP_API_URL')
        self.token = os.getenv('WHATSAPP_BEARER_TOKEN')
        self.phone_id = os.getenv('WHATSAPP_PHONE_NUMBER_ID')
    
    def send_rent_reminder(self, tenant_id, due_date, amount):
        """
        Sends templated rent reminder via WhatsApp
        """
        tenant = get_tenant(tenant_id)
        phone = format_phone_number(tenant['phoneNumber'])  # +971XXXXXXXXX
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "template",
            "template": {
                "name": "rent_reminder",
                "language": {"code": "en_US"},
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": amount},
                            {"type": "text", "text": due_date},
                            {"type": "text", "text": "Your Unit"}
                        ]
                    }
                ]
            }
        }
        
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(
            f"{self.url}/{self.phone_id}/messages",
            json=payload,
            headers=headers
        )
        
        return response.json()
```

**Send Maintenance Update:**
```python
def send_maintenance_notification(self, tenant_id, ticket_id, message):
    """
    Sends maintenance status updates
    """
    tenant = get_tenant(tenant_id)
    phone = format_phone_number(tenant['phoneNumber'])
    
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {
            "preview_url": True,
            "body": message
        }
    }
    
    # ... send request
```

**Scheduled Notifications:**
```python
# Run hourly to send due rent reminders
def send_daily_rent_reminders():
    due_rents = get_rents_due_in_days(days=3)
    
    for rent in due_rents:
        whatsapp = WhatsAppService()
        whatsapp.send_rent_reminder(
            rent['tenantId'],
            rent['dueDate'],
            rent['amount']
        )
```

### Cost Estimate
- Pricing: ~AED 0.20 per message (volume-based)
- **Estimated Monthly**: AED 500-1000 (100-200 tenants, 3 messages each)

### Message Templates (Pre-Approved by Meta)
- `rent_reminder`
- `maintenance_update`
- `payment_received`
- `sos_acknowledgment`

---

## 5. FIREBASE (Cloud Backend)

### Setup

#### 5.1 Initialize Firebase Project
```bash
firebase init --project homeos-uae

# Enable:
# - Cloud Firestore
# - Cloud Storage
# - Cloud Functions
# - Authentication
# - Cloud Messaging
```

#### 5.2 Configuration
```json
{
  "apiKey": "AIzaSy...",
  "authDomain": "homeos-uae.firebaseapp.com",
  "projectId": "homeos-uae",
  "storageBucket": "homeos-uae.appspot.com",
  "messagingSenderId": "...",
  "appId": "...",
  "databaseURL": "https://homeos-uae.firebaseio.com"
}
```

#### 5.3 Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Tenants can access only their own data
    match /tenants/{tenantId} {
      allow read, write: if request.auth.uid == tenantId;
    }
    
    // Owners can access only their own property data
    match /properties/{propertyId} {
      allow read: if resource.data.ownerId == request.auth.uid;
      allow write: if resource.data.ownerId == request.auth.uid && request.auth.token.role == 'OWNER';
    }
    
    // Technicians can only read assigned jobs
    match /jobs/{jobId} {
      allow read: if resource.data.technicianId == request.auth.uid;
      allow write: if resource.data.technicianId == request.auth.uid;
    }
    
    // Admin access
    match /{document=**} {
      allow read, write: if request.auth.token.role == 'ADMIN';
    }
  }
}
```

---

## 6. AWS ALTERNATIVE (Optional)

If using AWS instead of Firebase:

```yaml
Services:
  - RDS (PostgreSQL): Primary database
  - Aurora: Backup replication
  - S3: Photo/video storage
  - Lambda: Cloud functions
  - CloudFront: CDN
  - API Gateway: REST endpoints
  - Cognito: Authentication
  - SNS: Push notifications
```

**Estimated Monthly Cost**: $3,000-5,000 AED

---

## Testing Integration

### 1. Unit Tests
```python
def test_image_analysis():
    analyzer = ImageAnalyzer()
    result = analyzer.analyze_maintenance_image('test_image_url')
    assert 'detectedCategory' in result
    assert 0 <= result['confidence'] <= 1

def test_stripe_payment():
    amount = 100 * 100  # AED 100 in fils
    result = process_payment('OWNER_001', amount)
    assert result['success'] == True
```

### 2. Integration Tests
```python
def test_end_to_end_ticket_creation():
    # Step 1: Tenant uploads photo
    response = client.post('/api/tickets/create', {
        'photoUrl': 'https://example.com/image.jpg',
        'description': 'AC not working'
    })
    assert response.status_code == 201
    ticket_id = response.json()['ticketId']
    
    # Step 2: AI should auto-categorize
    ticket = db.collection('tickets').document(ticket_id).get()
    assert ticket.get('aiAnalysis')['detectedCategory'] in ['AC_ISSUE', 'OTHER']
```

---

## Monitoring & Alerts

Set up monitoring for:
- API response times (target: < 500ms)
- Error rates (target: < 0.1%)
- Image analysis failures
- Payment processing failures
- WhatsApp delivery rate

Use: DataDog, New Relic, or CloudWatch
