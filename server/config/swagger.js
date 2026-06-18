'use strict';

const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

// ─── Reusable schema fragments ────────────────────────────────────────────────
const paginationMeta = {
  type: 'object',
  properties: {
    total:      { type: 'integer', example: 42 },
    page:       { type: 'integer', example: 1 },
    limit:      { type: 'integer', example: 20 },
    totalPages: { type: 'integer', example: 3 },
  },
};

const errorShape = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: {
      type: 'object',
      properties: {
        code:    { type: 'string',  example: 'VALIDATION_ERROR' },
        message: { type: 'string',  example: 'Validation failed' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field:   { type: 'string', example: 'email' },
              message: { type: 'string', example: '"email" must be a valid email' },
            },
          },
        },
      },
    },
  },
};

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TechVault3 API',
      version: '1.0.0',
      description: [
        'Production-grade e-commerce REST API — B.L.A.S.T / A.N.T architecture.',
        '',
        '**Authentication**: Bearer token (access token, 15 min TTL) issued on login.',
        'Refresh token is stored in an HttpOnly cookie and rotated via `POST /auth/refresh`.',
        '',
        '**Correlation IDs**: Every response includes an `X-Correlation-Id` header for tracing.',
        '',
        '**Error shape**: All errors follow `{ success: false, error: { code, message, details[] } }`.',
        '**Success shape**: `{ success: true, message, data, meta? }`.',
      ].join('\n'),
    },
    servers: [
      { url: 'http://localhost:5000/api/v1', description: 'Development' },
      { url: 'https://api.techvault.com/api/v1', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token obtained from `/auth/login` or `/auth/refresh`',
        },
      },
      schemas: {
        // ─── Envelope shapes ────────────────────────────────────────────────
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string',  example: 'Resource retrieved' },
            data:    { type: 'object',  nullable: true },
            meta:    { ...paginationMeta, nullable: true },
          },
        },
        ErrorResponse: errorShape,
        PaginationMeta: paginationMeta,

        // ─── Domain schemas ──────────────────────────────────────────────────
        UserPublic: {
          type: 'object',
          properties: {
            _id:       { type: 'string', example: '665a1f2e8b1c2d3e4f5a6b7c' },
            name:      { type: 'string', example: 'Jane Doe' },
            email:     { type: 'string', format: 'email', example: 'jane@example.com' },
            role:      { type: 'string', enum: ['user', 'admin', 'superadmin', 'warehouse'], example: 'user' },
            isActive:  { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },

        Category: {
          type: 'object',
          properties: {
            _id:  { type: 'string', example: '665b2a3f9c0d1e2f3a4b5c6d' },
            name: { type: 'string', example: 'Laptops' },
            slug: { type: 'string', example: 'laptops' },
          },
        },

        Product: {
          type: 'object',
          properties: {
            _id:              { type: 'string', example: '665c3b4a0d1e2f3a4b5c6d7e' },
            name:             { type: 'string', example: 'MacBook Pro 14"' },
            slug:             { type: 'string', example: 'macbook-pro-14' },
            sku:              { type: 'string', example: 'TV-A1B2C3D4' },
            price:            { type: 'number', example: 1999.99 },
            compareAtPrice:   { type: 'number', example: 2199.99, nullable: true },
            stock:            { type: 'integer', example: 42 },
            salesCount:       { type: 'integer', example: 15 },
            category:         { '$ref': '#/components/schemas/Category' },
            brand:            { type: 'string', example: 'Apple' },
            images:           { type: 'array', items: { type: 'string' }, example: ['https://cdn.example.com/product.jpg'] },
            'ratings.average': { type: 'number', example: 4.7 },
            'ratings.count':   { type: 'integer', example: 83 },
            isPublished:      { type: 'boolean', example: true },
          },
        },

        CartItem: {
          type: 'object',
          properties: {
            product:     { type: 'string', example: '665c3b4a0d1e2f3a4b5c6d7e' },
            name:        { type: 'string', example: 'MacBook Pro 14"' },
            priceAtAdd:  { type: 'number', example: 1999.99 },
            quantity:    { type: 'integer', example: 2 },
            totalPrice:  { type: 'number', example: 3999.98 },
          },
        },

        Order: {
          type: 'object',
          properties: {
            _id:           { type: 'string', example: '665d4c5b1e2f3a4b5c6d7e8f' },
            orderNumber:   { type: 'string', example: 'ORD-20240101-A1B2C3D4' },
            status:        { type: 'string', enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'], example: 'confirmed' },
            paymentStatus: { type: 'string', enum: ['pending', 'paid', 'failed', 'refunded'], example: 'paid' },
            subtotal:      { type: 'number', example: 1999.99 },
            taxAmount:     { type: 'number', example: 339.99 },
            shippingCost:  { type: 'number', example: 0 },
            total:         { type: 'number', example: 2339.98 },
            shippingAddress: {
              type: 'object',
              properties: {
                street:  { type: 'string', example: '123 Main St' },
                city:    { type: 'string', example: 'Tel Aviv' },
                zip:     { type: 'string', example: '61000' },
                country: { type: 'string', example: 'IL' },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },

        Review: {
          type: 'object',
          properties: {
            _id:        { type: 'string' },
            user:       { type: 'string', example: '665a1f2e8b1c2d3e4f5a6b7c' },
            product:    { type: 'string', example: '665c3b4a0d1e2f3a4b5c6d7e' },
            rating:     { type: 'integer', minimum: 1, maximum: 5, example: 5 },
            title:      { type: 'string', example: 'Excellent laptop' },
            body:       { type: 'string', example: 'Fast, quiet, great display.' },
            isVerified: { type: 'boolean', example: true },
            createdAt:  { type: 'string', format: 'date-time' },
          },
        },

        Coupon: {
          type: 'object',
          properties: {
            _id:              { type: 'string' },
            code:             { type: 'string', example: 'SAVE20' },
            type:             { type: 'string', enum: ['percentage', 'fixed'], example: 'percentage' },
            value:            { type: 'number', example: 20 },
            minOrderAmount:   { type: 'number', example: 100 },
            usageLimit:       { type: 'integer', example: 500 },
            isActive:         { type: 'boolean', example: true },
            validFrom:        { type: 'string', format: 'date', example: '2024-01-01' },
            validUntil:       { type: 'string', format: 'date', example: '2024-12-31' },
          },
        },

        Notification: {
          type: 'object',
          properties: {
            _id:       { type: 'string' },
            type:      { type: 'string', enum: ['order_confirmed', 'order_shipped', 'order_delivered', 'promotion', 'system'] },
            title:     { type: 'string', example: 'Order Confirmed' },
            message:   { type: 'string', example: 'Your order ORD-20240101-A1B2C3D4 has been placed.' },
            isRead:    { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },

        Alert: {
          type: 'object',
          properties: {
            _id:        { type: 'string' },
            type:       { type: 'string', enum: ['low_stock', 'refund_spike', 'ranking_drop', 'system'] },
            severity:   { type: 'string', enum: ['info', 'warning', 'critical'] },
            title:      { type: 'string', example: 'Low stock: MacBook Pro 14"' },
            message:    { type: 'string', example: 'Product has 3 unit(s) remaining.' },
            isResolved: { type: 'boolean', example: false },
            createdAt:  { type: 'string', format: 'date-time' },
          },
        },

        AuditLog: {
          type: 'object',
          properties: {
            _id:       { type: 'string' },
            action:    { type: 'string', example: 'order.status_changed' },
            entity:    { type: 'string', example: 'Order' },
            entityId:  { type: 'string' },
            actorId:   { '$ref': '#/components/schemas/UserPublic' },
            actorRole: { type: 'string', example: 'admin' },
            before:    { type: 'object', example: { status: 'confirmed' } },
            after:     { type: 'object', example: { status: 'processing' } },
            ip:        { type: 'string', example: '192.168.1.1', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },

        // ─── Common request bodies ───────────────────────────────────────────
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email:    { type: 'string', format: 'email', example: 'jane@example.com' },
            password: { type: 'string', minLength: 8,    example: 'SecurePass123!' },
          },
        },

        RegisterRequest: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name:     { type: 'string', example: 'Jane Doe' },
            email:    { type: 'string', format: 'email', example: 'jane@example.com' },
            password: { type: 'string', minLength: 8,    example: 'SecurePass123!' },
            phone:    { type: 'string', example: '+972-50-1234567' },
          },
        },

        ShippingAddress: {
          type: 'object',
          required: ['street', 'city', 'zip', 'country'],
          properties: {
            street:   { type: 'string', example: '123 Main St' },
            city:     { type: 'string', example: 'Tel Aviv' },
            state:    { type: 'string', example: 'IL' },
            zip:      { type: 'string', example: '61000' },
            country:  { type: 'string', example: 'IL' },
          },
        },
      },

      // ─── Reusable responses ──────────────────────────────────────────────────
      responses: {
        Unauthorized: {
          description: 'Missing or invalid access token',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/ErrorResponse' },
              example: { success: false, error: { code: 'NO_TOKEN', message: 'No token provided', details: [] } },
            },
          },
        },
        Forbidden: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/ErrorResponse' },
              example: { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions', details: [] } },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/ErrorResponse' },
              example: { success: false, error: { code: 'NOT_FOUND', message: 'Resource not found', details: [] } },
            },
          },
        },
        ValidationError: {
          description: 'Request body failed validation',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Validation failed',
                  details: [{ field: 'email', message: '"email" must be a valid email' }],
                },
              },
            },
          },
        },
      },

      // ─── Reusable parameters ─────────────────────────────────────────────────
      parameters: {
        PageParam: {
          in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 },
          description: 'Page number (1-based)',
        },
        LimitParam: {
          in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          description: 'Items per page (max 100)',
        },
        IdParam: {
          in: 'path', name: 'id', required: true, schema: { type: 'string' },
          description: 'MongoDB ObjectId',
        },
        DateFromParam: {
          in: 'query', name: 'dateFrom', schema: { type: 'string', format: 'date' },
          description: 'Filter from date (inclusive)',
        },
        DateToParam: {
          in: 'query', name: 'dateTo', schema: { type: 'string', format: 'date' },
          description: 'Filter to date (inclusive)',
        },
      },
    },
  },
  apis: [path.join(__dirname, '../routes/*.js')],
};

module.exports = swaggerJsdoc(options);
