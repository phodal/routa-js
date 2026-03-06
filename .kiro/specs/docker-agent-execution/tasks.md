# Implementation Plan: Docker-based Agent Execution (OpenCode)

## Overview

This plan implements Docker container-based agent execution for Routa.js, enabling users to run OpenCode agents in isolated Docker containers. The implementation follows a bottom-up approach: core Docker utilities first, then container management, ACP adapters, API integration, and finally UI components.

## Tasks

- [ ] 1. Set up Docker module structure and core utilities
  - Create `src/core/acp/docker/` directory structure
  - Define TypeScript interfaces for DockerStatus, DockerContainerConfig, DockerContainerInfo
  - Set up shared utility functions (port allocation, container name generation)
  - _Requirements: 1.1, 3.2, 3.3_

- [ ] 2. Implement DockerDetector for availability checking
  - [ ] 2.1 Create DockerDetector singleton class with caching mechanism
    - Implement `checkAvailability()` with 30-second cache TTL
    - Parse `docker info` JSON output to extract version and API version
    - Handle timeout (5s) and error cases
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  
  - [ ]* 2.2 Write property test for DockerDetector caching behavior
    - **Property 2: Detection result caching behavior**
    - **Validates: Requirements 1.4, 1.5, 1.6**
  
  - [ ] 2.3 Implement image availability checking
    - Implement `isImageAvailable()` using `docker images` command
    - Implement `pullImage()` with progress tracking
    - Handle network errors and invalid image references
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [ ]* 2.4 Write unit tests for DockerDetector
    - Test Docker available scenario (mock successful `docker info`)
    - Test Docker unavailable scenario (mock command failure)
    - Test cache expiration and force refresh
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 3. Implement DockerProcessManager for container lifecycle
  - [ ] 3.1 Create DockerProcessManager class with container registry
    - Initialize internal Map for tracking containers
    - Implement container name generation (`routa-agent-{shortId}`)
    - Implement automatic port allocation (49152-65535 range)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [ ] 3.2 Implement container startup logic
    - Build `docker run` command with volumes, env vars, port mapping, and labels
    - Execute container creation and capture container ID
    - Register container in internal registry
    - _Requirements: 3.1, 3.2, 7.2, 7.3, 10.1, 10.2_
  
  - [ ] 3.3 Implement health check polling mechanism
    - Create `waitForHealthy()` with configurable timeout (default 30s)
    - Poll `/health` endpoint at 1-second intervals
    - Handle timeout and connection errors
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [ ]* 3.4 Write property test for health check timeout guarantee
    - **Property 6: Health check timeout guarantee**
    - **Validates: Requirement 4.5**
  
  - [ ] 3.5 Implement container stop and cleanup logic
    - Graceful stop with `docker stop -t 10`
    - Force kill with `docker kill` if graceful stop fails
    - Remove container with `docker rm -f`
    - Release port and clean up internal registry
    - _Requirements: 3.5, 3.6, 3.7_
  
  - [ ] 3.6 Implement `stopAll()` for application shutdown
    - Iterate through all managed containers
    - Stop and remove each container
    - Clear internal registry
    - _Requirements: 3.8_
  
  - [ ]* 3.7 Write property test for port uniqueness
    - **Property 3: Port uniqueness across concurrent containers**
    - **Validates: Requirement 3.4**
  
  - [ ]* 3.8 Write property test for cleanup completeness
    - **Property 4: Container stop cleanup completeness**
    - **Validates: Requirement 3.7**
    - **Property 5: Application exit full cleanup**
    - **Validates: Requirement 3.8**
  
  - [ ]* 3.9 Write unit tests for DockerProcessManager
    - Test container startup with various configurations
    - Test graceful and forced container termination
    - Test port allocation and release
    - _Requirements: 3.1, 3.5, 3.7_

- [ ] 4. Checkpoint - Verify Docker utilities work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement DockerOpenCodeAdapter for ACP communication
  - [ ] 5.1 Create DockerOpenCodeAdapter class
    - Implement `connect()` to establish HTTP connection to container
    - Implement `createSession()` to POST to `/session/new`
    - Track connection state with `alive` property
    - _Requirements: 5.1, 5.2, 5.6_
  
  - [ ] 5.2 Implement SSE streaming for prompt interaction
    - Implement `promptStream()` as async generator
    - Parse SSE events from container's HTTP response
    - Convert raw events to NormalizedSessionUpdate
    - Handle connection loss and emit error events
    - _Requirements: 5.3, 5.4, 5.5, 5.6_
  
  - [ ] 5.3 Implement cancellation and cleanup
    - Implement `cancel()` to abort current HTTP request
    - Implement `close()` to terminate connection
    - _Requirements: 5.7_
  
  - [ ]* 5.4 Write property test for SSE event normalization
    - **Property 8: NormalizedSessionUpdate field correctness**
    - **Validates: Requirements 5.4, 5.5**
  
  - [ ]* 5.5 Write unit tests for DockerOpenCodeAdapter
    - Test session creation and prompt streaming
    - Test connection loss detection
    - Test cancellation behavior
    - _Requirements: 5.1, 5.2, 5.3, 5.7_

- [ ] 6. Implement DockerProviderAdapter for message normalization
  - [ ] 6.1 Create DockerOpenCodeProviderAdapter class
    - Extend BaseProviderAdapter with provider type `docker-opencode`
    - Implement `getBehavior()` returning Docker OpenCode behavior
    - Implement `normalize()` reusing OpenCode normalization logic
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ]* 6.2 Write property test for normalization equivalence
    - **Property 7: SSE event normalization equivalence with local OpenCode**
    - **Validates: Requirements 6.1, 6.2**
  
  - [ ]* 6.3 Write unit tests for DockerProviderAdapter
    - Test normalization output structure
    - Test provider type registration
    - _Requirements: 6.1, 6.3_

- [ ] 7. Integrate Docker session management into AcpProcessManager
  - [ ] 7.1 Add Docker session tracking to AcpProcessManager
    - Create internal Map for Docker sessions
    - Link Docker sessions to container info and adapters
    - _Requirements: 7.1, 7.4_
  
  - [ ] 7.2 Implement `createDockerSession()` method
    - Check Docker availability via DockerDetector
    - Start container via DockerProcessManager
    - Create DockerOpenCodeAdapter and connect to container
    - Create OpenCode session inside container
    - Register session in internal Map
    - _Requirements: 7.1, 7.2, 7.3, 7.5_
  
  - [ ] 7.3 Implement Docker session termination
    - Extend `killSession()` to handle Docker sessions
    - Stop container via DockerProcessManager
    - Clean up adapter and internal records
    - _Requirements: 7.4_
  
  - [ ]* 7.4 Write integration tests for Docker session lifecycle
    - Test full session creation and termination flow
    - Test error handling when container fails to start
    - _Requirements: 7.1, 7.4, 7.5_

- [ ] 8. Checkpoint - Verify core Docker integration works
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Create Docker status API endpoint
  - [ ] 9.1 Create `/api/acp/docker/status` route
    - Implement GET handler calling DockerDetector
    - Return JSON with DockerStatus fields
    - Include `checkedAt` timestamp
    - _Requirements: 8.1, 8.3_
  
  - [ ]* 9.2 Write API tests for Docker status endpoint
    - Test response structure when Docker is available
    - Test response structure when Docker is unavailable
    - _Requirements: 8.1, 8.3_

- [ ] 10. Extend main ACP API route for Docker provider
  - [ ] 10.1 Add Docker provider support to `/api/acp` route
    - Check Docker availability when provider is `docker-opencode`
    - Return 503 if Docker is unavailable
    - Create Docker session if no sessionId provided
    - Forward prompts to Docker adapter for existing sessions
    - _Requirements: 7.1, 8.2_
  
  - [ ]* 10.2 Write API tests for Docker session creation
    - Test session creation with Docker provider
    - Test 503 response when Docker unavailable
    - Test prompt forwarding to Docker container
    - _Requirements: 7.1, 8.2_

- [ ] 11. Update provider adapter registry and presets
  - [ ] 11.1 Add `docker-opencode` to ProviderType enum
    - Update `src/core/acp/provider-adapter/types.ts`
    - _Requirements: 6.3_
  
  - [ ] 11.2 Register DockerOpenCodeProviderAdapter
    - Update `src/core/acp/provider-adapter/index.ts`
    - _Requirements: 6.3_
  
  - [ ] 11.3 Add Docker OpenCode preset to ACP presets
    - Update `src/core/acp/acp-presets.ts`
    - Define preset with id `docker-opencode`, capabilities, and metadata
    - _Requirements: 7.1_

- [ ] 12. Implement UI Docker status indicator component
  - [ ] 12.1 Create DockerStatusIndicator component
    - Fetch Docker status from `/api/acp/docker/status`
    - Display version badge when available (success style)
    - Display unavailable message when not available (warning style)
    - Implement refresh button to trigger re-check
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [ ]* 12.2 Write Playwright tests for Docker status indicator
    - Test display when Docker is available
    - Test display when Docker is unavailable
    - Test refresh button interaction
    - _Requirements: 9.1, 9.2, 9.3_

- [ ] 13. Update agent selector UI for Docker provider
  - [ ] 13.1 Extend agent selector to show Docker OpenCode option
    - Add Docker OpenCode to agent list
    - Disable option when Docker is unavailable
    - Show tooltip explaining Docker requirement
    - _Requirements: 9.4_
  
  - [ ]* 13.2 Write Playwright tests for agent selector
    - Test Docker option enabled when Docker available
    - Test Docker option disabled with tooltip when unavailable
    - _Requirements: 9.4_

- [ ] 14. Create OpenCode Agent Dockerfile
  - [ ] 14.1 Create `docker/Dockerfile.opencode-agent`
    - Use `node:22-alpine` as base image
    - Install `opencode-ai` globally via npm
    - Expose port 4321
    - Set environment variables for HTTP/SSE mode
    - Configure CMD to start OpenCode in HTTP mode
    - _Requirements: 12.1, 12.2, 12.3_
  
  - [ ]* 14.2 Test Docker image build and run
    - Build image locally
    - Run container and verify `/health` endpoint responds
    - Verify OpenCode accepts session creation requests
    - _Requirements: 12.1, 12.2, 12.3_

- [ ] 15. Implement security measures
  - [ ] 15.1 Add environment variable sanitization for logging
    - Filter API keys and sensitive values from log output
    - _Requirements: 10.4_
  
  - [ ] 15.2 Verify volume mount restrictions
    - Ensure only workspace directory and explicit volumes are mounted
    - _Requirements: 10.2_
  
  - [ ] 15.3 Verify port exposure restrictions
    - Ensure only OpenCode HTTP port is exposed
    - _Requirements: 10.5_
  
  - [ ]* 15.4 Write security audit tests
    - Test that API keys don't appear in logs
    - Test that only specified volumes are mounted
    - Test that only specified ports are exposed
    - _Requirements: 10.2, 10.4, 10.5_

- [ ] 16. Implement error handling and recovery
  - [ ] 16.1 Add error handling for Docker daemon unavailable
    - Return 503 with guidance message
    - Update UI to show installation/startup instructions
    - _Requirements: 11.1_
  
  - [ ] 16.2 Add error handling for container crashes
    - Detect disconnection in adapter
    - Emit error event to UI
    - _Requirements: 11.2_
  
  - [ ] 16.3 Add error handling for port allocation failures
    - Retry up to 3 times on port conflict
    - Return descriptive error after exhaustion
    - _Requirements: 11.3_
  
  - [ ] 16.4 Add error handling for volume mount permission issues
    - Return error with directory path and permission details
    - _Requirements: 11.4_
  
  - [ ] 16.5 Add container logs to startup timeout errors
    - Capture container logs on health check timeout
    - Include logs in error response
    - _Requirements: 11.5_
  
  - [ ]* 16.6 Write E2E tests for error scenarios
    - Test Docker unavailable flow
    - Test container crash recovery
    - Test port conflict handling
    - _Requirements: 11.1, 11.2, 11.3_

- [ ] 17. Final checkpoint - End-to-end verification
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Integration and documentation
  - [ ] 18.1 Wire all components together
    - Verify Docker detection → session creation → prompt interaction → cleanup flow
    - Test with real Docker environment
    - _Requirements: All_
  
  - [ ]* 18.2 Write E2E Playwright test for complete Docker workflow
    - Test full user journey: check Docker status → create Docker session → send prompt → receive response → terminate session
    - _Requirements: All_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- E2E tests verify complete user workflows
- Security measures are implemented as a dedicated task group to ensure compliance with requirements 10.1-10.5
- Error handling is comprehensive, covering all scenarios from requirements 11.1-11.5
