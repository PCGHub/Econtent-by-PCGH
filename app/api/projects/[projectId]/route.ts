import { NextRequest } from "next/server";
import {
  account,
  apiError,
  body,
  json,
  validation,
  ApiError,
} from "@/lib/projects/api";
import {
  fromRow,
  isProjectId,
  parseProjectDraft,
  PROJECT_COLUMNS,
  toRow,
} from "@/lib/projects/model";
type Context = { params: Promise<{ projectId: string }> };
async function owned(request: NextRequest, context: Context) {
  const { client, user } = await account(request);
  const { projectId } = await context.params;
  if (!isProjectId(projectId)) throw new ApiError(404, "Project not found");
  const { data, error } = await client
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "Project not found");
  return { client, user, project: fromRow(data) };
}
export async function GET(request: NextRequest, context: Context) {
  try {
    return json({ project: (await owned(request, context)).project });
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { client, user, project } = await owned(request, context);
    const input = await body(request);
    if (
      Object.keys(input).some(
        (key) =>
          !["revision", "title", "settings", "source", "status"].includes(key),
      )
    )
      throw new ApiError(400, "Unexpected project fields");
    if (input.revision !== project.revision)
      throw new ApiError(
        409,
        "This project changed in another tab. Reopen it before saving.",
      );
    const parsed = validation(() =>
      parseProjectDraft({
        title: input.title ?? project.title,
        settings: input.settings ?? project.settings,
        source: input.source === undefined ? project.source : input.source,
        status: input.status ?? project.status,
      }),
    );
    const { data, error } = await client
      .from("projects")
      .update(toRow(parsed))
      .eq("id", project.id)
      .eq("owner_id", user.id)
      .eq("revision", project.revision)
      .select(PROJECT_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new ApiError(
        409,
        "Project changed while saving. Reopen it before saving.",
      );
    return json({ project: fromRow(data) });
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { client, user, project } = await owned(request, context);
    const input = await body(request);
    if (input.revision !== project.revision)
      throw new ApiError(409, "Project changed. Refresh before deleting.");
    const { data, error } = await client
      .from("projects")
      .delete()
      .eq("id", project.id)
      .eq("owner_id", user.id)
      .eq("revision", project.revision)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new ApiError(
        409,
        "Project changed while deleting. Refresh and try again.",
      );
    return json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
