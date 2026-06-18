# gemini.md — TechVault3 Backend System
# Single Source of Truth | Last Updated: 2026-03-22

---

## §0. Protocol & Architecture

| Dimension        | Value                                      |
|------------------|--------------------------------------------|
| Protocol         | B.L.A.S.T (Blueprint→Link→Architect→Stylize→Trigger) |
| Architecture     | A.N.T — 3-Layer (Models / Services / Controllers) |
| Runtime          | Node.js 20 LTS                             |
| Framework        | Express 4.x                                |
| Database         | MongoDB (Atlas for prod, local Docker for dev) |
| ODM              | Mongoose 8.x                               |
| Auth             | JWT — Access token (15m) + Refresh token (7d, HttpOnly cookie) |
| Validation       | Joi                                        |
| Testing          | Jest + Supertest + mongodb-memory-server   |
| Docs             | Swagger / OpenAPI 3.0 (swagger-jsdoc)     |
| Monitoring       | Prometheus (prom-client) + Grafana         |
| Logger           | Winston + Morgan                           |
| CI/CD            | Jenkins (Declarative Pipeline)             |
| IaC              | Terraform (AWS VPC, EC2/ECS, ALB)         |

---

## §1. Project Structure

```
TechVault3/
├── src/
│   ├── config/
│   │   ├── db.js              # Mongoose connect w/ retry
│   │   ├── env.js             # Joi env validation + export
│   │   ├── logger.js          # Winston setup
│   │   └── swagger.js         # OpenAPI spec config
│   ├── models/
│   │   ├── User.js
│   │   ├── Category.js        # Dynamic category collection
│   │   ├── Product.js
│   │   ├── Cart.js
│   │   ├── Order.js
│   │   ├── Review.js
│   │   ├── Wishlist.js
│   │   ├── Coupon.js
│   │   └── Notification.js
│   ├── services/              # Business logic layer (ANT Layer 2)
│   │   ├── auth.service.js
│   │   ├── category.service.js
│   │   ├── product.service.js
│   │   ├── cart.service.js
│   │   ├── order.service.js
│   │   ├── review.service.js
│   │   ├── wishlist.service.js
│   │   ├── coupon.service.js
│   │   ├── notification.service.js
│   │   ├── upload.service.js
│   │   └── admin.service.js
│   ├── controllers/           # Request/response layer (ANT Layer 3)
│   │   ├── auth.controller.js
│   │   ├── category.controller.js
│   │   ├── product.controller.js
│   │   ├── cart.controller.js
│   │   ├── order.controller.js
│   │   ├── review.controller.js
│   │   ├── wishlist.controller.js
│   │   ├── coupon.controller.js
│   │   ├── notification.controller.js
│   │   ├── upload.controller.js
│   │   └── admin.controller.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── category.routes.js
│   │   ├── product.routes.js
│   │   ├── cart.routes.js
│   │   ├── order.routes.js
│   │   ├── review.routes.js
│   │   ├── wishlist.routes.js
│   │   ├── coupon.routes.js
│   │   ├── notification.routes.js
│   │   ├── upload.routes.js
│   │   ├── admin.routes.js
│   │   └── system.routes.js
│   ├── middleware/
│   │   ├── auth.js            # JWT verify + RBAC
│   │   ├── validate.js        # Joi middleware factory
│   │   ├── errorHandler.js    # Centralized error + AppError
│   │   ├── rateLimiter.js     # General + auth-specific
│   │   └── metrics.js         # Prometheus middleware
│   ├── validators/
│   │   ├── auth.validator.js
│   │   ├── category.validator.js
│   │   ├── product.validator.js
│   │   ├── cart.validator.js
│   │   ├── order.validator.js
│   │   ├── review.validator.js
│   │   ├── wishlist.validator.js
│   │   ├── coupon.validator.js
│   │   └── upload.validator.js
│   ├── utils/
│   │   ├── jwt.js             # generateAccess, generateRefresh, verify
│   │   ├── response.js        # success() / error() envelope helpers
│   │   ├── email.js           # Nodemailer transport wrapper
│   │   ├── paginate.js        # Pagination helper
│   │   └── stripe.stub.js     # Stripe-ready payment interface stub
│   ├── app.js                 # Express app setup
│   └── server.js              # HTTP server + graceful shutdown
├── tests/
│   ├── unit/
│   │   ├── utils/jwt.test.js
│   │   └── middleware/auth.test.js
│   └── integration/
│       ├── auth.test.js
│       ├── category.test.js
│       ├── products.test.js
│       ├── cart.test.js
│       ├── orders.test.js
│       ├── reviews.test.js
│       ├── wishlist.test.js
│       ├── coupons.test.js
│       └── admin.test.js
├── docker/
│   ├── prometheus.yml
│   └── grafana/
│       ├── datasource.yml
│       └── dashboard.json
├── terraform/
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── Jenkinsfile
└── package.json
```

---

## §2. Data Schema Design

### §2.1 User
```js
{
  _id: ObjectId,
  name: String (required, 2–60 chars),
  email: String (required, unique, lowercase),
  password: String (hashed, bcrypt 12 rounds),
  role: String (enum: ['user', 'admin'], default: 'user'),
  phone: String (optional),
  addresses: [{
    label: String,          // e.g. "Home", "Work"
    street: String,
    city: String,
    zip: String,
    country: String,
    isDefault: Boolean
  }],
  isActive: Boolean (default: true),
  loginAttempts: Number (default: 0),
  lockUntil: Date,
  refreshToken: String,     // stored server-side for rotation/revocation
  createdAt: Date,
  updatedAt: Date
}
// Pre-save: hash password; instance method: comparePassword()
// Index: email (unique)
```

### §2.2 Category
```js
{
  _id: ObjectId,
  name: String (required, unique, 2–50 chars),
  slug: String (unique, auto-generated),
  description: String,
  parentCategory: ObjectId (ref: 'Category', nullable),  // tree support
  image: String (URL),
  isActive: Boolean (default: true),
  createdAt: Date,
  updatedAt: Date
}
// Pre-save: generate slug from name
// Index: slug (unique), name (unique)
```

### §2.3 Product
```js
{
  _id: ObjectId,
  name: String (required, 3–200 chars),
  slug: String (unique, auto-generated),
  description: String (required),
  shortDescription: String,
  sku: String (unique),
  category: ObjectId (ref: 'Category', required),
  brand: String,
  price: Number (required, min: 0),
  compareAtPrice: Number,       // original price for "was/now" display
  taxRate: Number (default: from env TAX_RATE),
  stock: Number (required, min: 0, default: 0),
  images: [String],             // array of URLs
  specs: Map<String, String>,   // key-value technical specs
  tags: [String],
  ratings: {
    average: Number (default: 0),
    count: Number (default: 0)
  },
  isFeatured: Boolean (default: false),
  isPublished: Boolean (default: false),
  createdAt: Date,
  updatedAt: Date
}
// Pre-save: slug from name, SKU generation if empty
// Text index: name, description, brand, tags
// Index: category, sku (unique), slug (unique)
```

### §2.4 Cart
```js
{
  _id: ObjectId,
  user: ObjectId (ref: 'User', required, unique),
  items: [{
    product: ObjectId (ref: 'Product'),
    quantity: Number (min: 1),
    priceAtAdd: Number,         // locked price at time of adding
    _id: false
  }],
  coupon: ObjectId (ref: 'Coupon', nullable),
  createdAt: Date,
  updatedAt: Date
}
// Virtual: subtotal (sum of items priceAtAdd × quantity)
// Virtual: discount (calculated from coupon)
// Virtual: total (subtotal − discount)
// Index: user (unique)
```

### §2.5 Order
```js
{
  _id: ObjectId,
  orderNumber: String (unique, auto-generated: ORD-YYYYMMDD-XXXXX),
  user: ObjectId (ref: 'User', required),
  items: [{
    product: ObjectId (ref: 'Product'),
    name: String,               // snapshot at order time
    sku: String,
    quantity: Number,
    unitPrice: Number,
    totalPrice: Number,
    _id: false
  }],
  shippingAddress: {
    street: String,
    city: String,
    zip: String,
    country: String
  },
  coupon: ObjectId (ref: 'Coupon', nullable),
  subtotal: Number,
  discountAmount: Number (default: 0),
  taxAmount: Number,
  shippingCost: Number (default: 0),
  total: Number,
  status: String (enum: ['pending','confirmed','processing','shipped','delivered','cancelled','refunded']),
  paymentStatus: String (enum: ['unpaid','paid','refunded'], default: 'unpaid'),
  paymentRef: String,           // Stripe PaymentIntent ID (stub for now)
  notes: String,
  createdAt: Date,
  updatedAt: Date
}
// Pre-save: compute totals; auto-generate orderNumber
// Index: user, orderNumber (unique), status
```

### §2.6 Review
```js
{
  _id: ObjectId,
  user: ObjectId (ref: 'User', required),
  product: ObjectId (ref: 'Product', required),
  rating: Number (required, min: 1, max: 5),
  title: String (max: 100),
  body: String (max: 2000),
  isVerifiedPurchase: Boolean (default: false),
  createdAt: Date,
  updatedAt: Date
}
// Compound unique index: { user, product }
// Post-save/remove: recalculate Product.ratings.average + count
```

### §2.7 Wishlist
```js
{
  _id: ObjectId,
  user: ObjectId (ref: 'User', required, unique),
  products: [ObjectId (ref: 'Product')],
  createdAt: Date,
  updatedAt: Date
}
// Index: user (unique)
```

### §2.8 Coupon
```js
{
  _id: ObjectId,
  code: String (required, unique, uppercase),
  type: String (enum: ['percentage', 'fixed']),
  value: Number (required, min: 0),   // % or absolute amount
  minOrderAmount: Number (default: 0),
  maxDiscountAmount: Number,          // cap for percentage coupons
  usageLimit: Number,                 // total uses allowed
  usedCount: Number (default: 0),
  perUserLimit: Number (default: 1),
  userUsage: [{ user: ObjectId, count: Number }],
  validFrom: Date,
  validUntil: Date,
  isActive: Boolean (default: true),
  createdAt: Date,
  updatedAt: Date
}
// Index: code (unique), isActive
```

### §2.9 Notification
```js
{
  _id: ObjectId,
  user: ObjectId (ref: 'User', required),
  type: String (enum: ['order_confirmed','order_shipped','order_delivered','promotion','system']),
  title: String,
  message: String,
  isRead: Boolean (default: false),
  metadata: Object,             // flexible payload (orderId, etc.)
  createdAt: Date
}
// Index: user, isRead, createdAt
```

---

## §3. API Contract

### Base URL
- Development: `http://localhost:5000/api/v1`
- Production:  `https://api.techvault.com/api/v1`

### Response Envelope
```json
// Success
{ "success": true, "data": {}, "message": "OK", "meta": { "page": 1, "total": 100 } }

// Error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] } }
```

### Auth Endpoints
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/auth/register` | Public | Register new user |
| POST | `/auth/login` | Public | Login, set refresh cookie |
| POST | `/auth/refresh` | Public | Issue new access token via cookie |
| POST | `/auth/logout` | Auth | Clear refresh cookie |
| GET | `/auth/me` | Auth | Get own profile |
| PATCH | `/auth/me` | Auth | Update profile |
| PATCH | `/auth/change-password` | Auth | Change password |

### Category Endpoints
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/categories` | Public | List all active categories |
| GET | `/categories/:slug` | Public | Get single category |
| POST | `/categories` | Admin | Create category |
| PATCH | `/categories/:id` | Admin | Update category |
| DELETE | `/categories/:id` | Admin | Soft-delete category |

### Product Endpoints
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/products` | Public | List products (filter, sort, paginate, search) |
| GET | `/products/:slug` | Public | Get single product |
| POST | `/products` | Admin | Create product |
| PATCH | `/products/:id` | Admin | Update product |
| DELETE | `/products/:id` | Admin | Soft-delete (set isPublished=false) |
| GET | `/products/:id/reviews` | Public | Get product reviews |

### Cart Endpoints
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/cart` | Auth | Get own cart |
| POST | `/cart/items` | Auth | Add item to cart |
| PATCH | `/cart/items/:productId` | Auth | Update item quantity |
| DELETE | `/cart/items/:productId` | Auth | Remove item from cart |
| DELETE | `/cart` | Auth | Clear cart |
| POST | `/cart/coupon` | Auth | Apply coupon to cart |
| DELETE | `/cart/coupon` | Auth | Remove coupon from cart |

### Order Endpoints
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/orders` | Auth | Create order from cart |
| GET | `/orders` | Auth | Get own order history |
| GET | `/orders/:id` | Auth | Get single order |
| POST | `/orders/:id/cancel` | Auth | Cancel order (if pending) |
| PATCH | `/orders/:id/status` | Admin | Update order status |
| GET | `/admin/orders` | Admin | List all orders |

### Review Endpoints
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/products/:productId/reviews` | Auth | Create review |
| PATCH | `/reviews/:id` | Auth (owner) | Update review |
| DELETE | `/reviews/:id` | Auth (owner/admin) | Delete review |

### Wishlist Endpoints
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/wishlist` | Auth | Get own wishlist |
| POST | `/wishlist/:productId` | Auth | Add product |
| DELETE | `/wishlist/:productId` | Auth | Remove product |

### Coupon Endpoints
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/coupons/validate` | Auth | Validate coupon code |
| POST | `/coupons` | Admin | Create coupon |
| GET | `/coupons` | Admin | List all coupons |
| PATCH | `/coupons/:id` | Admin | Update coupon |
| DELETE | `/coupons/:id` | Admin | Deactivate coupon |

### Notification Endpoints
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/notifications` | Auth | Get own notifications |
| PATCH | `/notifications/:id/read` | Auth | Mark as read |
| DELETE | `/notifications/:id` | Auth | Delete notification |

### Upload Endpoints
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/upload/image` | Admin | Upload image (returns URL; S3-ready) |

### Admin Endpoints
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/admin/dashboard` | Admin | Revenue, orders, users summary |
| GET | `/admin/users` | Admin | List all users |
| PATCH | `/admin/users/:id` | Admin | Update user role/status |
| GET | `/admin/analytics/revenue` | Admin | Revenue by period |
| GET | `/admin/analytics/top-products` | Admin | Top selling products |

### System Endpoints
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/health` | Public | Service health check |
| GET | `/metrics` | Internal | Prometheus scrape endpoint |

---

## §4. Auth Flow

```
Register → hash password → save User → return tokens
Login    → verify password → check lockout → issue accessToken (15m) + refreshToken (7d, HttpOnly cookie)
Request  → Authorization: Bearer <accessToken>
Refresh  → read cookie → verify refreshToken → rotate → new accessToken
Logout   → clear cookie → null refreshToken in DB
```

**Lockout:** 5 failed attempts → lock account for 30 minutes.
**Token rotation:** New refreshToken issued on every /refresh call.

---

## §5. Payment Stub (Stripe-Ready)

`src/utils/stripe.stub.js` will export:
```js
createPaymentIntent(amount, currency, metadata) → { id, clientSecret, status }
confirmPayment(paymentIntentId) → { success, status }
refund(paymentIntentId, amount) → { success, refundId }
```
All methods return mock responses. Drop-in replaceable with real Stripe SDK by swapping the implementation.

---

## §6. Image Upload Strategy

**Now:** Multer (memory storage) → save URL in DB. No file system writes.
**S3-Ready:** `upload.service.js` exposes `uploadImage(file)` → returns URL string. To enable S3: swap body to `s3.upload()` call with no interface change.

---

## §7. Search Strategy

- **MongoDB Text Index** on `Product`: `{ name, description, brand, tags }`
- Query via `$text: { $search: query }` with score sorting
- Endpoint: `GET /products?search=keyword`
- Future upgrade path: Elasticsearch (index same fields via change stream)

---

## §8. Security Policies

| Policy | Implementation |
|--------|---------------|
| Password hashing | bcrypt, 12 salt rounds |
| JWT access TTL | 15 minutes |
| JWT refresh TTL | 7 days, HttpOnly cookie |
| Rate limiting (general) | 100 req / 15 min / IP |
| Rate limiting (auth) | 10 req / 15 min / IP |
| CORS | Whitelist from `ALLOWED_ORIGINS` env |
| Helmet | All defaults enabled |
| Input validation | Joi on all mutating routes |
| RBAC | `user` vs `admin` enforced per-route |
| SQL/NoSQL injection | Mongoose sanitization + express-mongo-sanitize |

---

## §9. Environment Variables

```env
# App
NODE_ENV=development
PORT=5000
API_VERSION=v1

# MongoDB
MONGO_URI_DEV=mongodb://localhost:27017/techvault
MONGO_URI_PROD=mongodb+srv://<user>:<pass>@cluster.mongodb.net/techvault

# JWT
JWT_ACCESS_SECRET=<strong-secret>
JWT_REFRESH_SECRET=<strong-secret>
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Cookies
COOKIE_SECRET=<strong-secret>

# Tax
TAX_RATE=0.17

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://techvault.com

# Email (Nodemailer)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=<user>
SMTP_PASS=<pass>
EMAIL_FROM=noreply@techvault.com

# Upload
UPLOAD_MAX_SIZE_MB=5

# Stripe (stub — no live key needed)
STRIPE_SECRET_KEY=sk_test_stub

# Monitoring
METRICS_PATH=/metrics
```

---

## §10. Monitoring & Observability

| Signal | Tool | Details |
|--------|------|---------|
| Metrics | Prometheus + prom-client | HTTP request duration histogram, counter, active connections |
| Dashboards | Grafana | Provisioned datasource + Node.js dashboard |
| Logs | Winston | JSON format, daily rotate file + console |
| Access logs | Morgan | Combined format, piped to Winston stream |
| Health | `/health` route | DB ping, uptime, memory, env |

---

## §11. DevOps

### Docker
- **Dockerfile:** Multi-stage (builder → production), Node 20-alpine, non-root user `node`, HEALTHCHECK
- **docker-compose.yml:** Services: `app`, `mongodb`, `prometheus`, `grafana` with named volumes

### CI/CD (Jenkins)
```
Checkout → npm ci → lint → test → build Docker image → push to registry → deploy (SSH / kubectl)
```

### Terraform (AWS)
- VPC + public/private subnets
- EC2 or ECS Fargate (configurable)
- ALB with HTTPS listener
- Security groups (80/443 public, 5000 internal)
- Outputs: ALB DNS, instance IDs

---

## §12. Testing Strategy

| Layer | Tool | Isolation |
|-------|------|-----------|
| Unit (utils, middleware) | Jest | No network, mock modules |
| Integration (routes) | Jest + Supertest | mongodb-memory-server |
| Manual (smoke) | REST client / browser | Running dev server |

All tests run with `cross-env NODE_ENV=test`.

---
*This file is the single source of truth. All implementation must reference this document.*
