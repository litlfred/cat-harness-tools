# The voice-overlay criteria are derived from the voices (bean btuv): the
# overlay severity is a declared field, the criterion id is composed in one
# place, and a voice that judges only skills makes no block criterion. Each
# Scenario names the test that executes it.
Feature: Voice-overlay criteria are derived from the voices they overlay

  @test:scripts/tests/content/voice-criteria.test.ts::overlaySeverityOf_is_declared,_never_derived_from_the_rules::it_reads_the_voice's_own_field
  Scenario: A voice's overlay severity is the one it declares
    # Gap: no assertion that any shipped voice declares an overlaySeverity, so the loop may check nothing
    Given every voice shipped in the harness
    When a voice declares an `overlaySeverity`
    Then its overlay severity is that declared value

  @test:scripts/tests/content/voice-criteria.test.ts::overlaySeverityOf_is_declared,_never_derived_from_the_rules::a_voice_declaring_none_gets_the_documented_default,_not_the_worst_rule
  Scenario: A voice declaring no overlay severity gets "major", not its worst rule's severity
    Given a voice with one "critical" rule and no `overlaySeverity`
    When its overlay severity is read
    Then it is "major"

  @test:scripts/tests/content/voice-criteria.test.ts::overlaySeverityOf_is_declared,_never_derived_from_the_rules::two_of_the_four_disagree_with_the_worst-rule_rule_—_which_is_why_it_is_declared
  Scenario: At least one shipped voice's overlay severity differs from its worst rule
    # Gap: the title says "two of the four"; the body checks only that at least one shipped voice disagrees
    Given every voice shipped in the harness
    When each voice's worst rule severity is compared with its overlay severity
    Then at least one voice disagrees

  @test:scripts/tests/content/voice-criteria.test.ts::the_criterion_id_is_composed_in_one_place::`overlayCriterionId`_is_what_the_derivation_uses
  Scenario: The derived criterion of each block-judging voice has the composed id
    # Gap: no assertion that any shipped voice judges blocks, so the loop may check nothing
    Given every shipped voice that judges blocks
    When the overlay criteria are derived
    Then the criterion for that voice has the id overlayCriterionId gives for it

  @test:scripts/tests/content/voice-criteria.test.ts::a_voice_that_judges_only_skills_makes_no_block_criterion::the_skill-authoring_voices_are_shipped,_and_none_is_a_block_overlay
  Scenario: A voice that judges only skills makes no block-overlay criterion
    Given the shipped voices that do not judge blocks
    Then they include "agent-skill-authoring"
    And no derived overlay criterion carries the id of any of them
