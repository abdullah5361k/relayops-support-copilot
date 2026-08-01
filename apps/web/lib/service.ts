import type { RelayOpsAdapter } from "./contracts";
import { createApiAdapter } from "./api-adapter";

/**
 * Sole UI binding. Private workspace/session methods call the Nest API; only
 * public help, Knowledge, and prewritten chat scenarios remain local static content.
 */
export const relayOpsService: RelayOpsAdapter = createApiAdapter();
