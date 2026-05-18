import { POST as embeddingsPost } from "@/app/api/v1/embeddings/route.js";
import { providerScopedOptions, providerScopedRequest } from "@/app/api/v1/providers/providerScopedRouteUtils.js";

export async function OPTIONS() {
  return providerScopedOptions("POST, OPTIONS");
}

export async function POST(request, context) {
  return providerScopedRequest(request, context, embeddingsPost);
}
