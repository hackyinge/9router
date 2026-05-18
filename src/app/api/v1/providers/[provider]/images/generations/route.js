import { POST as imageGenerationsPost } from "@/app/api/v1/images/generations/route.js";
import { providerScopedOptions, providerScopedRequest } from "@/app/api/v1/providers/providerScopedRouteUtils.js";

export async function OPTIONS() {
  return providerScopedOptions("POST, OPTIONS");
}

export async function POST(request, context) {
  return providerScopedRequest(request, context, imageGenerationsPost);
}
