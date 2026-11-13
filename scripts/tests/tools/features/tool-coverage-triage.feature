# `tools:coverage` triages uncovered skills into tiers A-D (bean 6366). A
# declared package.json script is evidence, so no skill with one may sit in
# tier D, whose label says "no evidence". `scriptFor` matches strictly. Each
# Scenario names the test that executes it.
Feature: A skill with a declared script is never triaged as having no evidence

  @test:scripts/tests/tools/tool-coverage-triage.test.ts::the_triage_is_asking_a_real_corpus::returns_rows,_and_reads_a_package.json_that_has_scripts
  Scenario: The triage has rows and the package.json has scripts
    When the uncovered skills are triaged and the declared scripts are read
    Then there is at least one row
    And there is at least one script

  @test:scripts/tests/tools/tool-coverage-triage.test.ts::a_declared_script_is_evidence,_so_it_cannot_leave_a_skill_in_D::NO_skill_in_tier_D_has_a_package.json_script
  Scenario: No tier-D skill has a declared script
    Given the triage rows
    Then no row in tier D has a script matched by scriptFor

  @test:scripts/tests/tools/tool-coverage-triage.test.ts::a_declared_script_is_evidence,_so_it_cannot_leave_a_skill_in_D::the_skills_moved_by_this_rule_carry_the_command_NAME_in_their_evidence
  Scenario: A skill with script evidence names the script and is out of tier D
    Given the triage rows whose evidence includes a "script:" entry
    Then there is at least one such row
    And none is in tier D
    And each is in tier C unless it also has serviceTask, io-contract or userTask evidence
    And each names its matched script as "script:<name>" in its evidence

  @test:scripts/tests/tools/tool-coverage-triage.test.ts::a_declared_script_is_evidence,_so_it_cannot_leave_a_skill_in_D::`ci-health`_is_the_worked_case_—_in_C_if_it_is_still_uncovered_at_all
  Scenario: ci-health, if still uncovered, is in tier C with its script as evidence
    # Gap: conditional on ci-health being in the triage; when it is not, nothing is checked
    Given the triage rows
    When a row for "ci-health" exists
    Then it is in tier C
    And its evidence contains "script:check:ci-health"

  @test:scripts/tests/tools/tool-coverage-triage.test.ts::`scriptFor`_is_strict,_because_loose_matching_was_tried_and_rejected::matches_a_whole_colon_segment_of_the_key
  Scenario: scriptFor matches a whole colon segment of a script key
    Given scripts check:ci-health, readme:sections, check:diff-policy and build
    Then "ci-health" matches "check:ci-health"
    And "sections" matches "readme:sections"

  @test:scripts/tests/tools/tool-coverage-triage.test.ts::`scriptFor`_is_strict,_because_loose_matching_was_tried_and_rejected::matches_a_command_that_runs_`<skill>.ts`
  Scenario: scriptFor matches a script whose command runs <skill>.ts
    Given the script "build" runs scripts/render.ts
    Then "render" matches "build"

  @test:scripts/tests/tools/tool-coverage-triage.test.ts::`scriptFor`_is_strict,_because_loose_matching_was_tried_and_rejected::does_NOT_match_a_substring_of_a_segment_—_the_rejected_rule
  Scenario: scriptFor does not match part of a segment
    Given the same scripts
    Then "diff", "policy" and "health" match nothing

  @test:scripts/tests/tools/tool-coverage-triage.test.ts::`scriptFor`_is_strict,_because_loose_matching_was_tried_and_rejected::returns_undefined_for_a_skill_with_nothing
  Scenario: scriptFor finds nothing for an unrelated skill
    Given the same scripts
    Then "pure-judgement" matches nothing
