# Implementation Notes: Multi-Model Routing System

## Design Decisions

### Decision: Routing Detection Method (Prompt-based Classification)
- **Chose**: Model outputs route tokens at line start (`[REASONING]`, `[VISION]`, `[FAST]`)
- **Rationale**: Zero latency overhead, cost optimal (single API call), model self-knows task complexity, smooth user experience
- **Rejected alternatives**:
  - Separate classification call: Adds extra API call, doubles latency and cost
  - Fast model first then upgrade: Wastes tokens on restart, interrupted UX
- **Trade-off**: Need to design prompt well; edge cases may misclassify

### Decision: Routing Architecture (RoutingRunLoop Layer)
- **Chose**: Routing layer outside RunLoop, RunLoop enhanced for route monitoring
- **Rationale**: Routing logic centralized, easy to understand/debug; RunLoop changes are enhancement not rewrite; tool execution as independent module
- **Rejected alternatives**:
  - Routing inside Agent: Agent becomes complex, routing and execution coupled
  - Multiple Agent instances: Most complex, need to manage multiple agents and state transfer
- **Trade-off**: Need to refactor RunLoop but keeps backward compatibility

### Decision: Tool Execution Model Switching
- **Chose**: All tools executed by default_model, results return to calling model
- **Rationale**: Simplifies tool execution (one model for all), calling model maintains reasoning context
- **Rejected alternatives**:
  - Tools use calling model: Different models may have different tool capabilities
  - Batch execution: Reduces flexibility, sequential execution needed for dependencies
- **Trade-off**: Extra model switches on each tool call, but execution consistency maintained

### Decision: Tool Result Route Token Detection
- **Chose**: Route tokens in tool results also trigger switching (line start only)
- **Rationale**: Enables dynamic routing based on discovered complexity
- **Trade-off**: May trigger unexpected switches if file content happens to start with route token

### Decision: Image Input Pre-routing
- **Chose**: Detect images before request, route directly to vision_model
- **Rationale**: Skip route token detection for obvious multimodal requests
- **Rejected alternatives**:
  - Route token detection after default_model: Extra latency for image requests
- **Trade-off**: Need reliable image detection (paths, URLs)

### Decision: Model Switch Handling
- **Chose**: Discard already-generated content, restart with target model
- **Rationale**: Generation quality priority - single model complete generation, consistent style, coherent logic
- **Rejected alternatives**:
  - Continue with existing content: Style discontinuity, logic gaps between models
- **Trade-off**: Small token waste (~10-50 tokens typically), necessary routing cost

### Decision: Configuration Field Naming
- **Chose**: Rename `model` to `default_model`, add `reasoning_model`, `fast_model`, `vision_model`
- **Rationale**: Clear naming shows role of each model
- **Rejected alternatives**:
  - Keep `model` as default: Ambiguous naming
  - Nested `[provider.models]`: Changes existing structure
- **Trade-off**: Breaking change for existing users, requires manual config update

### Decision: Breaking Change Handling
- **Chose**: Silently ignore legacy `model` field, no auto-migration
- **Rationale**: Simple implementation, clear expectation for users to update
- **Rejected alternatives**:
  - Auto-migration: Adds complexity, may confuse users
  - Backward compatibility: Maintains complexity indefinitely
- **Trade-off**: Users must manually update config; document migration guide

### Decision: Video Support Scope
- **Chose**: Current scope excludes video, vision_model handles images only
- **Rationale**: Video support requires frame extraction or file upload handling, deferred as future feature
- **Trade-off**: Users expecting video will need to wait for future implementation

## Technical Constraints Discovered

1. **Anthropic API model IDs**: Must use valid model IDs (claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5)
2. **Image URL fetching**: Need timeout and size limits to avoid slow/huge responses
3. **Route token format**: Must be at line start to avoid false triggers from normal content
4. **Switch limit**: 5 switches per request maximum to prevent infinite loops

## Open Questions Answered During Brainstorm

| Question | Answer | Rationale |
|----------|--------|-----------|
| How to route requests? | Prompt-based route tokens | Zero latency, cost optimal |
| Which model first? | default_model | Balanced starting point |
| Image handling? | Pre-route to vision_model | Skip detection for obvious cases |
| Tool execution model? | default_model for all | Consistency, calling model context |
| Switch handling? | Discard and restart | Quality priority |
| Config naming? | default_model, reasoning_model, fast_model, vision_model | Clear role indication |
| Migration strategy? | Breaking change, manual update | Simple, clear |
| Tool result routing? | Yes, detect route tokens | Dynamic routing capability |