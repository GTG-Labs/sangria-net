import { NextResponse } from "next/server";

// GET /api → free endpoint
export async function GET() {
  return NextResponse.json({ message: "Hello! This endpoint is free." });
}
