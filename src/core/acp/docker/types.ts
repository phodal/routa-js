export interface DockerStatus {
  available: boolean;
  daemonRunning: boolean;
  version?: string;
  apiVersion?: string;
  error?: string;
  checkedAt: string;
}

export interface DockerContainerConfig {
  sessionId: string;
  image: string;
  workspacePath: string;
  /** Optional extra env vars for the container process */
  env?: Record<string, string | undefined>;
  /** Explicit additional read/write volume mappings */
  additionalVolumes?: Array<{ hostPath: string; containerPath: string }>;
  /** Optional container labels */
  labels?: Record<string, string>;
  /** Container port exposed by the OpenCode HTTP service */
  containerPort?: number;
  /** OpenCode auth.json content (JSON string) to mount into container */
  authJson?: string;
}

export interface DockerContainerInfo {
  sessionId: string;
  containerId: string;
  containerName: string;
  hostPort: number;
  containerPort: number;
  image: string;
  workspacePath: string;
  createdAt: Date;
}

export interface DockerPullResult {
  ok: boolean;
  image: string;
  output?: string;
  error?: string;
}
