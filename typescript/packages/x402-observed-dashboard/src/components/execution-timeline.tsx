"use client"

import { Workflow, WorkflowStep, StepStatus } from "@/lib/mock-data"

interface ExecutionTimelineProps {
  workflow: Workflow
  selectedStepId: string | null
  onSelectStep: (id: string) => void
}

function StepStatusIndicator({ status }: { status: StepStatus }) {
  const colors: Record<StepStatus, string> = {
    success: "#7d9c6f",
    failed: "#c45c5c",
    retried: "#d4a855",
    pending: "#8a8a8a",
    running: "#d4a855",
  }
  
  const icons: Record<StepStatus, string> = {
    success: "●",
    failed: "●",
    retried: "↻",
    pending: "○",
    running: "◐",
  }
  
  return (
    <span style={{ color: colors[status] }} className="text-sm">
      {icons[status]}
    </span>
  )
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function ExecutionTimeline({ workflow, selectedStepId, onSelectStep }: ExecutionTimelineProps) {
  return (
    <div className="border border-[#3a3a3d] bg-[#252528]">
      <div className="border-b border-[#3a3a3d] px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#e5e5e5]">Execution Timeline</h2>
            <p className="text-xs text-[#8a8a8a] mt-0.5 font-mono">{workflow.id}</p>
          </div>
          <div className="text-xs text-[#8a8a8a]">
            {workflow.steps.length} steps
          </div>
        </div>
      </div>
      
      <div className="p-4">
        <div className="relative">
          <div className="absolute left-[7px] top-0 bottom-0 w-px bg-[#3a3a3d]" />
          
          <div className="space-y-0">
            {workflow.steps.map((step, index) => (
              <div
                key={step.id}
                onClick={() => onSelectStep(step.id)}
                className={`relative pl-7 py-2 cursor-pointer ${
                  selectedStepId === step.id
                    ? "bg-[#d4a855]/10 -mx-4 px-4 pl-11"
                    : "hover:bg-[#2d2d30] -mx-4 px-4 pl-11"
                }`}
              >
                <div className="absolute left-4 top-3">
                  <StepStatusIndicator status={step.status} />
                </div>
                
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#8a8a8a] font-mono">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="text-sm text-[#e5e5e5] font-medium truncate">
                        {step.name}
                      </span>
                    </div>
                    {step.errorMessage && (
                      <p className="text-xs text-[#c45c5c] mt-1 truncate">
                        {step.errorMessage.split(':')[0]}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0">
                    {step.duration && (
                      <span className="text-xs text-[#8a8a8a] font-mono">
                        {step.duration}
                      </span>
                    )}
                    <span className="text-xs text-[#8a8a8a] font-mono">
                      {formatTime(step.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
