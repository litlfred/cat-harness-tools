# `tool` is a QA subject kind (issue #853), and its criteria project rather
# than decide: `tool-maintains-in-tree` can only be `unknown` from a
# checkout, and a Tool with no alternative is `n/a`. All reports come from a
# fresh `kg-audit --check --json` run. Each Scenario names the test that
# executes it.
Feature: Every Tool gets a QA report whose criteria project rather than decide

  @test:scripts/tests/tools/tool-qa-subjects.test.ts::the_subject_kind_exists_and_is_not_empty::`tool`_is_a_subject_kind
  Scenario: tool is a KG QA subject kind
    Then the KG subject kinds include "tool"

  @test:scripts/tests/tools/tool-qa-subjects.test.ts::the_subject_kind_exists_and_is_not_empty::it_carries_at_least_one_criterion
  Scenario: At least one criterion applies to tools
    Then at least one KG criterion applies to "tool"

  @test:scripts/tests/tools/tool-qa-subjects.test.ts::the_subject_kind_exists_and_is_not_empty::the_fresh_audit_ran_and_reported_on_Tools_at_all
  Scenario: The fresh audit reported on at least one Tool
    When the KG audit is run with --check --json
    Then it produced at least one Tool report

  @test:scripts/tests/tools/tool-qa-subjects.test.ts::the_subject_kind_exists_and_is_not_empty::every_Tool_node_gets_a_report_—_all_of_them,_not_a_sample
  Scenario: Every harness Tool has a fresh report
    Given every Tool the harness declares
    Then each has a report from the fresh audit

  @test:scripts/tests/tools/tool-qa-subjects.test.ts::the_criteria_project,_they_do_not_decide::no_tool_criterion_re-answers_`maintains`_presence_itself
  Scenario: tool-maintains-in-tree points at check:maintained-artefacts
    # Gap: the title says no criterion re-answers maintains presence; the body checks only that the criterion exists and its summary names check:maintained-artefacts
    When the "tool-maintains-in-tree" criterion is looked up
    Then it exists
    And its summary contains "check:maintained-artefacts"

  @test:scripts/tests/tools/tool-qa-subjects.test.ts::the_two_results_that_are_not_`pass`::there_are_tools_of_each_shape_—_otherwise_the_assertions_below_are_vacuous
  Scenario: There are Tools with maintains claims and Tools with no alternative
    Given the harness Tools
    Then at least one declares "maintains"
    And at least one has no derived alternative

  @test:scripts/tests/tools/tool-qa-subjects.test.ts::the_two_results_that_are_not_`pass`::a_`maintains`_claim_is_`unknown`_from_a_checkout,_never_`pass`
  Scenario: A Tool's maintains claim is unknown from a checkout
    Given every harness Tool declaring "maintains"
    When its fresh report is validated and read
    Then its "tool-maintains-in-tree" result is "unknown"
    And its first finding names "check:maintained-artefacts"

  @test:scripts/tests/tools/tool-qa-subjects.test.ts::the_two_results_that_are_not_`pass`::a_Tool_with_no_alternative_records_`n/a`,_not_a_pass
  Scenario: A Tool with no alternative records n/a
    # Gap: only the first 5 Tools with no alternative are checked, not all of them
    Given the first five harness Tools with no derived alternative
    When each fresh report is read
    Then its "tool-alternative-selectable" result is "n/a"

  @test:scripts/tests/tools/tool-qa-subjects.test.ts::the_permanent_`unknown`_cannot_put_a_gate_out_of_reach::`tool-maintains-in-tree`_is_`minor`
  Scenario: tool-maintains-in-tree has minor severity
    Then the "tool-maintains-in-tree" criterion's severity is "minor"

  @test:scripts/tests/tools/tool-qa-subjects.test.ts::the_permanent_`unknown`_cannot_put_a_gate_out_of_reach::no_Tool_sidecar_is_`critical`,_so_`kg:audit:check`_still_passes
  Scenario: No Tool's fresh report has critical worst severity
    Given every harness Tool's fresh report
    Then none has worst severity "critical"
