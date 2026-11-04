import type { SupabaseClient } from "@supabase/supabase-js";
export async function cleanupMedia(client: SupabaseClient) {
  const bucket = "econtent-project-media";
  const { data: existing, error: bucketRead } =
    await client.storage.getBucket(bucket);
  if (!existing) {
    if (bucketRead && !/not found/i.test(bucketRead.message))
      throw Error("Storage unavailable");
    const { error } = await client.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: 50000000,
    });
    if (error && !/already exists/i.test(error.message))
      throw Error("Storage setup failed");
  }
  const now = new Date().toISOString();
  const due = `expires_at.lte.${now},and(state.eq.pending,upload_until.lte.${now}),state.eq.deleting`;
  const { data: assets, error } = await client
    .from("project_media")
    .select("id,object_path")
    .or(due)
    .order("id")
    .limit(100);
  if (error) throw Error("Cleanup list unavailable");
  let removed = 0,
    failed = 0;
  for (const asset of assets ?? []) {
    const { data: claimed, error: claimError } = await client
      .from("project_media")
      .update({ state: "deleting" })
      .eq("id", asset.id)
      .or(due)
      .select("id")
      .maybeSingle();
    if (claimError) {
      failed++;
      continue;
    }
    if (!claimed) continue;
    const { error: deleteError } = await client.storage
      .from(bucket)
      .remove([asset.object_path]);
    if (deleteError) {
      failed++;
      continue;
    }
    const { error: releaseError } = await client
      .from("project_media")
      .delete()
      .eq("id", asset.id)
      .eq("state", "deleting");
    if (releaseError) failed++;
    else removed++;
  }
  return { removed, failed };
}
