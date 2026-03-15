import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authenticated user and access token from session
    const { user, accessToken } = await withAuth();

    if (!user || !accessToken) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Get API key ID from params
    const { id } = await params;

    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      // Forward request to backend with access token
      const response = await fetch(`${BACKEND_URL}/api-keys/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
      }

      return new NextResponse(null, { status: 204 });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      // Check if request was aborted due to timeout
      if (fetchError.name === 'AbortError' || controller.signal.aborted) {
        return NextResponse.json(
          { error: "Gateway timeout - backend request took too long" },
          { status: 504 }
        );
      }

      // Re-throw other fetch errors to be handled by outer catch
      throw fetchError;
    }
  } catch (error) {
    console.error("API Keys DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}