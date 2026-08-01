import type { RelayOpsAdapter } from "./contracts";
import { createApiAdapter } from "./api-adapter";

/**
 * Sole UI binding. Workspace/session, support, and Knowledge methods call the
 * local Nest API; only clearly labeled public help articles remain static.
 */
export const relayOpsService: RelayOpsAdapter = createApiAdapter();
