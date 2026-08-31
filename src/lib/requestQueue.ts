// Request Queue System - Prevents API overload
// Manages concurrent requests and rate limiting

interface QueuedRequest {
  id: string;
  action: string;
  username: string;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  addedAt: number;
}

interface QueueState {
  queue: QueuedRequest[];
  processing: boolean;
  lastRequestTime: number;
  requestsInLastMinute: number;
}

const QUEUE_STORAGE_KEY = 'mro_request_queue_state';
const MAX_REQUESTS_PER_MINUTE = 10;
const MIN_DELAY_BETWEEN_REQUESTS = 3000; // 3 seconds minimum between requests

let queueState: QueueState = {
  queue: [],
  processing: false,
  lastRequestTime: 0,
  requestsInLastMinute: 0
};

// Reset requests counter every minute
setInterval(() => {
  queueState.requestsInLastMinute = 0;
}, 60000);

export const getQueueStatus = () => ({
  queueLength: queueState.queue.length,
  processing: queueState.processing,
  requestsInLastMinute: queueState.requestsInLastMinute,
  canProcessNow: canProcessRequest()
});

const canProcessRequest = (): boolean => {
  const now = Date.now();
  const timeSinceLastRequest = now - queueState.lastRequestTime;
  
  return (
    queueState.requestsInLastMinute < MAX_REQUESTS_PER_MINUTE &&
    timeSinceLastRequest >= MIN_DELAY_BETWEEN_REQUESTS
  );
};

const processQueue = async () => {
  if (queueState.processing || queueState.queue.length === 0) return;
  
  queueState.processing = true;

  while (queueState.queue.length > 0) {
    // Wait if we can't process yet
    while (!canProcessRequest()) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const request = queueState.queue.shift();
    if (!request) break;

    try {
      console.log(`[Queue] Processing: ${request.action} for @${request.username}`);
      queueState.lastRequestTime = Date.now();
      queueState.requestsInLastMinute++;
      
      const result = await request.execute();
      request.resolve(result);
    } catch (error) {
      console.error(`[Queue] Error processing ${request.action}:`, error);
      request.reject(error);
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_BETWEEN_REQUESTS));
  }

  queueState.processing = false;
};

export const enqueueRequest = <T>(
  action: string,
  username: string,
  execute: () => Promise<T>
): Promise<T> => {
  return new Promise((resolve, reject) => {
    const request: QueuedRequest = {
      id: `${action}_${username}_${Date.now()}`,
      action,
      username,
      execute,
      resolve,
      reject,
      addedAt: Date.now()
    };

    queueState.queue.push(request);
    console.log(`[Queue] Added: ${action} for @${username}. Queue length: ${queueState.queue.length}`);
    
    // Start processing if not already
    processQueue();
  });
};

export const removeFromQueue = (username: string, action?: string): void => {
  queueState.queue = queueState.queue.filter(req => {
    if (action) {
      return !(req.username === username && req.action === action);
    }
    return req.username !== username;
  });
};

export const clearQueue = (): void => {
  queueState.queue.forEach(req => {
    req.reject(new Error('Queue cleared'));
  });
  queueState.queue = [];
  queueState.processing = false;
};

export const isInQueue = (username: string, action?: string): boolean => {
  return queueState.queue.some(req => {
    if (action) {
      return req.username === username && req.action === action;
    }
    return req.username === username;
  });
};
