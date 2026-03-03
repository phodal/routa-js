"use client";

/**
 * WorkflowVisualizer
 *
 * Renders a WorkflowDefinition (or raw YAML string) as an interactive
 * Mermaid flowchart diagram using the existing MermaidRenderer component.
 *
 * Usage:
 *   <WorkflowVisualizer definition={workflowDef} />
 *   <WorkflowVisualizer yaml={rawYamlString} />
 */

import { useMemo } from "react";
import { MermaidRenderer } from "@/client/components/markdown/mermaid-renderer";
import { workflowToMermaid } from "@/core/workflows/workflow-to-mermaid";
import { getWorkflowLoader } from "@/core/workflows/workflow-loader";
import type { WorkflowDefinition } from "@/core/workflows/workflow-types";

interface WorkflowVisualizerProps {
  /** Pre-parsed workflow definition */
  definition?: WorkflowDefinition;
  /** Raw YAML string (alternative to definition) */
  yaml?: string;
  /** Optional CSS class name */
  className?: string;
  /** Show the expand-to-fullscreen button (default: true) */
  showExpandButton?: boolean;
}

export function WorkflowVisualizer({
  definition,
  yaml,
  className = "",
  showExpandButton = true,
}: WorkflowVisualizerProps) {
  const mermaidCode = useMemo(() => {
    try {
      const def = definition ?? (yaml ? getWorkflowLoader().parse(yaml) : undefined);
      if (!def) return null;
      return workflowToMermaid(def);
    } catch {
      return null;
    }
  }, [definition, yaml]);

  if (!mermaidCode) {
    return (
      <div className={`workflow-visualizer ${className} p-4 text-sm text-gray-400 text-center`}>
        No workflow to display
      </div>
    );
  }

  return (
    <div className={`workflow-visualizer ${className}`}>
      <MermaidRenderer code={mermaidCode} showExpandButton={showExpandButton} />
    </div>
  );
}

export default WorkflowVisualizer;
