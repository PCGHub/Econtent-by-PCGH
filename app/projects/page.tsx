import { ProjectsPage } from '@/components/account-ui'
import { WorkspaceShell } from '@/components/workspace-shell'

export default function ProjectsRoute() {
  return <WorkspaceShell><ProjectsPage /></WorkspaceShell>
}
