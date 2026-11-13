# Tool nodes are real, well formed and reachable from the graph: their
# `satisfies` edges agree with the skills' contracts, their ports name
# published types at the publication base, substitutable Tools are derived
# and say how to choose (#1168, B9a), the gates Tool is one node over a
# derived list, and `storage.tool` names a declared Tool (bean j9cs). Each
# Scenario names the test that executes it.
Feature: Tool nodes are well formed, typed against published IRIs, and agree with the skills they satisfy

  @test:scripts/tests/tools/tools.test.ts::tools::there_are_tools_to_check_—_otherwise_everything_below_is_vacuous
  Scenario: There are at least four Tools
    Then the discovered Tools number at least 4

  @test:scripts/tests/tools/tools.test.ts::tools::every_satisfies_edge_agrees_with_its_skill's_own_input_contract
  Scenario: No satisfies edge leaves a contract's required input without a port
    When the Tools are checked
    Then there are no unmet contracts

  @test:scripts/tests/tools/tools.test.ts::tools::where_a_Tool_input_and_a_contract_property_share_a_name,_their_types_agree
  Scenario: Same-named Tool inputs and contract properties agree in type
    When the Tools are checked
    Then there are no mistyped contracts

  @test:scripts/tests/tools/tools.test.ts::tools::a_contract_that_is_present_but_unreadable_is_never_counted_as_agreement
  Scenario: Unreadable, absent and present contracts are told apart
    # Gap: no unreadable contract is constructed; the body checks only that the corpus has none, that an absent skill's contract is undefined, and that content-validate requires targetPath
    When the Tools are checked
    Then there are no unreadable contracts
    And the contract requirements of "no-such-skill-exists" are undefined
    And those of "content-validate" include "targetPath"

  @test:scripts/tests/tools/tools.test.ts::tools::every_skill_I/O_contract_publishes_at_the_address_its_own_$id_claims
  Scenario: Every skill I/O contract's $id is where it is published
    When the skill I/O contracts are built for a base
    Then there is at least one
    And each $id is the skill I/O IRI under the host's directory
    And each $id equals the host directory joined with its published path

  @test:scripts/tests/tools/tools.test.ts::tools::no_source_$id_has_drifted_from_where_it_publishes
  Scenario: No source skill I/O $id has drifted
    Then there are no stale skill I/O ids

  @test:scripts/tests/tools/tools.test.ts::tools::every_io_port_references_a_type_the_shared_vocabulary_declares
  Scenario: Every port references a declared Tool type
    When the Tools are checked
    Then there are no unknown types

  @test:scripts/tests/tools/tools.test.ts::tools::io_references_are_absolute_IRIs_into_the_published_types_document
  Scenario: Every port's schema is an absolute IRI to a published type
    Given the Tool-types document built for a base
    Then it defines exactly one entry per Tool type
    And every Tool port's schema starts with "https://" and names a defined type

  @test:scripts/tests/tools/tools.test.ts::tools::a_Tool_reachable_only_over_MCP_is_rejected
  Scenario: A Tool invocable only over MCP is refused
    Given a Tool whose only invocation is an MCP tool
    Then it does not parse
    And the same Tool with a shell invocation added parses

  @test:scripts/tests/tools/tools.test.ts::tools::a_Tool_satisfying_nothing_is_rejected
  Scenario: A Tool satisfying no skill is refused
    Given a Tool with an empty satisfies list
    Then it does not parse

  @test:scripts/tests/tools/tools.test.ts::tools::the_beans_pair_satisfies_exactly_the_same_skills
  Scenario: beans-cli and beans-manual satisfy the same skills
    Then the sorted satisfies of "beans-manual" equal those of "beans-cli"

  @test:scripts/tests/tools/tools.test.ts::tools::the_generated_schemas_carry_an_absolute_$id
  Scenario: The generated Tool and Tool-types schemas carry absolute $ids
    When the Tool schema and Tool-types schema are built for a base
    Then their $ids are <base>/cat-harness/tool.schema.json and <base>/cat-harness/tool-types.schema.json

  @test:scripts/tests/tools/tools.test.ts::tools::each_type_is_its_own_document,_whose_$id_is_the_IRI_a_port_names_(bean_tdir)
  Scenario: Each Tool type is its own document whose $id is the type's IRI
    When the per-type files are built for a base
    Then there is one file tool-types/<Name>.schema.json per Tool type
    And each $id is the type's document IRI under the host directory and matches its path
    And each body equals that type's entry in the combined document
    And every Tool port names one of the types

  @test:scripts/tests/tools/tools.test.ts::tools::skill_discovery_is_the_ONE_definition,_not_a_second_scan
  Scenario: check-tools' known skills are the canonical known skills
    When check-tools' known skills are compared with the canonical ones for the harness
    Then neither set has a skill the other lacks
    And neither "the-complement", "confirm-harness" nor "log-message" is known to the harness
    And "log-message" is a known skill of bootstrap

  @test:scripts/tests/tools/tools.test.ts::tools::io_IRIs_follow_the_publication_base,_not_the_declaration
  Scenario: An export's Tool port IRIs follow the publication base
    Given a KG export built at a staging base
    Then it holds at least 4 Tool nodes
    And every port schema is the Tool-type IRI under the staging host's tool-types

  @test:scripts/tests/tools/tools.test.ts::tools::tools()_honours_an_explicit_base
  Scenario: Tools discovered with an explicit base mint IRIs under it
    When the Tools are discovered with base "https://example.invalid/other"
    Then every port schema starts with that host's tool-types

  @test:scripts/tests/tools/tools.test.ts::substitutable_Tools_are_DERIVED,_and_say_how_to_choose_(#1168,_B9a)::the_derived_pairs_are_exactly_the_substitutable_ones
  Scenario: The derived substitutable pairs are exactly the expected ones
    When alternatives are derived from the Tools
    Then the pairs are the beans pair, the five GitHub/GitLab pairs, the ingest pair, the release pair, the serve-rendering pair and the three transcribe pairs
    And the glossary-table and memory pairs are included only where those Tools are mounted

  @test:scripts/tests/tools/tools.test.ts::substitutable_Tools_are_DERIVED,_and_say_how_to_choose_(#1168,_B9a)::the_relation_is_symmetric_by_construction
  Scenario: The alternative relation is symmetric
    Then for every Tool a with alternative b, b has a as an alternative

  @test:scripts/tests/tools/tools.test.ts::substitutable_Tools_are_DERIVED,_and_say_how_to_choose_(#1168,_B9a)::every_Tool_with_an_alternative_carries_all_three_selection_fields
  Scenario: Every Tool with an alternative states when, limits and cost
    Then every Tool with an alternative has selection "when", "limits" and "cost"

  @test:scripts/tests/tools/tools.test.ts::substitutable_Tools_are_DERIVED,_and_say_how_to_choose_(#1168,_B9a)::check-tools_reports_a_Tool_with_an_alternative_and_no_selection
  Scenario: A Tool with an alternative and no selection is reported
    Then check-tools reports no unselectable alternatives for the real Tools
    And with "ingest-stdlib"'s selection removed, it is reported with alternative "ingest-extended"

  @test:scripts/tests/tools/tools.test.ts::substitutable_Tools_are_DERIVED,_and_say_how_to_choose_(#1168,_B9a)::sharing_a_skill_does_NOT_imply_substitutability
  Scenario: Tools sharing a skill are not thereby alternatives
    Given the Tools satisfying "process-state"
    Then there is more than one
    And none has an alternative

  @test:scripts/tests/tools/tools.test.ts::substitutable_Tools_are_DERIVED,_and_say_how_to_choose_(#1168,_B9a)::an_empty_signature_is_interchangeable_with_nothing
  Scenario: Two Tools with empty signatures are not alternatives
    Given two copies of ingest-stdlib with no inputs or outputs
    When alternatives are derived
    Then there are none

  @test:scripts/tests/tools/tools.test.ts::substitutable_Tools_are_DERIVED,_and_say_how_to_choose_(#1168,_B9a)::the_ingest_pair_is_derived,_and_splits_on_the_dependency_boundary
  Scenario: The ingest pair splits on needing a toolchain
    Then "ingest-stdlib" and "ingest-extended" both exist
    And ingest-stdlib installs nothing while ingest-extended needs a CLI
    And they satisfy the same skills
    And each one's selection limits names the other

  @test:scripts/tests/tools/tools.test.ts::the_gates_Tool_—_one_node_over_a_derived_list::the_node_exists,_or_nothing_below_is_testing_anything
  Scenario: The gates Tool exists
    Then a Tool with id "gates" exists

  @test:scripts/tests/tools/tools.test.ts::the_gates_Tool_—_one_node_over_a_derived_list::its_command_is_a_real_script,_not_a_guess_at_one
  Scenario: The gates Tool runs a declared script
    Then its shell invocation is "bun run cat gates"
    And the repository's "gates" script runs scripts/gates.ts

  @test:scripts/tests/tools/tools.test.ts::the_gates_Tool_—_one_node_over_a_derived_list::every_flag_it_declares_is_one_`gates.ts`_actually_reads
  Scenario: The gates Tool's flags are the ones gates.ts reads
    Then its flag inputs are exactly "--all" and "--list"
    And gates.ts checks process.argv for each

  @test:scripts/tests/tools/tools.test.ts::the_gates_Tool_—_one_node_over_a_derived_list::there_is_exactly_ONE_gate_Tool,_and_the_list_stays_derived
  Scenario: There is exactly one gate Tool
    # Gap: the body checks only that no other Tool is named "gate-*"; nothing checks that the gate list is derived
    Then the Tools named "gates" or starting "gate-" are only "gates"

  @test:scripts/tests/tools/tools.test.ts::the_gates_Tool_—_one_node_over_a_derived_list::it_says_why_it_exists_where_CI_does_not,_which_is_the_whole_business_case
  Scenario: The gates Tool says why it exists beside CI
    Then its selection has "when", "limits" and "cost"
    And its "when" contains "INHERITED"
    And it does not require network

  @test:scripts/tests/tools/tools.test.ts::storage.tool_names_a_declared_Tool_(bean_j9cs)::the_repository's_own_declarations_name_only_declared_Tools
  Scenario: The repository's storage declarations name declared Tools
    Then there are no dangling storage Tools

  @test:scripts/tests/tools/tools.test.ts::storage.tool_names_a_declared_Tool_(bean_j9cs)::a_store_naming_no_declared_Tool_is_reported,_with_where_it_was_declared
  Scenario: A store naming an undeclared Tool is reported with its instance and directory
    Given an instance "inst" whose "site" store names "no-such-tool" and whose "ok" store names "gh-pages"
    When dangling storage Tools are found
    Then the only finding is instance "inst", directory "site", Tool "no-such-tool"
