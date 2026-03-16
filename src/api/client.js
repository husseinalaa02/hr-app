import axios from 'axios';

const BASE_URL = import.meta.env.VITE_ERPNEXT_URL || 'http://localhost:8080';
const API_KEY = import.meta.env.VITE_API_KEY || '';
const API_SECRET = import.meta.env.VITE_API_SECRET || '';

const client = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Attach auth header on every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers['Authorization'] = `token ${token}`;
  } else if (API_KEY && API_SECRET) {
    config.headers['Authorization'] = `token ${API_KEY}:${API_SECRET}`;
  }
  return config;
});

// Global response error handler
client.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_info');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
