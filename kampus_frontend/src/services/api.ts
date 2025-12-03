import axios, { AxiosError } from 'axios';

// Use 'any' for config to avoid import issues with InternalAxiosRequestConfig
// which might be a type-only export.
type AxiosConfig = any; 

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
});

function getAccessToken(): string | null {
  return localStorage.getItem('accessToken');
}

function getRefreshToken(): string | null {
  return localStorage.getItem('refreshToken');
}

function setAccessToken(token: string) {
  localStorage.setItem('accessToken', token);
}

api.interceptors.request.use((config: AxiosConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers = {
      ...(config.headers || {}),
      Authorization: `Bearer ${token}`,
    };
  }
  return config;
});

let isRefreshing = false;
let pendingRequests: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as AxiosConfig & { _retry?: boolean };
    
    if (error.response?.status === 401 && !original._retry) {
      const refresh = getRefreshToken();
      if (!refresh) {
        return Promise.reject(error);
      }
      
      original._retry = true;

      if (isRefreshing) {
        return new Promise((resolve) => {
          pendingRequests.push((token: string) => {
            original.headers = {
              ...(original.headers || {}),
              Authorization: `Bearer ${token}`,
            };
            resolve(api(original));
          });
        });
      }

      isRefreshing = true;

      try {
        const response = await axios.post(`${API_BASE_URL}/api/token/refresh/`, { refresh });
        const newAccess = response.data.access;
        
        setAccessToken(newAccess);
        
        pendingRequests.forEach((cb) => cb(newAccess));
        pendingRequests = [];
        isRefreshing = false;

        original.headers = {
          ...(original.headers || {}),
          Authorization: `Bearer ${newAccess}`,
        };
        
        return api(original);
      } catch (err) {
        isRefreshing = false;
        pendingRequests = [];
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        return Promise.reject(err);
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/api/token/', { username, password }),
  me: () => api.get('/api/users/me/'),
};
