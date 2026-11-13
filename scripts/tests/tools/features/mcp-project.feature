# The MCP projection and the injection defence it rests on: a dangerous value
# cannot be constructed, because every command-line input references a type
# that refuses it; the argv array is the second line of defence. Each Scenario
# names the test that executes it.
Feature: Tools project onto MCP with argv built only from typed, injection-safe values

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::argv_is_an_array,_and_the_command_is_its_head
  Scenario: The argv is an array headed by the command
    Given a Tool "beans" with a positional BeanId and a --status BeanStatus flag
    When argv is built for id "fa-1dfh" and status "in-progress"
    Then argv is "beans", "fa-1dfh", "--status", "in-progress"

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::a_payload_cannot_be_constructed_—_the_type_refuses_it
  Scenario: A shell payload as a BeanId is refused
    Given the beans Tool
    When argv is built with id "; rm -rf /", "$(whoami)", "`id`", "a && b", "x | y" or "../../etc/passwd"
    Then each build throws

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::an_enum_input_refuses_anything_outside_the_enum
  Scenario: An enum input refuses a value outside the enum
    Given the beans Tool
    When argv is built with status "completed; rm -rf /"
    Then the build throws

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::a_missing_required_input_throws_rather_than_producing_a_short_argv
  Scenario: A missing required input is refused
    Given the beans Tool
    When argv is built with no inputs
    Then the build throws "required input"

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::positionals_keep_their_declared_order_regardless_of_declaration_order
  Scenario: Positionals follow their positions, not their declaration order
    Given a Tool declaring positional 1 "second" before positional 0 "first"
    When argv is built for first "a" and second "b"
    Then argv is "cmd", "a", "b"

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::free_prose_goes_on_stdin,_never_into_argv
  Scenario: A Markdown input goes on stdin
    Given a Tool whose Markdown "body" input is read from stdin
    When argv is built with a body containing shell metacharacters
    Then argv is only "cmd"
    And stdin is the body unchanged

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::Markdown_is_not_injection-safe,_and_that_is_deliberate
  Scenario: Markdown is not injection-safe; the identifier types are
    Then Markdown is not injection-safe
    And BeanId, BeanStatus, RepoPath, Url, Branch and ChangeProposalNumber are injection-safe

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::every_injection-safe_type_actually_refuses_metacharacters
  Scenario: Every injection-safe type refuses shell metacharacters and spaces
    Given every Tool type marked injection-safe
    Then none accepts "; rm -rf /", "$(whoami)", "`id`" or "a b"

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::a_Tool_reachable_over_MCP_is_omitted,_with_a_reason
  Scenario: A Tool with both shell and MCP invocations projects on its shell arm
    # Gap: the body asserts the OPPOSITE of the title: the shell+MCP Tool is NOT omitted (it is declared as "shell_and_mcp" and there are no omissions)
    Given a Tool invoked by shell and by MCP tool "some_mcp_tool"
    When the Tools are projected
    Then the declarations include "shell_and_mcp"
    And there are no omissions

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::an_unmet_requirement_means_NOT_LISTED,_and_the_omission_is_reported
  Scenario: A Tool whose requirement is unmet is omitted with a reason
    Given a Tool requiring network
    When the Tools are projected without network
    Then there are no declarations
    And the omission's reason contains "requires network"
    And the Tool has an unmet requirement without network

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::a_manual-only_Tool_is_omitted,_and_says_why
  Scenario: The beans-manual Tool is either declared or omitted
    # Gap: the title says a manual-only Tool is omitted with a reason; the body checks only that beans-manual (which also has a shell arm) lands in declarations or omissions, not that it is omitted or why
    Given the real Tool "beans-manual"
    When it is projected
    Then it appears once among the declarations and omissions together

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::the_real_Tool_set_projects,_and_every_declaration_has_a_schema
  Scenario: The real Tool set projects, with a name, description and schema each
    When the real Tools are projected with network and the "go" runtime
    Then there is at least one declaration
    And each has a lowercase underscore name, a non-empty description and an input schema

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::a_repeated_flag_is_emitted_once_per_element,_never_comma-joined
  Scenario: A repeated flag is emitted once per element
    Given the real "readme-sync" Tool
    When argv is built with only "folio:toc" and "folio:simulators" and check true
    Then argv is the command, "--check", then "--only folio:toc" and "--only folio:simulators" as separate words

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::a_repeated_positional_becomes_trailing_words
  Scenario: A repeated positional becomes trailing words
    Given the real "stakeholder-map" Tool
    When argv is built with paths "src/a.ts" and "skills/folio-core/x.md"
    Then argv is the command followed by those two paths

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::each_element_of_a_repeated_input_is_parsed_by_the_element_type
  Scenario: Each element of a repeated input is type-checked
    Given the real "stakeholder-map" Tool
    Then building argv with a path "../../etc/passwd" among the paths throws
    And building argv with a path "src/a.ts; rm -rf /" throws

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::a_repeated_input_given_a_scalar_is_an_error,_not_something_to_coerce
  Scenario: A scalar given for a repeated input is refused
    Given the real "stakeholder-map" Tool
    When argv is built with paths as the string "src/a.ts"
    Then the build throws "needs an array"

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::a_boolean_projects_to_the_presence_of_its_flag,_and_false_to_nothing
  Scenario: A true boolean is its flag, a false one is nothing
    Given the real "readme-audit" Tool
    When argv is built for file README.md with fetch true
    Then argv is the command, "README.md", "--fetch"
    And with fetch false argv is the command and "README.md" only

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::an_in-process_Tool_says_so_rather_than_reading_as_a_broken_record
  Scenario: Building argv for an in-process Tool says it is in-process
    Given the real "skill-fetch" Tool
    When argv is built for it
    Then the build throws "in-process"

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::the_migrated_MCP_surface_matches_what_the_server_actually_serves
  Scenario: Every served MCP tool matches its Tool node
    When the real MCP registrars are captured
    Then there are no capture problems
    And each served tool has a Tool node with the same in-process module
    And each served input is declared on the node, each declared input is served, and their required flags agree

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::an_invocation_records_who,_in_which_role,_at_which_task
  Scenario: An invocation record carries actor, role and task
    When an invocation of the beans Tool by "authoring-agent" as "content-author" at Task_ReviewStaging is recorded
    Then the record is a valid Tool invocation
    And it names that actor, role and task

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::recording_a_skill_the_Tool_does_not_satisfy_is_refused
  Scenario: Recording an invocation for a skill the Tool does not satisfy is refused
    When an invocation of the beans Tool for skill "not-a-skill-it-satisfies" is recorded
    Then recording throws "does not satisfy"

  @test:scripts/tests/tools/mcp-project.test.ts::mcp_projection::a_refusal_without_a_reason_is_not_a_valid_record
  Scenario: A refused invocation must carry a reason
    Given an invocation record with outcome "refused-permission"
    Then without a reason it is not a valid Tool invocation
    And with the reason "lacks admin-settings" it is valid
