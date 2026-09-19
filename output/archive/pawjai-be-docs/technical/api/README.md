# API Documentation

Technical documentation for backend API endpoints.

---

## Available Guides

### Pricing & Subscriptions
- **[PRICING.md](./PRICING.md)** - Dynamic pricing API (`GET /api/subscriptions/pricing`)
- **[SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md)** - Subscription management endpoints

---

## API Conventions

### Response Format
All API responses follow this envelope structure:
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Format
`error` is always a plain string, `code` sits at the root alongside it — never nested as
`{ message, code }`. See `CLAUDE.md` "API Responses" for the full wire format and the known
error codes.
```json
{
  "success": false,
  "error": "Human-readable error description",
  "code": "ERROR_CODE"
}
```

### Authentication
- Uses Supabase JWT tokens
- Include in Authorization header: `Bearer <token>`
- Middleware validates token and extracts user ID

### Pagination
Paginated endpoints return:
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

---

**Last Updated:** 2025-11-21
