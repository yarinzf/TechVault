# TechVault3 — System Architecture

## Stack
- **Runtime**: Node.js 20 LTS + Express 4.x
- **Database**: MongoDB 7 + Mongoose 8 (transactions, aggregation pipelines)
- **Auth**: JWT (15m access / 7d refresh), bcryptjs, HttpOnly cookies
- **Validation**: Joi
- **Observability**: Winston + DailyRotateFile, Prometheus (prom-client), correlation IDs
- **Jobs**: node-cron (cleanup + alert processing)
- **Docs**: Swagger / OpenAPI 3.0

---

## Layer Architecture (A.N.T — three-layer)

```
┌─────────────────────────────────────────────────────────┐
│                      HTTP Clients                        │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│               Express Middleware Stack                    │
│  Helmet · CORS · mongoSanitize · JSON · cookieParser      │
│  rateLimiter · metricsMiddleware · correlationId          │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                    Routes  (Layer 1)                      │
│  /auth  /products  /cart  /orders  /admin                 │
│  /reviews  /wishlist  /coupons  /notifications            │
│  FeatureFlag middleware guards optional modules           │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                Controllers  (Layer 2)                     │
│  Extract req params → call service → sendSuccess         │
│  All errors passed to next(err) → global errorHandler    │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                 Services  (Layer 3)                       │
│  Business logic, DB queries, Mongoose transactions        │
│  Non-fatal side-effects: notify(), audit.log()            │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│               MongoDB (via Mongoose)                      │
│  User · Product · Category · Cart · Order                 │
│  Review · Wishlist · Coupon · Notification                │
│  Alert · AuditLog                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Full Request-Flow Diagram

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as Middleware Stack
    participant R as Router
    participant CT as Controller
    participant S as Service
    participant DB as MongoDB

    C->>MW: HTTP Request
    MW->>MW: helmet / cors / sanitize
    MW->>MW: rateLimiter
    MW->>MW: correlationId (attach X-Correlation-Id)
    MW->>MW: authenticate (JWT → req.user)
    MW->>R: route matched
    R->>R: featureFlag check
    R->>R: authorize (RBAC)
    R->>R: validate (Joi)
    R->>CT: req, res, next
    CT->>S: call service function
    S->>DB: Mongoose query / transaction
    DB-->>S: result
    S-->>CT: data
    CT-->>C: sendSuccess (JSON)

    note over S: Side-effects (non-fatal)
    S-)DB: notify() — Notification.create
    S-)DB: audit.log() — AuditLog.create
```

---

## Module Map

```mermaid
graph TD
    subgraph "Auth Module"
        A1[auth.routes] --> A2[auth.controller]
        A2 --> A3[auth.service]
        A3 --> M1[(User)]
    end

    subgraph "Product Module"
        P1[product.routes] --> P2[product.controller]
        P2 --> P3[product.service]
        P3 --> M2[(Product)]
        P3 --> M3[(Category)]
    end

    subgraph "Cart Module"
        CA1[cart.routes] --> CA2[cart.controller]
        CA2 --> CA3[cart.service]
        CA3 --> M4[(Cart)]
        CA3 --> M2
    end

    subgraph "Order Module"
        O1[order.routes] --> O2[order.controller]
        O2 --> O3[order.service]
        O3 --> M5[(Order)]
        O3 --> M4
        O3 --> M2
        O3 --> NS[notification.service]
        O3 --> AS[audit.service]
    end

    subgraph "Admin Module"
        AD1[admin.routes] --> AD2[admin.controller]
        AD2 --> AD3[admin.service]
        AD3 --> M5
        AD3 --> M1
        AD3 --> M2
        AD3 --> ALT[(Alert)]
        AD3 --> AUD[(AuditLog)]
    end

    subgraph "Engagement Modules"
        R1[review.routes] --> R2[review.service]
        R2 --> M6[(Review)]
        R2 --> M2

        W1[wishlist.routes] --> W2[wishlist.service]
        W2 --> M7[(Wishlist)]

        CP1[coupon.routes] --> CP2[coupon.service]
        CP2 --> M8[(Coupon)]

        N1[notification.routes] --> N2[notification.service]
        N2 --> M9[(Notification)]
    end

    subgraph "Background Jobs"
        J1[jobs/index.js] -->|"daily 02:00"| J2[cleanupCarts.job]
        J1 -->|"hourly"| J3[processAlerts.job]
        J3 --> ALT
        J2 --> M4
    end

    subgraph "Cross-cutting"
        MW1[correlationId]
        MW2[featureFlag]
        MW3[rateLimiter]
        MW4[authenticate/authorize]
        MW5[errorHandler]
        MW6[metricsMiddleware]
    end
```

---

## Data Model Relationships

```mermaid
erDiagram
    USER {
        ObjectId _id
        string name
        string email
        string role
        boolean isActive
    }
    CATEGORY {
        ObjectId _id
        string name
        string slug
    }
    PRODUCT {
        ObjectId _id
        string name
        string slug
        ObjectId category
        number price
        number stock
        number salesCount
        boolean isPublished
        boolean isDeleted
    }
    CART {
        ObjectId _id
        ObjectId user
        array items
    }
    ORDER {
        ObjectId _id
        string orderNumber
        ObjectId user
        string status
        string paymentStatus
        number total
    }
    REVIEW {
        ObjectId _id
        ObjectId user
        ObjectId product
        number rating
    }
    WISHLIST {
        ObjectId _id
        ObjectId user
        array products
    }
    COUPON {
        ObjectId _id
        string code
        string type
        number value
    }
    NOTIFICATION {
        ObjectId _id
        ObjectId user
        string type
        boolean isRead
    }
    ALERT {
        ObjectId _id
        string type
        string severity
        string dedupKey
        boolean isResolved
    }
    AUDITLOG {
        ObjectId _id
        string action
        string entity
        ObjectId entityId
        ObjectId actorId
        object before
        object after
    }

    USER ||--o{ CART : "has one"
    USER ||--o{ ORDER : "places"
    USER ||--o{ REVIEW : "writes"
    USER ||--o| WISHLIST : "has one"
    PRODUCT ||--o{ REVIEW : "receives"
    PRODUCT }o--|| CATEGORY : "belongs to"
    ORDER }o--|| USER : "placed by"
    CART }o--|| USER : "owned by"
    COUPON ||--o{ ORDER : "applied to"
    NOTIFICATION }o--|| USER : "sent to"
    AUDITLOG }o--|| USER : "actor"
    ALERT }o--o| PRODUCT : "entity ref"
    ALERT }o--o| ORDER : "entity ref"
```

---

## API Surface

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Register |
| POST | `/auth/login` | — | Login |
| POST | `/auth/refresh` | cookie | Rotate refresh token |
| POST | `/auth/logout` | Bearer | Logout |
| GET | `/auth/me` | Bearer | Own profile |
| PATCH | `/auth/me` | Bearer | Update profile |
| PATCH | `/auth/change-password` | Bearer | Change password |
| GET | `/products` | — | List products |
| GET | `/products/autocomplete` | — | Typeahead |
| GET | `/products/:slug` | — | Product detail |
| POST | `/products` | admin | Create product |
| PATCH | `/products/:id` | admin | Update product |
| DELETE | `/products/:id` | admin | Soft-delete |
| GET | `/products/:productId/reviews` | — | List reviews |
| POST | `/products/:productId/reviews` | Bearer | Create review |
| PATCH | `/reviews/:id` | Bearer | Update own review |
| DELETE | `/reviews/:id` | Bearer | Delete own review |
| GET | `/cart` | Bearer | Get cart |
| POST | `/cart` | Bearer | Add item |
| PATCH | `/cart/:productId` | Bearer | Update quantity |
| DELETE | `/cart/:productId` | Bearer | Remove item |
| DELETE | `/cart` | Bearer | Clear cart |
| POST | `/orders` | Bearer | Create order from cart |
| GET | `/orders` | Bearer | List own orders |
| GET | `/orders/all` | admin | List all orders |
| GET | `/orders/:id` | Bearer | Get order |
| PATCH | `/orders/:id/cancel` | Bearer | Cancel order |
| PATCH | `/orders/:id/status` | staff | Update status |
| GET | `/wishlist` | Bearer | Get wishlist |
| POST | `/wishlist` | Bearer | Add to wishlist |
| DELETE | `/wishlist/:productId` | Bearer | Remove from wishlist |
| GET | `/coupons/:code/validate` | Bearer | Validate coupon |
| POST | `/coupons` | admin | Create coupon |
| PATCH | `/coupons/:id/deactivate` | admin | Deactivate coupon |
| GET | `/notifications` | Bearer | List notifications |
| PATCH | `/notifications/read-all` | Bearer | Mark all read |
| PATCH | `/notifications/:id/read` | Bearer | Mark one read |
| DELETE | `/notifications/:id` | Bearer | Delete notification |
| GET | `/admin/dashboard` | admin | Dashboard summary |
| GET | `/admin/analytics/revenue` | admin | Revenue analytics |
| GET | `/admin/analytics/top-products` | admin | Top products |
| GET | `/admin/alerts` | admin | List alerts |
| PATCH | `/admin/alerts/:id/resolve` | admin | Resolve alert |
| GET | `/admin/audit-logs` | superadmin | Audit log |
| GET | `/admin/users` | superadmin | List users |
| PATCH | `/admin/users/:id` | superadmin | Update user |
| GET | `/health` | — | Health check |
| GET | `/metrics` | — | Prometheus metrics |

---

## Security Controls

| Layer | Control |
|-------|---------|
| Transport | HTTPS in prod, HSTS via Helmet |
| Headers | Helmet (CSP, X-Frame-Options, etc.) |
| Input | express-mongo-sanitize (NoSQL injection), Joi schema validation |
| Body | 10 KB size limit |
| Auth | JWT RS256-compatible secret, 15m access token lifetime |
| Sessions | Refresh token stored in DB — revocable on logout |
| Rate limiting | 100 req/15m general, 10 req/15m on auth routes |
| RBAC | 4-tier: user → warehouse → admin → superadmin |
| Brute force | Account lockout after failed login attempts |

---

## Observability

| Signal | Tool | Details |
|--------|------|---------|
| Structured logs | Winston + DailyRotateFile | JSON in prod, pretty in dev; error log separate |
| Correlation IDs | X-Correlation-Id header | Per-request tracing across logs |
| Metrics | Prometheus (prom-client) | HTTP duration histogram, request counter, active connections |
| Audit trail | AuditLog model | Before/after snapshots for all critical mutations |
| Alerting | Alert model + cron | Low stock, refund spikes, ranking drops |
