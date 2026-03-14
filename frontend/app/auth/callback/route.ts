import { handleAuth } from "@workos-inc/authkit-nextjs";

export const GET = handleAuth({
  onSuccess: async (authData: { user?: any; accessToken?: string }) => {
    // Validate required data and fail fast
    const accessToken = authData.accessToken;
    if (!accessToken) {
      throw new Error("No access token received from WorkOS");
    }

    if (!process.env.BACKEND_URL) {
      throw new Error("BACKEND_URL environment variable is not set");
    }

    // Call Go backend to upsert user record on login
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${process.env.BACKEND_URL}/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to upsert user: ${response.status} ${errorText}`,
        );
      }

      console.log("User record upserted successfully");
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error(`Error upserting user: ${error}`);
      }
    }
  },
});
