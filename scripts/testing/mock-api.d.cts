import type { Server } from 'node:http';
export function createMockServer(options?: { runId?: string | null }): Server;
