# Developer Mode (bean folio-assistant-2ngl): the MCP-vs-CLI parity gap is
# measured, developer mode is a point in the deployment topology, and a lane
# whose role needs a capability the configured model lacks refuses rather
# than degrades. Each Scenario names the test that executes it.
Feature: Developer mode is measured, expressible as topology, and refuses an under-capable model

  @test:scripts/tests/tools/developer-mode-parity.test.ts::MCP-vs-CLI_tool_parity_measurer::measures_live_declared_tools_and_outputs_structured_report
  Scenario: The parity measurer reports on the live declared Tools
    When tool parity is measured over the declared Tools
    Then there are more than 50 Tools, at least 5 on both surfaces, at least 10 MCP-only and at least 50 CLI-only
    And the measurement date is YYYY-MM-DD
    And the MCP-only Tools include "workflow-start", "workflow-complete", "skill-fetch" and "translation-status"
    And the MCP-only skills include "process-state" and "skills-and-tools"
    And the formatted report has the title, "Measurement Date", "MCP-Only Skills" and "process-state"

  @test:scripts/tests/tools/developer-mode-parity.test.ts::MCP-vs-CLI_tool_parity_measurer::correctly_categorizes_synthetic_tool_fixtures
  Scenario: Synthetic Tools are categorised by the surfaces they are invoked on
    Given four Tools invoked on MCP and shell, MCP only, shell only, and manually
    When tool parity is measured over them with no package.json
    Then there are 4 Tools, one each both, MCP-only, CLI-only and neither
    And their skills are sorted into both, MCP-only and CLI-only accordingly
    And the gap summary counts 1 MCP-only skill

  @test:scripts/tests/tools/developer-mode-parity.test.ts::Developer_Mode_Topology::developer_mode_topology_point_conforms_to_schema_and_produces_zero_conflicts
  Scenario: The developer-mode topology parses and has no conflicts
    When the developer-mode topology is parsed
    Then its forge is "none", compute "workstation", tool surface "cli", model cardinality "single", data stores ["none"] and it is not outward-facing
    And the developer profile is named "developer", publishes to "local-server" and is a deployment profile
    And the topology has no conflicts with "local-server"

  @test:scripts/tests/tools/developer-mode-parity.test.ts::Developer_Mode_Topology::all_10_proposal_axes_are_expressible_and_validated
  Scenario: The topology axes have their declared values and refuse unknown ones
    # Gap: the title says "all 10" axes; the body lists eight enums exactly, checks one publication host by containment, and tests invalid-value rejection for only compute, toolSurface and modelCardinality
    Then the compute, tool-surface, model-cardinality, data-store, visibility, forge, network-reach and model-provenance values are exactly as declared
    And the publication hosts include "local-server"
    And parsing a topology with compute "quantum-mainframe", tool surface "voice-assistant" or model cardinality "infinite" throws

  @test:scripts/tests/tools/developer-mode-parity.test.ts::Single-Model_Capability_Refusal_Guard::reasoningTierGte_respects_tier_hierarchy
  Scenario: Reasoning tiers are ordered low < medium < high < expert
    Then each tier is at least itself or the tier below it
    And low is not at least medium, medium not at least high, high not at least expert

  @test:scripts/tests/tools/developer-mode-parity.test.ts::Single-Model_Capability_Refusal_Guard::checkModelCapabilities_detects_all_capability_gaps
  Scenario: Every capability gap of a model is reported
    Given requirements of high reasoning, tool use, a 64000 context, multimodal and two named capabilities
    When a model short on all five is checked
    Then it is not satisfied, with violations on reasoning_tier, tool_use, context_window, multimodal and capabilities in that order
    And a model meeting all five is satisfied with no violations

  @test:scripts/tests/tools/developer-mode-parity.test.ts::Single-Model_Capability_Refusal_Guard::workflow_lane_refusing_under-capable_single_model
  Scenario: A lane refuses a model its role's requirements exceed
    Given a "researcher" role needing high reasoning, tool use and a 64000 context, and a "formatter" role needing low reasoning
    Then a small low-tier model is accepted for the formatter lane
    And it is refused for the researcher lane with a capability-refusal error naming the role, lane and model, with 3 violations
    And the error message says "Workflow refused" and "Refusing rather than silently degrading"
    And a strong model is accepted for the researcher lane

  @test:scripts/tests/tools/developer-mode-parity.test.ts::Single-Model_Capability_Refusal_Guard::workflow_startInstance_and_complete_enforce_capability_refusal_guard
  Scenario: Starting and completing a workflow step refuse an under-capable model
    Given the crdm-requirements process and a business-analyst role needing high reasoning and tool use
    Then starting an instance with an under-capable model throws a capability-refusal error
    And starting with a capable model gives a running instance holding tokens
    And completing its first token with the under-capable model throws a capability-refusal error
    And completing it with the capable model records that node in the history
