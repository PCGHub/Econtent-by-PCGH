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
  parseProjectDraft,
  PROJECT_COLUMNS,
  toRow,
} from "@/lib/projects/model";
export async function GET(request: NextRequest) {
  try {
    const { client, user } = await account(request);
    const url = request.nextUrl;
    const search = (url.searchParams.get("q") ?? "").trim();
    if (search.length > 120) throw new ApiError(400, "Search is too long");
    let query = client
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("owner_id", user.id);
    if (search)
      query = query.ilike(
        "title",
        "%" + search.replace(/[\\%_]/g, "\\$&") + "%",
      );
    const sort = url.searchParams.get("sort");
    query =
      sort === "name"
        ? query.order("title", { ascending: true })
        : query.order("updated_at", { ascending: sort === "oldest" });
    const { data, error } = await query.order("id").limit(200);
    if (error) throw error;
    return json({ projects: data.map((row) => fromRow(row)) });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const { client } = await account(request);
    const input = await body(request);
    const parsed = validation(() => parseProjectDraft(input));
    const { data, error } = await client
      .from("projects")
      .insert(toRow(parsed))
      .select(PROJECT_COLUMNS)
      .single();
    if (error) throw error;
    return json({ project: fromRow(data) }, 201);
  } catch (error) {
    return apiError(error);
  }
}
