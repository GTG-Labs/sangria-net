// Server-side CSRF Protection utilities
import { cookies } from 'next/headers';
import crypto from 'crypto';

export class ServerCSRFProtection {
  // Generate a secure CSRF token (server-side)
  static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Set CSRF token in HttpOnly cookie (server-side)
  static async setTokenCookie(token: string): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set('csrf_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60, // 1 hour
    });
  }

  // Get CSRF token from HttpOnly cookie (server-side)
  static async getTokenFromCookie(): Promise<string | null> {
    try {
      const cookieStore = await cookies();
      return cookieStore.get('csrf_token')?.value || null;
    } catch {
      return null;
    }
  }

  // Validate CSRF token with timing-safe comparison (server-side)
  static async validateToken(submittedToken: string): Promise<boolean> {
    try {
      const storedToken = await this.getTokenFromCookie();
      if (!storedToken || !submittedToken) {
        return false;
      }

      // Convert strings to buffers for timing-safe comparison
      const storedBuffer = Buffer.from(storedToken, 'utf8');
      const submittedBuffer = Buffer.from(submittedToken, 'utf8');

      // Ensure both tokens are the same length
      if (storedBuffer.length !== submittedBuffer.length) {
        return false;
      }

      // Timing-safe comparison to prevent timing attacks
      return crypto.timingSafeEqual(storedBuffer, submittedBuffer);
    } catch {
      return false;
    }
  }

  // Middleware helper for CSRF validation
  static async validateRequestToken(request: Request): Promise<boolean> {
    try {
      let submittedToken: string | null = null;

      // First check X-CSRF-Token header (preferred method used by fetch wrapper)
      submittedToken = request.headers.get('X-CSRF-Token') || request.headers.get('x-csrf-token');

      // Fall back to JSON body if header not present
      if (!submittedToken && request.headers.get('content-type')?.includes('application/json')) {
        const body = await request.json();
        submittedToken = body.csrf_token;
      }

      // Fall back to FormData if neither header nor JSON body contains token
      if (!submittedToken) {
        try {
          const formData = await request.formData();
          submittedToken = formData.get('csrf_token')?.toString() || null;
        } catch {
          // Ignore FormData parsing errors if request isn't multipart/form-data
        }
      }

      if (!submittedToken) {
        return false;
      }

      return this.validateToken(submittedToken);
    } catch {
      return false;
    }
  }
}

// Route handler for CSRF token generation
export async function generateCSRFTokenResponse(): Promise<Response> {
  try {
    const token = ServerCSRFProtection.generateToken();
    await ServerCSRFProtection.setTokenCookie(token);

    return new Response(JSON.stringify({ csrf_token: token }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Failed to generate CSRF token:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate CSRF token' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}