# Share with Vet Feature

## Overview
The "Share with Vet" feature allows pet owners to easily share their pet's health information with veterinarians during clinic visits. This provides vets with a comprehensive view of the pet's health history without requiring them to create an account.

## User Story
As a pet owner, I want to share my pet's health records with my veterinarian so they can quickly understand my pet's medical history during our visit.

## Feature Access
- **Entry Point**: Pet detail page (`/pet/[id]`) via "Share" button next to "Edit"
- **Available to**: All users (free and premium)

## User Flow

### 1. Generate Share Link
1. User navigates to their pet's profile page
2. User clicks "Share" button
3. Modal appears with:
   - QR code for easy scanning at clinic
   - Shareable URL that can be copied
   - Share button for native sharing (mobile)
   - Expiry information (7 days)

### 2. Vet Views Shared Data
1. Vet scans QR code or opens shared link
2. Public page displays pet health summary:
   - Pet profile (name, breed, age, gender, notes, latest weight)
   - Symptom history with dates and notes
   - Medication records
   - Vet visit history
   - (General activity logs are intentionally excluded — only health-related record
     types are shared with vets)
3. Vet can export data as PDF for records

## Subscription Tiers

### Free Plan
- 3 months of health record history
- Full access to share feature

### Premium Plan
- Unlimited health record history
- Full access to share feature

## Privacy & Security

### Data Protection
- No owner contact information is shared
- Share links expire after 7 days
- Signed JWTs, mapped to a short URL code stored in the `vet_share_tokens` table (view count
  and last-viewed timestamp are tracked there — see `docs/technical/SHARE_WITH_VET.md`)
- Rate limiting: 30 requests per minute per IP (distributed via Redis)

### Token Security
- HMAC-SHA256 signed JWTs
- Contains only petId and ownerId
- Server-side verification on each request
- Automatic expiry enforcement

## Localization
- Vet view is English-only
- Designed for international veterinary professionals

## Key Metrics to Track
- Share button clicks
- Share links generated
- Share page views
- PDF exports
- Share link expiry rate

## Future Considerations
- Print-optimized view
- Multiple pets in single share
- Custom date range selection
- Share link revocation
- Share history for users
