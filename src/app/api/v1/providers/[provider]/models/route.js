import { buildModelsList } from "@/app/api/v1/models/route.js";
import { providerScopedOptions, toProviderScopedModelList } from "@/app/api/v1/providers/providerScopedRouteUtils.js";

export async function OPTIONS() {
  return providerScopedOptions("GET, OPTIONS");
}

export async function GET(request, context) {
  const params = await context?.params;
  const models = await buildModelsList(["llm"], request);
  const scoped = toProviderScopedModelList(params?.provider, models);

  if (scoped.error) {
    return Response.json(
      {
        error: {
          message: scoped.error,
          type: "invalid_request_error",
          code: "invalid_provider",
        },
      },
      { status: 400 }
    );
  }

  return Response.json(
    {
      object: "list",
      data: scoped.data,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
