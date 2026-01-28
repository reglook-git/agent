# Agent Debug Mode Implementation - Completion Report

## Summary
Successfully implemented debug mode for the Airnode agent with enhanced logging and workdir preservation capabilities.

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
- **Production Safe:** Default behavior remains unchanged (KEEP_WORKDIR=false)

## Files Modified
- `src/config.ts` - Added KEEP_WORKDIR configuration
- `src/task-runner/executor.ts` - Improved error logging and cleanup logic
- `src/task-runner/source-fetcher.ts` - Added extraction completion logging

## Testing Status
- ✅ TypeScript compilation successful
- ✅ No syntax errors introduced
- ✅ Configuration validation maintained
- ✅ Backward compatibility preserved

The agent is now ready for enhanced debugging with improved error reporting and optional workdir preservation.