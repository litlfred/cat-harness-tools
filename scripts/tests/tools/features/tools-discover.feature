# Tool auto-discovery (bean p0za): every declared `tools` graph is loaded,
# and every way loading can go wrong is reported, never read as "no tools".
# Each Scenario names the test that executes it.
Feature: Tool discovery loads every declared tools graph and reports every failure

  @test:scripts/tests/tools/tools-discover.test.ts::discoverTools::merges_every_declared_tools_graph,_one_source_per_instance
  Scenario: Every instance's Tools are merged, with one source per instance
    Given instance "alpha" declaring Tools "a-one" and "a-two" and instance "beta" declaring "b-one"
    When the Tools are discovered
    Then there are no failures
    And the Tools are "a-one", "a-two" and "b-one"
    And the sources are alpha with 2 and beta with 1

  @test:scripts/tests/tools/tools-discover.test.ts::discoverTools::a_declared_graph_with_no_index.ts_is_a_failure,_not_zero_tools
  Scenario: A declared tools graph with no index.ts is a failure
    Given instance "alpha" declaring "a-one" and instance "empty" with no tools/index.ts
    When the Tools are discovered
    Then the Tools are only "a-one"
    And there is one failure saying "no index.ts"

  @test:scripts/tests/tools/tools-discover.test.ts::discoverTools::a_module_that_throws_on_load_is_a_failure_with_its_message
  Scenario: A tools module that throws on load is a failure with its message
    Given an instance whose tools/index.ts throws "boom at load"
    When the Tools are discovered
    Then the first failure's reason contains "boom at load"

  @test:scripts/tests/tools/tools-discover.test.ts::discoverTools::a_module_with_no_tools()_export_is_a_failure
  Scenario: A tools module with no tools() export is a failure
    Given an instance whose tools/index.ts exports no tools()
    When the Tools are discovered
    Then the first failure's reason contains "no `tools()`"

  @test:scripts/tests/tools/tools-discover.test.ts::discoverTools::a_Tool_that_fails_its_schema_is_a_failure;_its_valid_siblings_still_load
  Scenario: An invalid Tool is a failure and its valid sibling still loads
    Given an instance returning a valid "ok-tool" and an invalid { id: "no-good" }
    When the Tools are discovered
    Then the Tools are only "ok-tool"
    And the first failure names "no-good"

  @test:scripts/tests/tools/tools-discover.test.ts::discoverTools::onlyInstance_scopes_discovery_to_one_instance's_own_graph
  Scenario: Discovery scoped to one instance loads only its Tools
    Given instances "alpha" with "a-one" and "beta" with "b-one"
    When the Tools are discovered for "beta" only
    Then the Tools are only "b-one"
    And the only source is "beta"

  @test:scripts/tests/tools/tools-discover.test.ts::discoverTools::the_same_Tool_id_from_two_instances_is_a_failure_naming_the_first
  Scenario: The same Tool id in two instances is a failure naming the first
    Given instances "alpha" and "beta" both declaring "shared"
    When the Tools are discovered
    Then there is one Tool
    And the first failure says "also declared by alpha"
