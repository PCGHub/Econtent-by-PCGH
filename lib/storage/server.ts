import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/database.types";
import { MEDIA_BUCKET, type CloudAsset } from "./model";
export async function deleteProjectMedia(
  client: SupabaseClient<Database>,
  projectId: string,
) {
  const call = async <T>(action: string, payload: Record<string, Json>) => {
    const { data, error } = await client.rpc("project_media_action", {
      action,
      payload,
    });
    if (error) {
      // An unapplied additive migration cannot have managed media. The database
      // delete guard still protects existing media if a function was removed.
      if(action==='list'&&error.code==='PGRST202'&&error.message.includes('project_media_action'))return {assets:[]} as T;
      throw error;
    }
    return data as T;
  };
  const { assets } = await call<{ assets: CloudAsset[] }>("list", {
    projectId,
  });
  for (const asset of assets) {
    await call("deleting", { projectId, assetId: asset.id });
    const { error } = await client.storage
      .from(MEDIA_BUCKET)
      .remove([asset.object_path]);
    if (error) throw error;
    await call("release", { projectId, assetId: asset.id });
  }
}
