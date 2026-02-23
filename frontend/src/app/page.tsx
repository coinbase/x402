"use client"

import { useState } from "react"
import { WorkflowList } from "@/components/workflow-list"
import { ExecutionTimeline } from "@/components/execution-timeline"
import { StepInspection } from "@/components/step-inspection"
import { mockWorkflows } from "@/lib/mock-data"

export default function Dashboard() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(mockWorkflows[0]?.id || null)
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)

  const selectedWorkflow = mockWorkflows.find(w => w.id === selectedWorkflowId)
  const selectedStep = selectedWorkflow?.steps.find(s => s.id === selectedStepId) || null

  const handleSelectWorkflow = (id: string) => {
    setSelectedWorkflowId(id)
    setSelectedStepId(null)
  }

  return (
    <div className="min-w-[1280px] min-h-screen bg-[#1c1c1e]">
      <header className="border-b border-[#3a3a3d] bg-[#1c1c1e] sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[#d4a855] text-lg font-semibold">◈</span>
            <h1 className="text-[#e5e5e5] text-sm font-semibold tracking-tight">x402 Workflow Debugger</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[#8a8a8a] font-mono">v2.1.0</span>
            <div className="w-px h-4 bg-[#3a3a3d]" />
            <span className="text-xs text-[#7d9c6f]">● Connected</span>
          </div>
        </div>
      </header>

      <main className="p-6">
        <div className="mb-6">
          <WorkflowList
            workflows={mockWorkflows}
            selectedWorkflowId={selectedWorkflowId}
            onSelectWorkflow={handleSelectWorkflow}
          />
        </div>

        {selectedWorkflow && (
          <div className="grid grid-cols-[1fr_380px] gap-6">
            <ExecutionTimeline
              workflow={selectedWorkflow}
              selectedStepId={selectedStepId}
              onSelectStep={setSelectedStepId}
            />
            <StepInspection step={selectedStep} />
          </div>
        )}
      </main>

      <footer className="border-t border-[#3a3a3d] px-6 py-3 fixed bottom-0 left-0 right-0 bg-[#1c1c1e]">
        <div className="flex items-center justify-between text-xs text-[#8a8a8a]">
          <span>x402 Payment Protocol</span>
          <span className="font-mono">Last sync: {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
        </div>
      </footer>
    </div>
  )
}
