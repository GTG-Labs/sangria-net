import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();

  // Call backend directly (no auth required)
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";

  try {
    const response = await fetch(`${backendUrl}/accept-invitation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.text();

    return new NextResponse(data, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Failed to accept invitation:", error);
    return NextResponse.json(
      { error: "Failed to connect to backend" },
      { status: 500 }
    );
  }
}