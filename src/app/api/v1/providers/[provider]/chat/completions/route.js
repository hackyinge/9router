import { POST as chatCompletionsPost } from "@/app/api/v1/chat/completions/route.js";
import { providerScopedOptions, providerScopedRequest } from "@/app/api/v1/providers/providerScopedRouteUtils.js";

export async function OPTIONS() {
  return providerScopedOptions();
}

export async function POST(request, context) {
  return providerScopedRequest(request, context, chatCompletionsPost);
}
