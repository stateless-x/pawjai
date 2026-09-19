# Pricing API - Dynamic Price Fetching

Fetch real-time pricing from Stripe instead of hardcoding prices in the frontend.

---

## API Endpoint

### GET `/api/subscriptions/pricing`

**Public endpoint** - No authentication required

Fetches all pricing information from Stripe and calculates savings.

---

## Response Format

```json
{
  "success": true,
  "data": {
    "prices": {
      "thb": {
        "monthly": {
          "priceId": "price_xxx",
          "amount": 9900,
          "currency": "THB",
          "interval": "month",
          "displayAmount": "฿99",
          "tier": "monthly"
        },
        "yearly_discounted": {
          "priceId": "price_yyy",
          "amount": 99900,
          "currency": "THB",
          "interval": "year",
          "displayAmount": "฿999",
          "tier": "yearly_discounted"
        },
        "yearly_default": {
          "priceId": "price_zzz",
          "amount": 118800,
          "currency": "THB",
          "interval": "year",
          "displayAmount": "฿1,188",
          "tier": "yearly_default"
        }
      },
      "usd": {
        "monthly": {
          "priceId": "price_aaa",
          "amount": 299,
          "currency": "USD",
          "interval": "month",
          "displayAmount": "$2.99",
          "tier": "monthly"
        },
        "yearly_discounted": {
          "priceId": "price_bbb",
          "amount": 2999,
          "currency": "USD",
          "interval": "year",
          "displayAmount": "$29.99",
          "tier": "yearly_discounted"
        },
        "yearly_default": {
          "priceId": "price_ccc",
          "amount": 3588,
          "currency": "USD",
          "interval": "year",
          "displayAmount": "$35.88",
          "tier": "yearly_default"
        }
      }
    },
    "savings": {
      "thb": {
        "savingsAmount": 88800,
        "savingsPercent": 16,
        "monthlyEquivalent": 8325
      },
      "usd": {
        "savingsAmount": 589,
        "savingsPercent": 16,
        "monthlyEquivalent": 250
      }
    }
  },
  "message": "Pricing retrieved"
}
```

---

## Frontend Usage

### React Example

```typescript
// hooks/usePricing.ts
import { useEffect, useState } from 'react';

interface PriceInfo {
  priceId: string;
  amount: number;
  currency: string;
  interval: 'month' | 'year';
  displayAmount: string;
  tier: string;
}

interface Pricing {
  thb: {
    monthly: PriceInfo;
    yearly_discounted: PriceInfo;
    yearly_default: PriceInfo;
  };
  usd: {
    monthly: PriceInfo;
    yearly_discounted: PriceInfo;
    yearly_default: PriceInfo;
  };
}

interface Savings {
  savingsAmount: number;
  savingsPercent: number;
  monthlyEquivalent: number;
}

export function usePricing() {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [savings, setSavings] = useState<{ thb: Savings; usd: Savings } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPricing() {
      try {
        const response = await fetch('/api/subscriptions/pricing');
        const data = await response.json();
        
        if (data.success) {
          setPricing(data.data.prices);
          setSavings(data.data.savings);
        } else {
          setError('Failed to fetch pricing');
        }
      } catch (err) {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    }

    fetchPricing();
  }, []);

  return { pricing, savings, loading, error };
}
```

### Using in Component

```typescript
// components/PricingCard.tsx
import { usePricing } from '@/hooks/usePricing';

export function PricingCard() {
  const { pricing, savings, loading, error } = usePricing();
  const currency = 'thb'; // or 'usd' based on user preference

  if (loading) return <div>Loading prices...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!pricing) return null;

  const prices = pricing[currency];
  const currencySavings = savings?.[currency];

  return (
    <div>
      <h2>Premium Subscription</h2>
      
      {/* Monthly Plan */}
      <div className="plan">
        <h3>Monthly</h3>
        <p className="price">{prices.monthly.displayAmount}/month</p>
        <button>Subscribe</button>
      </div>

      {/* Yearly Plan (Discounted) */}
      <div className="plan recommended">
        <span className="badge">Best Value</span>
        <h3>Yearly</h3>
        <p className="price">{prices.yearly_discounted.displayAmount}/year</p>
        <p className="savings">
          Save {currencySavings?.savingsPercent}% 
          ({prices.yearly_discounted.currency === 'THB' ? '฿' : '$'}
          {(currencySavings?.savingsAmount || 0) / 100})
        </p>
        <p className="monthly-equivalent">
          Only {prices.yearly_discounted.currency === 'THB' ? '฿' : '$'}
          {(currencySavings?.monthlyEquivalent || 0) / 100}/month
        </p>
        <button>Subscribe</button>
      </div>
    </div>
  );
}
```

### Next.js Example (Server-Side)

```typescript
// app/pricing/page.tsx
async function getPricing() {
  const res = await fetch('https://your-api.com/api/subscriptions/pricing', {
    next: { revalidate: 3600 } // Cache for 1 hour
  });
  return res.json();
}

export default async function PricingPage() {
  const { data } = await getPricing();
  const { prices, savings } = data;

  return (
    <div>
      <h1>Choose Your Plan</h1>
      
      {/* THB Pricing */}
      <section>
        <h2>Thailand (THB)</h2>
        <div>
          <p>Monthly: {prices.thb.monthly.displayAmount}</p>
          <p>Yearly: {prices.thb.yearly_discounted.displayAmount}</p>
          <p>Save {savings.thb.savingsPercent}%</p>
        </div>
      </section>

      {/* USD Pricing */}
      <section>
        <h2>International (USD)</h2>
        <div>
          <p>Monthly: {prices.usd.monthly.displayAmount}</p>
          <p>Yearly: {prices.usd.yearly_discounted.displayAmount}</p>
          <p>Save {savings.usd.savingsPercent}%</p>
        </div>
      </section>
    </div>
  );
}
```

---

## Benefits

✅ **No Hardcoded Prices** - Prices always match Stripe
✅ **Easy Updates** - Change prices in Stripe dashboard only
✅ **Automatic Formatting** - Currency symbols and formatting handled
✅ **Savings Calculation** - Automatically calculates yearly savings
✅ **Multi-Currency** - THB and USD support
✅ **Type-Safe** - Full TypeScript support

---

## Currency Detection (Geolocation)

The frontend determines which currency to display based on user location.

### Priority Order

1. **Logged-in users with DB country** → Use `profile.detectedCountry`
2. **Guests** → IP geolocation via Cloudflare trace
3. **Fallback** → Browser timezone/language

### Frontend Implementation

```typescript
// lib/utils/currency.ts
export async function detectCurrency(userDetectedCountry?: string | null): Promise<Currency> {
  // Priority 1: Use user's DB-stored country (logged-in users)
  if (userDetectedCountry) {
    return userDetectedCountry === "TH" ? "THB" : "USD";
  }

  // Priority 2: Check localStorage cache (24h TTL)
  const cached = localStorage.getItem("pawjai_currency");
  if (cached && !isExpired()) return cached;

  // Priority 3: IP detection via Cloudflare
  const country = await detectCountryFromIP(); // Cloudflare trace
  return country === "TH" ? "THB" : "USD";
}
```

### Usage in Tier Page

```typescript
// app/tier/page.tsx
const { profile } = useUserData();

React.useEffect(() => {
  const loadCurrency = async () => {
    // Pass user's detectedCountry from DB if logged in
    const detected = await detectCurrency(profile?.detectedCountry);
    setCurrency(detected);
  };
  loadCurrency();
}, [profile?.detectedCountry]);
```

### Geolocation Sync (Logged-in Users)

Country is synced to DB on sign-in/sign-up:

```typescript
// lib/utils/geolocation.ts
export async function syncGeolocation(): Promise<void> {
  // Only sync once per month
  const lastSync = localStorage.getItem("pawjai:geolocation:lastSync");
  if (lastSync && Date.now() - Number(lastSync) < ONE_MONTH_MS) return;

  const detectedCountry = await detectCountryFromIP();
  if (!detectedCountry) return;

  // Update profile if country changed
  const profile = await userService.getProfile();
  if (profile.detectedCountry !== detectedCountry) {
    await userService.updateUserProfile({ detectedCountry });
  }

  localStorage.setItem("pawjai:geolocation:lastSync", String(Date.now()));
}
```

### Key Files

| File | Purpose |
|------|---------|
| `lib/utils/currency.ts` | Currency detection with priority logic |
| `lib/utils/geolocation.ts` | DB sync for logged-in users |
| `app/auth/callback/page.tsx` | Triggers geolocation sync on auth |
| `hooks/useUserData.ts` | Provides `profile.detectedCountry` |

---

## Caching Recommendations

### Frontend Caching

```typescript
// Cache for 1 hour in localStorage
const CACHE_KEY = 'pricing_cache';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

function getCachedPricing() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) return null;

  const { data, timestamp } = JSON.parse(cached);
  const isExpired = Date.now() - timestamp > CACHE_DURATION;
  
  return isExpired ? null : data;
}

function setCachedPricing(data: any) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    data,
    timestamp: Date.now()
  }));
}
```

### Backend Caching (Optional)

Add caching to the pricing service:

```typescript
// In pricingService.ts
import { MemoryCache } from '@/utils/cache';

const pricingCache = new MemoryCache<PricingResponse>(3600); // 1 hour TTL

async getPricing(): Promise<PricingResponse> {
  const cached = pricingCache.get('all_pricing');
  if (cached) {
    logger.info('pricingService.getPricing:cache_hit');
    return cached;
  }

  // ... fetch from Stripe ...
  
  pricingCache.set('all_pricing', pricing);
  return pricing;
}
```

---

## Testing

```bash
# Test the endpoint
curl http://localhost:4000/api/subscriptions/pricing | jq

# Expected response
{
  "success": true,
  "data": {
    "prices": { ... },
    "savings": { ... }
  },
  "message": "Pricing retrieved"
}
```

---

## Error Handling

```typescript
try {
  const response = await fetch('/api/subscriptions/pricing');
  const data = await response.json();
  
  if (!response.ok) {
    // Handle HTTP errors
    console.error('API error:', data.error);
    // Fallback to default prices or show error message
  }
  
  if (!data.success) {
    // Handle application errors
    console.error('Failed to fetch pricing');
  }
} catch (error) {
  // Handle network errors
  console.error('Network error:', error);
  // Show user-friendly error message
}
```

---

## Migration from Hardcoded Prices

### Before (Hardcoded)

```typescript
const PRICES = {
  monthly_thb: '฿99',
  yearly_thb: '฿999',
  monthly_usd: '$2.99',
  yearly_usd: '$29.99',
};
```

### After (Dynamic)

```typescript
const { pricing } = usePricing();

const displayPrice = pricing?.thb.monthly.displayAmount || 'Loading...';
```

---

## Summary

✅ **Created:** `src/services/pricingService.ts`  
✅ **Added:** `GET /api/subscriptions/pricing` endpoint  
✅ **Features:** Dynamic pricing, savings calculation, multi-currency  
✅ **Benefits:** No hardcoded prices, easy updates, always in sync

**Next Steps:**
1. Update frontend to use the new API
2. Remove hardcoded prices
3. Add caching for better performance
4. Test with different currencies

---

**Related Documentation:**
- `docs/CURRENT_PRICING.md` - Current pricing configuration
- `docs/business/SUBSCRIPTIONS.md` - Subscription business logic

