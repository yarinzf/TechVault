import { api } from '../../../services/api';

export const couponService = {
  // Returns { coupon: { code, type, value }, discount, finalTotal }
  // Throws on invalid / expired / limit-reached — caller shows the error message
  async validate(code, subtotal) {
    const { data } = await api.post('/coupons/validate', {
      code:     code.trim().toUpperCase(),
      subtotal: Number(subtotal),
    });
    return data;
  },
};
