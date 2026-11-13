# The Tools as an API (`scripts/tool-api.ts`): an OpenAPI document that
# describes contracts, not a server, and the MCP tool list read from the
# registrars. Each Scenario names the test that executes it.
Feature: The Tools are published as an OpenAPI document and an MCP tool list

  @test:scripts/tests/tools/tool-api.test.ts::openApiFor::is_OpenAPI_3.1_with_no_servers,_and_says_its_paths_are_contracts
  Scenario: The OpenAPI document is 3.1, has no servers, and says no server serves it
    Given the OpenAPI document for the demo Tool
    Then its openapi version is "3.1.0"
    And its servers are empty
    And its description says "No HTTP server serves these paths"

  @test:scripts/tests/tools/tool-api.test.ts::openApiFor::has_one_operation_per_Tool,_carrying_its_IRI,_invocation,_MCP_names_and_skills
  Scenario: The Tool's operation carries its IRI, invocation, MCP names and skill
    Given the OpenAPI document for the demo Tool
    When the POST operation at /tools/demo-tool is read
    Then its operationId is "demo-tool" and its x-tool-iri is the Tool's IRI
    And its x-invoke is the Tool's invocation and its x-mcp-tools are ["demo_run"]
    And its tags are ["process-state"]

  @test:scripts/tests/tools/tool-api.test.ts::openApiFor::resolves_every_$ref_inside_the_document_—_a_skill_contract's_own_definitions_are_hoisted
  Scenario: Every $ref resolves inside the document, with skill-contract definitions hoisted
    Given the OpenAPI document for the demo Tool, whose skill contract defines "A"
    Then its component schemas include "ProcessId", "skill.process-state.input" and "skill.process-state.input.A"
    And every $ref points under #/components/schemas/ at a schema that exists

  @test:scripts/tests/tools/tool-api.test.ts::hoistSchema::rewrites_#,_#/definitions_and_#/$defs_refs_to_the_hoisted_names
  Scenario: Hoisting a schema rewrites its internal refs
    Given a schema with an $id, a "#" ref, a "#/$defs/D" ref and a "#/definitions/E" ref
    When it is hoisted under the name "N"
    Then the hoisted names are "N", "N.D" and "N.E"
    And its refs point at those three component schemas
    And the hoisted "N" has no $id

  @test:scripts/tests/tools/tool-api.test.ts::the_MCP_tool_list::reads_each_served_name_and_its_input_schema_from_the_registrar
  Scenario: The registrar's served tools and input schemas are captured
    Given a registrar serving "demo_start" (process required, note optional), "demo_next" and "other_tool"
    When the registrar is captured
    Then the names are "demo_start", "demo_next", "other_tool" in order
    And demo_start's properties are "process" and "note", with only "process" required

  @test:scripts/tests/tools/tool-api.test.ts::the_MCP_tool_list::expands_a_pattern_to_the_served_names,_and_falls_back_to_the_declared_inputs_only_by_name
  Scenario: An MCP name pattern expands to served names; a plain name falls back to declared inputs
    Given the demo Tool invoked in process through the registrar with MCP pattern "demo_*"
    When the MCP tool list is built
    Then there are no problems and the tools are "demo_next" and "demo_start", sourced from the registrar for "demo-tool"
    And for the Tool with MCP name "demo_run" the list holds "demo_run" sourced as "declared", requiring "process"
