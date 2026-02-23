"use client"

import { WorkflowStep, StepStatus } from "@/lib/mock-data"

interface StepInspectionProps {
  step: WorkflowStep | null
}

function StatusLabel({ status }: { status: StepStatus }) {
  const styles: Record<StepStatus, { bg: string; text: string; label: string }> = {
    success: { bg: "bg-[#7d9c6f]/15", text: "text-[#7d9c6f]", label: "SUCCESS" },
    failed: { bg: "bg-[#c45c5c]/15", text: "text-[#c45c5c]", label: "FAILED" },
    retried: { bg: "bg-[#d4a855]/15", text: "text-[#d4a855]", label: "RETRIED" },
    pending: { bg: "bg-[#8a8a8a]/15", text: "text-[#8a8a8a]", label: "PENDING" },
    running: { bg: "bg-[#d4a855]/15", text: "text-[#d4a855]", label: "RUNNING" },
  }
  
  const style = styles[status]
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}

function DataRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="py-2 border-b border-[#3a3a3d] last:border-0">
      <dt className="text-xs text-[#8a8a8a] mb-1">{label}</dt>
      <dd className={`text-sm text-[#e5e5e5] break-all ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  )
}

function formatFullTimestamp(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  })
}

export function StepInspection({ step }: StepInspectionProps) {
  if (!step) {
    return (
      <div className="border border-[#3a3a3d] bg-[#252528] h-full">
        <div className="border-b border-[#3a3a3d] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#e5e5e5]">Step Details</h2>
        </div>
        <div className="p-4 flex items-center justify-center h-[calc(100%-52px)]">
          <p className="text-sm text-[#8a8a8a]">Select a step to inspect</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="border border-[#3a3a3d] bg-[#252528] h-full overflow-auto">
      <div className="border-b border-[#3a3a3d] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#e5e5e5]">Step Details</h2>
        <p className="text-xs text-[#8a8a8a] mt-0.5 font-mono">{step.id}</p>
      </div>
      
      <div className="p-4">
        <dl>
          <DataRow label="Step Name" value={step.name} />
          
          <DataRow 
            label="Timestamp" 
            value={formatFullTimestamp(step.timestamp)} 
            mono 
          />
          
          <div className="py-2 border-b border-[#3a3a3d]">
            <dt className="text-xs text-[#8a8a8a] mb-1">Execution Status</dt>
            <dd className="flex items-center gap-2">
              <StatusLabel status={step.status} />
              {step.retryCount && (
                <span className="text-xs text-[#8a8a8a]">
                  ({step.retryCount} retries)
                </span>
              )}
            </dd>
          </div>
          
          {step.duration && (
            <DataRow label="Duration" value={step.duration} mono />
          )}
          
          {step.transactionHash && (
            <div className="py-2 border-b border-[#3a3a3d]">
              <dt className="text-xs text-[#8a8a8a] mb-1">Transaction Hash</dt>
              <dd className="font-mono text-xs text-[#d4a855] break-all select-all">
                {step.transactionHash}
              </dd>
            </div>
          )}
          
          {step.agentDecisionReason && (
            <div className="py-2 border-b border-[#3a3a3d]">
              <dt className="text-xs text-[#8a8a8a] mb-1">Agent Decision Reason</dt>
              <dd className="text-sm text-[#a8a8a8]">
                {step.agentDecisionReason}
              </dd>
            </div>
          )}
          
          {step.errorMessage && (
            <div className="py-2 border-b border-[#3a3a3d]">
              <dt className="text-xs text-[#8a8a8a] mb-1">Error Message</dt>
              <dd className="font-mono text-xs text-[#c45c5c] bg-[#c45c5c]/10 p-2 border border-[#c45c5c]/20">
                {step.errorMessage}
              </dd>
            </div>
          )}
          
          {step.metadata && Object.keys(step.metadata).length > 0 && (
            <div className="py-2">
              <dt className="text-xs text-[#8a8a8a] mb-2">Metadata</dt>
              <dd className="bg-[#1c1c1e] border border-[#3a3a3d] p-2">
                {Object.entries(step.metadata).map(([key, value]) => (
                  <div key={key} className="flex justify-between py-1 text-xs">
                    <span className="text-[#8a8a8a]">{key}</span>
                    <span className="text-[#e5e5e5] font-mono">{value}</span>
                  </div>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}
