/**
 * Concurrency control for worker API calls.
 *
 * @module workers/concurrency
 */

/**
 * Statistics about the current state of the ConcurrencyLimiter.
 */
export interface ConcurrencyStats {
  /** Number of currently running operations */
  running: number;
  /** Number of operations waiting in queue */
  queued: number;
  /** Maximum concurrent operations allowed */
  limit: number;
}

/**
 * ConcurrencyLimiter controls the maximum number of concurrent operations.
 *
 * Uses a semaphore pattern with promise-based queue for waiting callers.
 * Workers (Perplexity, Google Places, YouTube) use this to limit simultaneous
 * API calls and prevent rate limiting or resource exhaustion.
 *
 * @example
 * ```typescript
 * const limiter = new ConcurrencyLimiter(3); // max 3 concurrent
 *
 * async function doWork() {
 *   await limiter.acquire();
 *   try {
 *     await someApiCall();
 *   } finally {
 *     limiter.release();
 *   }
 * }
 *
 * // Or use the helper (recommended):
 * const result = await limiter.run(async () => {
 *   return await someApiCall();
 * });
 * ```
 */
export class ConcurrencyLimiter {
  /** Maximum number of concurrent operations */
  private readonly limit: number;

  /** Current number of running operations */
  private running: number = 0;

  /** FIFO queue of pending acquire() calls waiting for a slot */
  private queue: Array<() => void> = [];

  /**
   * Creates a new ConcurrencyLimiter.
   *
   * @param limit - Maximum number of concurrent operations (default: 3)
   * @throws Error if limit is less than 1
   */
  constructor(limit: number = 3) {
    if (limit < 1) {
      throw new Error('Concurrency limit must be at least 1');
    }
    if (!Number.isInteger(limit)) {
      throw new Error('Concurrency limit must be an integer');
    }
    this.limit = limit;
  }

  /**
   * Acquires a slot for execution.
   *
   * If a slot is available, returns immediately. Otherwise, queues the request
   * and waits until a slot becomes available (FIFO ordering).
   *
   * @returns Promise that resolves when a slot is acquired
   */
  async acquire(): Promise<void> {
    if (this.running < this.limit) {
      this.running++;
      return;
    }

    // All slots in use - queue and wait for release
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Releases a previously acquired slot.
   *
   * If there are pending requests in the queue, the next one is immediately
   * granted the slot (FIFO order). Always call this in a finally block to
   * prevent deadlocks.
   *
   * @remarks
   * Logs a warning if called without a matching acquire() but does not throw.
   * This prevents crashes from programming errors while still alerting developers.
   */
  release(): void {
    if (this.running <= 0) {
      console.warn(
        'ConcurrencyLimiter: release() called without matching acquire()'
      );
      return;
    }

    this.running--;

    // Process next waiting request in FIFO order
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }

  /**
   * Executes a function with automatic acquire/release handling.
   *
   * This is the recommended way to use the limiter as it guarantees
   * the slot is released even if the function throws an error.
   *
   * @param fn - Async function to execute within the concurrency limit
   * @returns Promise resolving to the function's return value
   * @throws Rethrows any error from fn after releasing the slot
   *
   * @example
   * ```typescript
   * const result = await limiter.run(async () => {
   *   const response = await fetch(url);
   *   return response.json();
   * });
   * ```
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Gets current statistics about the limiter state.
   *
   * Useful for monitoring and debugging concurrency behavior.
   *
   * @returns Object with running count, queued count, and limit
   */
  getStats(): ConcurrencyStats {
    return {
      running: this.running,
      queued: this.queue.length,
      limit: this.limit,
    };
  }

  /**
   * Checks if a slot is immediately available without waiting.
   *
   * @returns true if acquire() would return immediately, false if it would queue
   */
  isAvailable(): boolean {
    return this.running < this.limit;
  }

  /**
   * Gets the configured concurrency limit.
   *
   * @returns The maximum number of concurrent operations
   */
  getLimit(): number {
    return this.limit;
  }

  /**
   * Gets the number of currently running operations.
   *
   * @returns Current running count
   */
  getRunning(): number {
    return this.running;
  }

  /**
   * Gets the number of operations waiting in the queue.
   *
   * @returns Current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }
}

/**
 * Default concurrency limiter for worker API calls.
 *
 * Shared instance with limit of 3 concurrent operations.
 * Use this for general worker operations or create a custom
 * limiter for specific requirements.
 */
export const defaultLimiter = new ConcurrencyLimiter(3);
