# Specifies enableSubgraphs on an index config (schemas/kg/index-config.ts).
Feature: An index's enabled sub-graphs round-trip through the formatter

  @test:schemas/index-config-enable-subgraphs.test.ts::an_index's_enabled_sub-graphs::survive_formatIndexConfig,_and_are_absent_when_not_declared
  Scenario: Enabled sub-graphs survive formatting and are absent when undeclared
    Given an index config enabling "cat-harness.sdlc" and "cat-harness.work-plan"
    When it is parsed, formatted and read back
    Then enableSubgraphs is the same two ids
    And a config that declares none formats with no enableSubgraphs key

  @test:schemas/index-config-enable-subgraphs.test.ts::an_index's_enabled_sub-graphs::a_formatted_index_parses_again,_unchanged
  Scenario: A formatted index config is a fixed point of parse and format
    Given an index config enabling "cat-harness.sdlc", parsed and formatted
    When the formatted text is parsed and formatted again
    Then the text is unchanged
