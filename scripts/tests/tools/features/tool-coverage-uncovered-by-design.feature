# `UNCOVERED_BY_DESIGN`: tier-A skills that are uncovered and should stay so.
# The table is checked for form, and staleAnnotations is shown to discriminate
# so a clean run over the corpus is not clean by vacuity. Each Scenario names
# the test that executes it.
Feature: The uncovered-by-design table is well formed and its stale entries are detected

  @test:scripts/tests/tools/tool-coverage-uncovered-by-design.test.ts::the_table_is_well_formed::every_entry_carries_a_non-trivial_reason
  Scenario: Every entry's reason is long and cites a bean or code
    Given the uncovered-by-design table
    Then every reason is longer than 80 characters
    And every reason mentions "bean" or contains a backtick

  @test:scripts/tests/tools/tool-coverage-uncovered-by-design.test.ts::the_table_is_well_formed::no_skill_is_annotated_twice
  Scenario: No skill appears twice in the table
    Given the uncovered-by-design table
    Then its skill names are all distinct

  @test:scripts/tests/tools/tool-coverage-uncovered-by-design.test.ts::the_table_is_well_formed::every_state_is_one_the_type_admits
  Scenario: Every entry's state is an admitted one
    Given the uncovered-by-design table
    Then every state is "folio-mechanism" or "contract-unsatisfied"

  @test:scripts/tests/tools/tool-coverage-uncovered-by-design.test.ts::the_table_is_well_formed::contract-unsatisfied_is_still_empty,_and_that_is_deliberate
  Scenario: No entry is in the contract-unsatisfied state
    Given the uncovered-by-design table
    Then no entry has state "contract-unsatisfied"

  @test:scripts/tests/tools/tool-coverage-uncovered-by-design.test.ts::staleAnnotations_discriminates::an_annotated_skill_that_is_uncovered_and_tier_A_is_not_stale
  Scenario: An annotated skill still uncovered in tier A is not stale
    Given triage rows holding the table's first skill in tier A
    When stale annotations are found
    Then that skill is not among them

  @test:scripts/tests/tools/tool-coverage-uncovered-by-design.test.ts::staleAnnotations_discriminates::an_annotated_skill_absent_from_the_uncovered_set_is_stale_—_it_gained_a_Tool
  Scenario: An annotated skill absent from the triage is stale
    Given no triage rows
    When stale annotations are found
    Then every table entry is stale
    And the first says "Tool now"

  @test:scripts/tests/tools/tool-coverage-uncovered-by-design.test.ts::staleAnnotations_discriminates::an_annotated_skill_that_moved_off_tier_A_is_stale,_and_says_which_tier
  Scenario: An annotated skill now in another tier is stale and names the tier
    Given triage rows holding the table's first skill in tier C
    When stale annotations are found
    Then that skill is stale
    And its reason says "tier C"

  @test:scripts/tests/tools/tool-coverage-uncovered-by-design.test.ts::uncoveredByDesign::returns_the_entry_for_an_annotated_skill_and_undefined_otherwise
  Scenario: Looking up a skill returns its entry or nothing
    Then looking up the table's first skill returns an entry with its state
    And looking up "a-skill-that-does-not-exist" returns nothing
