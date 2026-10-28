import { NextRequest } from "next/server";
import { account, apiError, json, ApiError } from "@/lib/projects/api";
import {
  fromRow,
  isProjectId,
  PROJECT_COLUMNS,
  toRow,
} from "@/lib/projects/model";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { client, user } = await account(request);
    const { projectId } = await params;
    if (!isProjectId(projectId)) throw new ApiError(404, "Project not found");
    const { data: original, error: readError } = await client
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("id", projectId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!original) throw new ApiError(404, "Project not found");
    const draft = fromRow(original);
    const { data, error } = await client
      .from("projects")
      .insert(
        toRow({
          ...draft,
          title: draft.title.slice(0, 113) + " (copy)",
          status: "draft",
        }),
      )
      .select(PROJECT_COLUMNS)
      .single();
    if (error) throw error;
    return json({ project: fromRow(data) }, 201);
  } catch (error) {
    return apiError(error);
  }
}
