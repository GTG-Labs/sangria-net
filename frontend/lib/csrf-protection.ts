// CSRF Protection utilities (Client-side only)
import { useState, useEffect } from 'react';

// Client-side CSRF token utilities
// Note: All token generation and validation happens server-side

// Store CSRF token in sessionStorage (client-side only)
function setToken(token: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('csrf_token', token);
  }
}

// Get CSRF token from storage
function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('csrf_token');
  }
  return null;
}

// Add CSRF token to form data
export function addTokenToFormData(formData: FormData): FormData {
  const token = getToken();
  if (token) {
    formData.append('csrf_token', token);
  }
  return formData;
}

// Add CSRF token to JSON payload with proper typing
export function addTokenToJSON<T extends object>(data: T): T & { csrf_token?: string } {
  const token = getToken();
  if (token) {
    return { ...data, csrf_token: token };
  }
  return data;
}

// React hook for CSRF protection - fetches server-generated tokens
export function useCSRFToken() {
  const [token, setTokenState] = useState<string | null>(() => {
    // Get existing token from storage if available
    if (typeof window === 'undefined') return null;
    return getToken();
  });

  // Fetch server-generated token if not available
  useEffect(() => {
    if (typeof window === 'undefined' || token) return;

    const fetchToken = async () => {
      try {
        const response = await fetch('/api/csrf-token');
        if (response.ok) {
          const data = await response.json();
          const serverToken = data.csrf_token;
          if (serverToken) {
            setToken(serverToken);
            setTokenState(serverToken);
          }
        }
      } catch (error) {
        console.error('Failed to fetch CSRF token:', error);
      }
    };

    fetchToken();
  }, [token]);

  return {
    token,
    addToFormData: addTokenToFormData,
    addToJSON: addTokenToJSON,
  };
}