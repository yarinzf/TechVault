import { api, qs } from '../../../services/api';

const productBase = (productId) => `/products/${productId}/reviews`;

export const reviewService = {
  list:           (productId, params = {}) =>
    api.get(`${productBase(productId)}${qs(params)}`).then((r) => r),

  checkEligibility: (productId) =>
    api.get(`${productBase(productId)}/eligibility`).then((r) => r.data),

  create:         (productId, body) =>
    api.post(productBase(productId), body).then((r) => r.data?.review),

  update:         (reviewId, body) =>
    api.patch(`/reviews/${reviewId}`, body).then((r) => r.data?.review),

  remove:         (reviewId) =>
    api.delete(`/reviews/${reviewId}`),
};
