import type { RelayOpsAdapter } from "./contracts";
import { mockAdapter } from "./mock-adapter";

/** Single replaceable boundary for all UI data. See docs/INTEGRATION.md. */
export const relayOpsService: RelayOpsAdapter = mockAdapter;
