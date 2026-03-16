"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Workflow, WorkflowStatus, TriggerType } from "@/lib/mock-data"

interface WorkflowListProps {
  workflows: Workflow[]
  selectedWorkflowId: string | null
  onSelectWorkflow: (id: string) => void
}

function StatusBadge({ status }: { status: WorkflowStatus }) {
  const styles: Record<WorkflowStatus, string> = {
    completed: "bg-[#7d9c6f]/15 text-[#7d9c6f]",
    running: "bg-[#d4a855]/15 text-[#d4a855]",
    failed: "bg-[#c45c5c]/15 text-[#c45c5c]",
    pending: "bg-[#8a8a8a]/15 text-[#8a8a8a]",
  }
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

function TriggerBadge({ trigger }: { trigger: TriggerType }) {
  const icons: Record<TriggerType, string> = {
    time: "◷",
    agent: "◆",
    condition: "◈",
  }
  
  return (
    <span className="inline-flex items-center gap-1.5 text-[#a8a8a8]">
      <span className="text-[#d4a855]">{icons[trigger]}</span>
      {trigger}
    </span>
  )
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function WorkflowList({ workflows, selectedWorkflowId, onSelectWorkflow }: WorkflowListProps) {
  return (
    <div className="border border-[#3a3a3d] bg-[#252528]">
      <div className="border-b border-[#3a3a3d] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#e5e5e5]">Workflows</h2>
        <p className="text-xs text-[#8a8a8a] mt-0.5">{workflows.length} total</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-[#3a3a3d] hover:bg-transparent">
            <TableHead className="text-[#8a8a8a] text-xs font-medium h-9">Workflow ID</TableHead>
            <TableHead className="text-[#8a8a8a] text-xs font-medium h-9">Trigger</TableHead>
            <TableHead className="text-[#8a8a8a] text-xs font-medium h-9">Status</TableHead>
            <TableHead className="text-[#8a8a8a] text-xs font-medium h-9">Started</TableHead>
            <TableHead className="text-[#8a8a8a] text-xs font-medium h-9">Completed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workflows.map((workflow) => (
            <TableRow
              key={workflow.id}
              onClick={() => onSelectWorkflow(workflow.id)}
              className={`cursor-pointer border-[#3a3a3d] ${
                selectedWorkflowId === workflow.id
                  ? "bg-[#d4a855]/10"
                  : "hover:bg-[#2d2d30]"
              }`}
            >
              <TableCell className="font-mono text-xs text-[#e5e5e5]">
                {workflow.id}
              </TableCell>
              <TableCell className="text-xs">
                <TriggerBadge trigger={workflow.triggerType} />
              </TableCell>
              <TableCell>
                <StatusBadge status={workflow.status} />
              </TableCell>
              <TableCell className="font-mono text-xs text-[#a8a8a8]">
                {formatTimestamp(workflow.startedAt)}
              </TableCell>
              <TableCell className="font-mono text-xs text-[#a8a8a8]">
                {workflow.completedAt ? formatTimestamp(workflow.completedAt) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
