import type { AgentCallbacks } from "@chloe/core";

export interface AgentHandle {
  run(sessionId: string, message: string, callbacks: AgentCallbacks): Promise<void>;
  forceCompress(
    sessionId: string,
    callbacks: Pick<AgentCallbacks, "onContextCompressed">,
  ): Promise<void>;
}
