# 需求文档: Docker-based Agent Execution (OpenCode)

## 简介

本文档定义了 Routa.js 平台中基于 Docker 容器的 Agent 执行功能的需求。该功能允许用户在隔离的 Docker 容器中运行 OpenCode agent，通过 ACP (Agent Communication Protocol) 进行交互，解决本地环境依赖问题，提供可复现的 agent 执行环境。

## 术语表

- **Docker_Daemon**: 宿主机上运行的 Docker 守护进程，负责管理容器的创建、运行和销毁
- **DockerDetector**: 负责检测宿主机 Docker 环境可用性的组件
- **DockerProcessManager**: 负责管理 Docker 容器生命周期（创建、启动、健康检查、停止、清理）的组件
- **DockerOpenCodeAdapter**: 通过 HTTP/SSE 与 Docker 容器内 OpenCode 通信的 ACP 适配器组件
- **DockerProviderAdapter**: Provider Adapter 层中的 Docker 适配器，负责消息格式规范化
- **Container**: Docker 容器实例，运行 OpenCode agent 进程
- **Health_Check**: 通过 HTTP GET /health 端点验证容器内服务是否就绪的检查机制
- **NormalizedSessionUpdate**: Routa 平台统一的会话更新消息格式
- **ACP_Session**: Agent Communication Protocol 会话，代表一次 agent 交互的完整生命周期
- **Host_Port**: 宿主机上映射到容器内服务端口的网络端口
- **Routa_Label**: 值为 `routa.managed=true` 的 Docker label，用于标识 Routa 管理的容器

## 需求

### Requirement 1: Docker 可用性检测

**User Story:** 作为开发者，我希望系统能自动检测 Docker 环境是否可用，以便我知道是否可以使用 Docker 模式运行 agent。

#### Acceptance Criteria

1. WHEN the DockerDetector executes a detection check, THE DockerDetector SHALL invoke `docker info` command and return a DockerStatus object within 5 seconds
2. WHEN `docker info` command succeeds, THE DockerDetector SHALL set `available` to true and populate the `version` field with the Docker server version
3. WHEN `docker info` command fails or times out, THE DockerDetector SHALL set `available` to false and populate the `error` field with a descriptive error message
4. WHEN a detection result is obtained, THE DockerDetector SHALL cache the result for 30 seconds to avoid repeated subprocess invocations
5. WHEN `forceRefresh` parameter is set to true, THE DockerDetector SHALL bypass the cache and execute a fresh detection check
6. WHEN the cache has not expired and `forceRefresh` is false, THE DockerDetector SHALL return the cached DockerStatus without invoking `docker info`

### Requirement 2: Docker 镜像管理

**User Story:** 作为开发者，我希望系统能自动管理 OpenCode agent 的 Docker 镜像，以便我无需手动拉取镜像。

#### Acceptance Criteria

1. WHEN the DockerDetector checks image availability, THE DockerDetector SHALL query the local Docker image list and return a boolean indicating whether the specified image exists locally
2. WHEN a required image is not available locally, THE DockerDetector SHALL pull the image from the configured registry
3. IF the image pull fails due to network error or invalid image reference, THEN THE DockerDetector SHALL return a descriptive error containing the image name and failure reason

### Requirement 3: 容器生命周期管理

**User Story:** 作为开发者，我希望系统能完整管理 Docker 容器的生命周期，以便容器能被正确创建、监控和清理。

#### Acceptance Criteria

1. WHEN the DockerProcessManager starts a container, THE DockerProcessManager SHALL create a Docker container with the specified image, volume mounts, environment variables, and port mapping
2. WHEN a container is created, THE DockerProcessManager SHALL assign a unique container name in the format `routa-agent-{shortId}` and attach the Routa_Label
3. WHEN `hostPort` is set to 0 or omitted in the configuration, THE DockerProcessManager SHALL automatically allocate an available port in the range 49152-65535
4. WHEN multiple containers are running simultaneously, THE DockerProcessManager SHALL ensure each container is assigned a distinct Host_Port
5. WHEN the DockerProcessManager stops a container, THE DockerProcessManager SHALL first send SIGTERM via `docker stop` with a 10-second timeout, then remove the container via `docker rm`
6. IF `docker stop` fails to terminate the container within 10 seconds, THEN THE DockerProcessManager SHALL force-terminate the container via `docker kill` before removing the container
7. WHEN a container is stopped and removed, THE DockerProcessManager SHALL release the associated Host_Port and remove the container from the internal management registry
8. WHEN the application exits, THE DockerProcessManager SHALL stop and remove all Routa-managed containers to prevent orphaned containers
9. WHEN the DockerProcessManager lists containers, THE DockerProcessManager SHALL return only containers bearing the Routa_Label

### Requirement 4: 容器健康检查

**User Story:** 作为开发者，我希望系统能验证容器内服务已就绪后再建立会话，以便避免连接到未准备好的服务。

#### Acceptance Criteria

1. WHEN a container is started, THE DockerProcessManager SHALL poll the container's HTTP `/health` endpoint at 1-second intervals until a 200 response is received or the timeout expires
2. WHEN the Health_Check receives a 200 response, THE DockerProcessManager SHALL mark the container status as "healthy" and return success
3. IF the Health_Check does not receive a 200 response within the specified timeout (default 30 seconds), THEN THE DockerProcessManager SHALL stop and remove the container and return a timeout error
4. WHEN the container is removed from the internal registry during a Health_Check, THE DockerProcessManager SHALL abort the Health_Check and return failure
5. THE DockerProcessManager SHALL complete every `waitForHealthy` invocation within the specified timeout duration without blocking indefinitely

### Requirement 5: Docker OpenCode ACP 适配器

**User Story:** 作为开发者，我希望通过统一的 ACP 接口与 Docker 容器内的 OpenCode 交互，以便 Docker 模式与本地模式的使用体验一致。

#### Acceptance Criteria

1. WHEN the DockerOpenCodeAdapter connects to a container, THE DockerOpenCodeAdapter SHALL establish an HTTP connection to the container's base URL
2. WHEN the DockerOpenCodeAdapter creates a session, THE DockerOpenCodeAdapter SHALL send a POST request to the container's `/session/new` endpoint and return the session ID
3. WHEN the DockerOpenCodeAdapter sends a prompt, THE DockerOpenCodeAdapter SHALL stream SSE events from the container and yield each event as a NormalizedSessionUpdate
4. WHEN the prompt stream completes, THE DockerOpenCodeAdapter SHALL yield a final NormalizedSessionUpdate with `eventType` set to `turn_complete`
5. WHEN the DockerOpenCodeAdapter yields a NormalizedSessionUpdate, THE DockerOpenCodeAdapter SHALL set the `provider` field to `docker-opencode` and the `sessionId` field to the current session ID
6. WHEN the DockerOpenCodeAdapter detects a connection loss to the container, THE DockerOpenCodeAdapter SHALL emit an error event and set `alive` to false
7. WHEN `cancel()` is invoked on the DockerOpenCodeAdapter, THE DockerOpenCodeAdapter SHALL abort the current HTTP request to the container

### Requirement 6: Provider Adapter 消息规范化

**User Story:** 作为开发者，我希望 Docker OpenCode 的消息格式与本地 OpenCode 完全兼容，以便前端无需区分 agent 运行模式。

#### Acceptance Criteria

1. THE DockerProviderAdapter SHALL normalize raw SSE events from Docker-hosted OpenCode into NormalizedSessionUpdate objects using the same logic as the local OpenCode provider adapter
2. WHEN the DockerProviderAdapter normalizes an event, THE DockerProviderAdapter SHALL produce output identical in structure to the local OpenCode provider adapter for the same raw input
3. THE DockerProviderAdapter SHALL register itself with provider type `docker-opencode` in the provider adapter registry

### Requirement 7: Docker Session 管理

**User Story:** 作为开发者，我希望能创建和管理基于 Docker 的 agent 会话，以便在隔离环境中进行代码交互。

#### Acceptance Criteria

1. WHEN a user requests a new Docker session, THE AcpProcessManager SHALL start a Docker container, create an OpenCode session inside the container, and return both the Routa session ID and the ACP session ID
2. WHEN creating a Docker session, THE AcpProcessManager SHALL pass the user's workspace directory as a volume mount to the container
3. WHEN creating a Docker session, THE AcpProcessManager SHALL inject the provided environment variables (such as API keys) into the container
4. WHEN a user terminates a Docker session, THE AcpProcessManager SHALL stop and remove the associated container and clean up all internal session records
5. IF the container fails to become healthy during session creation, THEN THE AcpProcessManager SHALL clean up the container and return an error to the caller

### Requirement 8: Docker 状态 API

**User Story:** 作为前端开发者，我希望有一个 API 端点查询 Docker 状态，以便 UI 能展示 Docker 可用性信息。

#### Acceptance Criteria

1. WHEN a GET request is sent to `/api/acp/docker/status`, THE API SHALL return a JSON response containing the DockerStatus object with `available`, `version`, and `error` fields
2. WHEN Docker is not available and a user requests to create a Docker session, THE API SHALL return HTTP status 503 with an error message indicating Docker is unavailable
3. WHEN the API returns a Docker status response, THE API SHALL include the `checkedAt` timestamp indicating when the detection was last performed

### Requirement 9: UI Docker 状态展示

**User Story:** 作为用户，我希望在界面上看到 Docker 的可用状态，以便我知道是否可以选择 Docker 模式。

#### Acceptance Criteria

1. WHEN Docker is available, THE Docker_Status_Indicator SHALL display the Docker version number with a success visual style
2. WHEN Docker is not available, THE Docker_Status_Indicator SHALL display an "unavailable" message with a warning visual style
3. WHEN the user clicks the refresh action on the Docker_Status_Indicator, THE Docker_Status_Indicator SHALL trigger a new Docker availability check and update the display with the result
4. WHILE Docker is not available, THE Agent_Selector SHALL disable the Docker OpenCode agent option and display a tooltip explaining that Docker is required

### Requirement 10: Docker 容器安全性

**User Story:** 作为平台管理员，我希望 Docker 容器的运行遵循安全最佳实践，以便防止敏感信息泄露和资源滥用。

#### Acceptance Criteria

1. WHEN injecting environment variables into a container, THE DockerProcessManager SHALL pass variables via Docker's `-e` flag and not persist variables in the image or Dockerfile
2. WHEN mounting volumes, THE DockerProcessManager SHALL mount only the user-specified workspace directory and any explicitly configured extra volumes
3. THE DockerProcessManager SHALL run container processes as a non-root user
4. WHEN logging container operations, THE DockerProcessManager SHALL exclude API keys and other sensitive environment variable values from log output
5. WHEN exposing container ports, THE DockerProcessManager SHALL expose only the OpenCode HTTP service port and no additional ports

### Requirement 11: 错误处理与恢复

**User Story:** 作为开发者，我希望系统能妥善处理 Docker 相关的各种错误场景，以便我能快速定位和恢复问题。

#### Acceptance Criteria

1. IF the Docker_Daemon is not running when a user selects Docker mode, THEN THE API SHALL return HTTP 503 and THE UI SHALL display guidance to install or start Docker
2. IF a container crashes during an active session, THEN THE DockerOpenCodeAdapter SHALL detect the disconnection and notify the UI with an error event
3. IF automatic port allocation fails three consecutive times due to port conflicts, THEN THE DockerProcessManager SHALL return an error indicating port exhaustion
4. IF a volume mount fails due to insufficient permissions, THEN THE DockerProcessManager SHALL return an error message specifying the directory path and the permission issue
5. WHEN a container startup times out, THE DockerProcessManager SHALL include container logs in the error response to aid debugging

### Requirement 12: OpenCode Agent Docker 镜像

**User Story:** 作为平台维护者，我希望有一个标准的 Dockerfile 来构建 OpenCode agent 镜像，以便镜像构建过程可复现。

#### Acceptance Criteria

1. THE Dockerfile SHALL use `node:22-alpine` as the base image and install `opencode-ai` globally via npm
2. THE Dockerfile SHALL expose port 4321 and configure OpenCode to listen on `0.0.0.0:4321` in HTTP/SSE mode
3. THE Dockerfile SHALL set `OPENCODE_HOST` to `0.0.0.0` and `OPENCODE_PORT` to `4321` as default environment variables
