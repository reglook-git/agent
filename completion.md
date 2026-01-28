# Agent Debug Mode Implementation - Completion Report

## Summary
Successfully implemented debug mode for the Airnode agent with enhanced logging, workdir preservation capabilities, and task structure normalization to handle server payload variations.

## Changes Made

### 1. Configuration Updates (`src/config.ts`)
- Added `KEEP_WORKDIR` boolean environment variable with default value `false`
- Updated config schema to include the new variable
- Added parsing logic for `KEEP_WORKDIR` from environment variables

### 2. Executor Improvements (`src/task-runner/executor.ts`)
- Enhanced error logging to include full error objects:
  ```typescript
  logger.error({ err: error }, `Deployment ${deploymentId} failed`);
  ```
- Implemented workdir cleanup guard based on `KEEP_WORKDIR` setting:
  ```typescript
  if (config.KEEP_WORKDIR) {
    logger.warn("KEEP_WORKDIR=true; skipping cleanup");
  } else {
    // Perform cleanup
  }
  ```

### 3. Source Fetcher Enhancements (`src/task-runner/source-fetcher.ts`)
- Added detailed logging after source extraction:
  ```typescript
  logger.info({ extractDir: workdir }, "Extraction done, determining project root...");
  ```

### 4. Task Structure Normalization (`src/task-runner/task-normalizer.ts`)
- Created new utility to handle both flat and nested task structures
- Handles server responses where buildSpec is nested in `payload` field
- Provides fallback defaults for all required fields
- Supports backward compatibility with existing task formats

### 5. Poller Updates (`src/task-runner/poller.ts`)
- Integrated task normalization in task processing pipeline
- Added debug logging to show raw vs normalized task structures
- Ensures consistent task data regardless of server response format

## Root Cause Fixed

The agent was crashing because it expected a flat task structure but received tasks with nested `payload` data from the server:

**Server Response Format:**
```json
{
  "id": "...",
  "type": "BUILD_AND_DEPLOY",
  "deploymentId": "...",
  "payload": {
    "buildSpec": { "nodeVersion": "20", ... }
  }
}
```

**Agent Expected Format:**
```json
{
  "buildSpec": { "nodeVersion": "20", ... }
}
```

The normalization function now handles both formats seamlessly.

## Environment Variable Configuration

To enable debug mode, add the following to `/opt/airnode-agent/.env`:

```bash
KEEP_WORKDIR=true
```

## Usage Instructions

1. **Enable Debug Mode:**
   ```bash
   echo "KEEP_WORKDIR=true" >> /opt/airnode-agent/.env
   ```

2. **Restart the Agent:**
   ```bash
   sudo systemctl restart airnode-agent
   ```

3. **Monitor Logs:**
   ```bash
   sudo journalctl -u airnode-agent -f
   ```

## Benefits

- **Enhanced Debugging:** Full error objects provide detailed failure information
- **Workdir Preservation:** KEEP_WORKDIR=true prevents automatic cleanup for inspection
- **Better Visibility:** Additional logging helps trace execution flow
- **Robust Task Handling:** Automatic normalization handles server payload variations
- **Production Safe:** Default behavior remains unchanged (KEEP_WORKDIR=false)

## Files Modified
- `src/config.ts` - Added KEEP_WORKDIR configuration
- `src/task-runner/executor.ts` - Improved error logging and cleanup logic
- `src/task-runner/source-fetcher.ts` - Added extraction completion logging
- `src/task-runner/task-normalizer.ts` - New utility for task structure normalization
- `src/task-runner/poller.ts` - Integrated task normalization and debug logging

## Testing Status
- ✅ TypeScript compilation successful
- ✅ No syntax errors introduced
- ✅ Configuration validation maintained
- ✅ Backward compatibility preserved
- ✅ Task normalization handles both flat and nested structures

The agent is now ready for enhanced debugging with improved error reporting, optional workdir preservation, and robust task structure handling.