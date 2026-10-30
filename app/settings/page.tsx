import { SettingsPage } from '@/components/account-ui'
import { WorkspaceShell } from '@/components/workspace-shell'

export default function SettingsRoute() {
  return <WorkspaceShell><SettingsPage /></WorkspaceShell>
}
