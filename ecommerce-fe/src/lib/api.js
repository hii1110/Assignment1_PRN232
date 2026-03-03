// src/lib/api.js
// Đọc base từ ENV, fallback về localhost khi dev.
const BASE_URL = (import.meta.env.VITE_API_BASE || 'http://localhost:5173').replace(/\/$/, '');

let authToken = null;

export function setAuthToken(token) {
  authToken = token || null;
}

async function http(path, { method = 'GET', data } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }

  // Tránh lỗi khi body rỗng (vd: DELETE 204)
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  // auth
  register: (payload) => http('/api/auth/register', { method: 'POST', data: payload }),
  login: (payload) => http('/api/auth/login', { method: 'POST', data: payload }),

  // products
  listProducts: () => http('/api/products'),
  getProduct: (id) => http(`/api/products/${id}`),
  createProduct: (payload) => http('/api/products', { method: 'POST', data: payload }),
  updateProduct: (id, payload) => http(`/api/products/${id}`, { method: 'PUT', data: payload }),
  deleteProduct: (id) => http(`/api/products/${id}`, { method: 'DELETE' }),

  // cart
  getCart: () => http('/api/cart'),
  addToCart: (payload) => http('/api/cart/items', { method: 'POST', data: payload }),
  updateCartItem: (id, payload) => http(`/api/cart/items/${id}`, { method: 'PUT', data: payload }),
  removeCartItem: (id) => http(`/api/cart/items/${id}`, { method: 'DELETE' }),

  // orders
  placeOrder: () => http('/api/orders', { method: 'POST' }),
  listOrders: () => http('/api/orders'),
  getOrder: (id) => http(`/api/orders/${id}`),
  payOrder: (id) => http(`/api/orders/${id}/pay`, { method: 'POST' }),
};
