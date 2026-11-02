import { WorkspaceShell } from "@/components/workspace-shell";
import { VoiceoverStudio } from "@/components/ai-studio/voiceover-studio";
export const metadata = { title: "AI Voice-over | Econtent by PCGH" };
export default function Page() { return <WorkspaceShell><VoiceoverStudio/></WorkspaceShell>; }
