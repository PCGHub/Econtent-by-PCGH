import { TitlesStudio } from "@/components/titles/studio";
import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/supabase/server";
import { fromRow, isProjectId, PROJECT_COLUMNS } from "@/lib/projects/model";
import { OverlayStudio } from "@/components/overlay-studio";
import ProjectEditor from "@/components/account/project-editor";
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { client, user } = await requireAccount("/projects/" + projectId);
  if (!isProjectId(projectId)) notFound();
  const { data, error } = await client
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Unable to load this project. Please try again.");
  if (!data) notFound();
  const project=fromRow(data);
  return project.titles ? <TitlesStudio savedProject={project}/> : project.composition ? <OverlayStudio project={project}/> : <ProjectEditor project={project} />;
}

export const dynamic = "force-dynamic";
