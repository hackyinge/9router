import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getRequestDetails } from "@/lib/usageDb";

/**
 * GET /api/usage/request-details
 * Query parameters: page, pageSize (1-100), apiKeyId, apiKeyName, provider, model, connectionId, status, startDate, endDate
 */
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "openrouterx-default-secret-change-me"
);

async function getSubUserId(request) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload.role === "sub_user" ? payload.userId : null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get("page")) || 1;
    const pageSize = parseInt(searchParams.get("pageSize")) || 20;
    const apiKeyId = searchParams.get("apiKeyId");
    const apiKeyName = searchParams.get("apiKeyName");
    const provider = searchParams.get("provider");
    const model = searchParams.get("model");
    const connectionId = searchParams.get("connectionId");
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    
    if (page < 1) {
      return NextResponse.json(
        { error: "Page must be >= 1" },
        { status: 400 }
      );
    }
    
    if (pageSize < 1 || pageSize > 100) {
      return NextResponse.json(
        { error: "PageSize must be between 1 and 100" },
        { status: 400 }
      );
    }
    
    const filter = {
      page,
      pageSize
    };

    const userId = await getSubUserId(request);
    if (userId) filter.userId = userId;
    
    if (apiKeyId) filter.apiKeyId = apiKeyId;
    if (apiKeyName) filter.apiKeyName = apiKeyName;
    if (provider) filter.provider = provider;
    if (model) filter.model = model;
    if (connectionId) filter.connectionId = connectionId;
    if (status) filter.status = status;
    if (startDate) filter.startDate = startDate;
    if (endDate) filter.endDate = endDate;
    
    const result = await getRequestDetails(filter);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] Failed to get request details:", error);
    return NextResponse.json(
      { error: "Failed to fetch request details" },
      { status: 500 }
    );
  }
}
