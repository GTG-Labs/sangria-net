// CSRF Protection utilities (Server and Client-side compatible)

import { useState, useEffect } from "react";

// Client-side CSRF token utilities
// Note: All token generation and validation happens server-side
//
// 403 Recovery Pattern:
// When API calls return 403 (Invalid CSRF token), callers should:
// 1. Call refresh() from useCSRFToken to get a fresh token
// 2. Retry the original request with the new token
// 3. This avoids requiring a full page reload for token expiry
//
// Automatic Recovery Helper:
// Use handleAPICall() wrapper for automatic 403 retry logic

// Store CSRF token in cookie (client-side only)
export function setToken(token: string): void {
  if (typeof window !== 'undefined') {
    // Store in cookie for cross-origin sharing with backend
    document.cookie = `csrf_token=${token}; path=/; SameSite=Lax`;
    // Also keep in sessionStorage as backup
    sessionStorage.setItem('csrf_token', token);
  }
}

// Get CSRF token from cookie (matches backend expectation)
export function getToken(): string | null {
  if (typeof window !== 'undefined') {
    // Try cookie first (matches backend)
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'csrf_token') {
        return value;
      }
    }

    // Fallback to sessionStorage
    return sessionStorage.getItem('csrf_token');
  }
  return null;
}

// Clear CSRF token from both storage methods
function clearToken(): void {
  if (typeof window !== 'undefined') {
    // Clear cookie
    document.cookie = 'csrf_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    // Clear sessionStorage
    sessionStorage.removeItem('csrf_token');
  }
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

/**
 * React hook for CSRF protection - fetches server-generated tokens
 *
 * @returns Object containing:
 *   - token: Current CSRF token (null if not loaded)
 *   - refresh: Function to clear cached token and fetch a new one
 *   - addToFormData: Function to add current token to FormData
 *   - addToJSON: Function to add current token to JSON payload
 *
 * Usage for 403 recovery:
 * ```
 * const { refresh } = useCSRFToken();
 *
 * try {
 *   await apiCall();
 * } catch (error) {
 *   if (error.status === 403) {
 *     await refresh();
 *     await apiCall(); // Retry with fresh token
 *   }
 * }
 * ```
 */
export function useCSRFToken() {
  const [token, setTokenState] = useState<string | null>(() => {
    // Get existing token from storage if available
    if (typeof window === 'undefined') return null;
    return getToken();
  });

  // Fetch a new CSRF token from the backend (via frontend proxy)
  const fetchToken = async () => {
    try {
      const response = await fetch('/api/csrf-token', {
        credentials: 'include', // Include cookies for CSRF token storage
      });

      if (response.ok) {
        const data = await response.json();
        const serverToken = data.csrf_token;
        if (serverToken) {
          setToken(serverToken);
          setTokenState(serverToken);
          return serverToken;
        }
      }
      throw new Error(`Failed to fetch CSRF token: ${response.status}`);
    } catch (error) {
      console.error('Failed to fetch CSRF token:', error);
      throw error;
    }
  };

  // Refresh the CSRF token (clears cached token and fetches a new one)
  const refresh = async (): Promise<string | null> => {
    // Clear stored token and state
    clearToken();
    setTokenState(null);

    try {
      return await fetchToken();
    } catch (error) {
      console.error('Failed to refresh CSRF token:', error);
      return null;
    }
  };

  // Fetch server-generated token if not available
  useEffect(() => {
    if (typeof window === 'undefined' || token) return;
    fetchToken().catch(() => {
      // Error already logged in fetchToken
    });
  }, [token]);

  // Create token-aware versions of helper functions that use hook state
  const addToFormData = (formData: FormData): FormData => {
    if (token) {
      formData.append('csrf_token', token);
    }
    return formData;
  };

  const addToJSON = <T extends object>(data: T): T & { csrf_token?: string } => {
    const currentToken = getToken();
    if (currentToken) {
      return { ...data, csrf_token: currentToken };
    }
    return data;
  };

  // Automatic retry helper for 403 CSRF errors
  const handleAPICall = async <T>(apiCall: () => Promise<T>): Promise<T> => {
    try {
      return await apiCall();
    } catch (error: unknown) {
      // Check if this is a 403 CSRF error
      const isCSRFError = (
        (error && typeof error === 'object' && 'status' in error && error.status === 403) ||
        (error instanceof Response && error.status === 403)
      );

      if (isCSRFError) {
        // Try to refresh token and retry once
        console.log('CSRF token invalid, refreshing...');
        const newToken = await refresh();

        if (newToken) {
          // Retry the original API call with fresh token
          return await apiCall();
        }
      }

      // Re-throw if not a CSRF error or refresh failed
      throw error;
    }
  };

  return {
    token,
    refresh,
    addToFormData,
    addToJSON,
    handleAPICall,
  };
}