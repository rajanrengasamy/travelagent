/**
 * VectorDB Lock Mechanism
 *
 * Provides file-based locking to prevent concurrent write access to LanceDB.
 * Supports wait-and-retry for parallel Claude Code sessions.
 *
 * @module context/lock
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const LOCK_DIR = path.join(os.homedir(), '.travelagent', 'context');
const LOCK_FILE = path.join(LOCK_DIR, '.vectordb.lock');

/** Lock metadata stored in the lock file */
interface LockInfo {
  /** PID of the process holding the lock */
  pid: number;
  /** When the lock was acquired */
  acquiredAt: string;
  /** What operation is being performed */
  operation: string;
  /** Session identifier (optional) */
  sessionId?: string;
}

/** Default lock timeout in milliseconds (5 minutes) */
const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

/** Default retry interval in milliseconds */
const DEFAULT_RETRY_INTERVAL_MS = 1000;

/** Maximum retries before giving up */
const DEFAULT_MAX_RETRIES = 30;

/**
 * Ensure lock directory exists
 */
async function ensureLockDir(): Promise<void> {
  try {
    await fs.mkdir(LOCK_DIR, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Check if lock file exists and is still valid (not stale)
 *
 * @param timeoutMs - Lock timeout in milliseconds
 * @returns Lock info if valid lock exists, null otherwise
 */
async function checkLock(timeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS): Promise<LockInfo | null> {
  try {
    const content = await fs.readFile(LOCK_FILE, 'utf-8');
    const lockInfo: LockInfo = JSON.parse(content);

    // Check if lock is stale (older than timeout)
    const acquiredAt = new Date(lockInfo.acquiredAt);
    const now = new Date();
    const ageMs = now.getTime() - acquiredAt.getTime();

    if (ageMs > timeoutMs) {
      // Lock is stale, remove it
      console.log(`[Lock] Stale lock detected (${Math.round(ageMs / 1000)}s old), removing...`);
      await releaseLock();
      return null;
    }

    return lockInfo;
  } catch {
    // Lock file doesn't exist or is invalid
    return null;
  }
}

/**
 * Acquire a lock for VectorDB write operations
 *
 * @param operation - Description of the operation (e.g., "journal", "seed")
 * @param options - Lock options
 * @returns True if lock acquired, false if unable to acquire
 */
export async function acquireLock(
  operation: string,
  options: {
    maxRetries?: number;
    retryIntervalMs?: number;
    timeoutMs?: number;
    sessionId?: string;
  } = {}
): Promise<boolean> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
    timeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
    sessionId,
  } = options;

  await ensureLockDir();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Check if lock exists
    const existingLock = await checkLock(timeoutMs);

    if (existingLock) {
      // Lock exists, wait and retry
      const waitTime = Math.round((attempt + 1) * retryIntervalMs / 1000);
      console.log(
        `[Lock] VectorDB locked by PID ${existingLock.pid} for "${existingLock.operation}" ` +
        `(acquired ${Math.round((Date.now() - new Date(existingLock.acquiredAt).getTime()) / 1000)}s ago). ` +
        `Waiting ${waitTime}s... (attempt ${attempt + 1}/${maxRetries})`
      );
      await sleep(retryIntervalMs);
      continue;
    }

    // Try to acquire lock
    const lockInfo: LockInfo = {
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
      operation,
      sessionId,
    };

    try {
      // Use exclusive write flag to prevent race conditions
      await fs.writeFile(LOCK_FILE, JSON.stringify(lockInfo, null, 2), {
        flag: 'wx', // Exclusive create - fails if file exists
      });
      console.log(`[Lock] Acquired lock for "${operation}"`);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        // Another process created the file between our check and write
        // This is fine, we'll retry
        continue;
      }
      throw error;
    }
  }

  console.error(`[Lock] Failed to acquire lock after ${maxRetries} attempts`);
  return false;
}

/**
 * Release the VectorDB lock
 */
export async function releaseLock(): Promise<void> {
  try {
    await fs.unlink(LOCK_FILE);
    console.log('[Lock] Released lock');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[Lock] Error releasing lock:', error);
    }
  }
}

/**
 * Check if VectorDB is currently locked
 *
 * @returns Lock info if locked, null if not locked
 */
export async function isLocked(): Promise<LockInfo | null> {
  return checkLock();
}

/**
 * Execute a function with VectorDB lock
 *
 * Automatically acquires lock before execution and releases after.
 * Handles errors gracefully to ensure lock is always released.
 *
 * @param operation - Description of the operation
 * @param fn - Function to execute while holding the lock
 * @param options - Lock options
 * @returns Result of the function, or null if lock couldn't be acquired
 */
export async function withLock<T>(
  operation: string,
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryIntervalMs?: number;
    timeoutMs?: number;
    sessionId?: string;
  } = {}
): Promise<T | null> {
  const acquired = await acquireLock(operation, options);

  if (!acquired) {
    console.error(`[Lock] Could not acquire lock for "${operation}", skipping operation`);
    return null;
  }

  try {
    return await fn();
  } finally {
    await releaseLock();
  }
}

/**
 * Get current lock status for display
 *
 * @returns Human-readable lock status
 */
export async function getLockStatus(): Promise<string> {
  const lockInfo = await checkLock();

  if (!lockInfo) {
    return 'VectorDB: unlocked';
  }

  const ageSeconds = Math.round((Date.now() - new Date(lockInfo.acquiredAt).getTime()) / 1000);
  return `VectorDB: locked by PID ${lockInfo.pid} for "${lockInfo.operation}" (${ageSeconds}s ago)`;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
