import { DashboardPage } from '@/components/account-ui'
import { WorkspaceShell } from '@/components/workspace-shell'

export default function DashboardRoute() {
  return <WorkspaceShell><DashboardPage /></WorkspaceShell>
}
