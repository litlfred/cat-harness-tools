# Specifies gateExemptions on an index config (schemas/kg/index-config.ts),
# in the shape an instance declaration uses (GateExemptionsSchema in
# schemas/kg/cat-harness.ts).
Feature: An index may declare its own gate exemptions

  @test:schemas/index-config-gate-exemptions.test.ts::an_index's_own_gate_exemptions::parse_in_the_shape_an_instance_declaration_uses
  Scenario: Index gate exemptions parse in the declaration's shape
    Given a step exemption of kind "ci-only" with a reason
    When it is parsed inside an index config and on its own as gate exemptions
    Then both parse

  @test:schemas/index-config-gate-exemptions.test.ts::an_index's_own_gate_exemptions::are_refused_when_malformed_—_no_reason,_an_unknown_kind,_an_unknown_key
  Scenario: Malformed index gate exemptions are refused
    Given exemptions with a blank reason, with kind "slow", and with an extra key
    When each is parsed inside an index config
    Then each is refused

  @test:schemas/index-config-gate-exemptions.test.ts::an_index's_own_gate_exemptions::survive_formatIndexConfig,_last,_and_are_absent_when_not_declared
  Scenario: Gate exemptions survive formatting, last, and are absent when undeclared
    Given an index config with a site landing and gate exemptions
    When it is formatted and read back
    Then the gate exemptions are unchanged
    And gateExemptions is the last key
    And a config without them formats with no gateExemptions key

  @test:schemas/index-config-gate-exemptions.test.ts::a_file_a_gate's_allowlist_admits_(owner,_2026-10-16,_item_6b)::parses,_beside_steps_and_scripts
  Scenario: A file exemption parses alone and beside step exemptions
    Given a file exemption naming a gate, a file and a reason
    When it is parsed as gate exemptions, alone and together with step exemptions
    Then both parse
    # Gap: the title says "beside steps and scripts", but no script exemption is included.

  @test:schemas/index-config-gate-exemptions.test.ts::a_file_a_gate's_allowlist_admits_(owner,_2026-10-16,_item_6b)::is_refused_with_no_reason,_no_gate,_an_unknown_key,_or_a_path_outside_the_instance
  Scenario: A malformed file exemption is refused
    Given file exemptions with a blank reason, an empty gate, an extra key, an absolute path and a path climbing out with ".."
    When each is parsed as gate exemptions
    Then each is refused
