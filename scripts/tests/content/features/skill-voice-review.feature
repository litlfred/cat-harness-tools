# The skill voice-review axis (bean rkqp): what it gates is only whether a
# current review exists; a rule judged `fail` is recorded, never a finding.
# Reviews live in the attestation store (bean 2gst). Each Scenario names the
# test that executes it.
Feature: A skill's voice review gates on being current, not on its verdicts

  @test:scripts/tests/content/skill-voice-review.test.ts::which_voices_judge_skills::nothing_active_is_an_empty_set,_and_an_unreadable_config_is_undefined
  Scenario: No active voice is an empty set, an unreadable config is undefined
    When the skill voices are listed for an empty active list
    Then the result is empty
    And when the active list is undefined, the result is undefined

  @test:scripts/tests/content/skill-voice-review.test.ts::which_voices_judge_skills::the_base_skill-authoring_voice_contributes_its_skill-scoped_rules
  Scenario: The base skill-authoring voice contributes its 12 skill rules
    When the skill voices are listed with "agent-skill-authoring" active
    Then the first is "agent-skill-authoring" with 12 rules

  @test:scripts/tests/content/skill-voice-review.test.ts::which_voices_judge_skills::a_vendor_voice_resolves_through_its_base
  Scenario: A vendor voice's rules are its own plus its base's
    When the skill voices are listed with "agent-skill-authoring-claude" active
    Then the voice has 20 rules
    And some rule id starts with "as-"

  @test:scripts/tests/content/skill-voice-review.test.ts::whether_a_skill's_review_is_current::n/a_with_no_voice_active;_unknown_when_undetermined
  Scenario: No active voice is n/a, an undetermined voice set is unknown
    Given a skill file with no reviews
    When it is evaluated against an empty voice set
    Then the result is "n/a"
    And against an undefined voice set the result is "unknown"

  @test:scripts/tests/content/skill-voice-review.test.ts::whether_a_skill's_review_is_current::never_reviewed_is_a_finding
  Scenario: A skill never reviewed by an active voice fails
    Given a skill file with no reviews and an active voice "v"
    When it is evaluated
    Then the result is "fail"

  @test:scripts/tests/content/skill-voice-review.test.ts::whether_a_skill's_review_is_current::a_current_review_passes_EVEN_WITH_a_rule_judged_fail_—_no_gate_on_rule_content
  Scenario: A current review passes even when a rule is judged fail
    Given a current review by "v" with r1 passed and r2 failed with a note
    When the skill is evaluated
    Then the result is "pass"
    And the returned review still records r2 as "fail"

  @test:scripts/tests/content/skill-voice-review.test.ts::whether_a_skill's_review_is_current::a_changed_skill_or_a_changed_voice_makes_the_review_stale,_and_the_old_review_is_kept
  Scenario: A review over a changed skill or changed voice is stale, and is kept
    Given a review whose skill hash is "old"
    When the skill is evaluated
    Then the result is "fail" and the one review is still returned
    And a review whose voice hash is "old" also evaluates to "fail"

  @test:scripts/tests/content/skill-voice-review.test.ts::whether_a_skill's_review_is_current::verdicts_must_cover_each_rule_once,_and_explain_every_non-pass
  Scenario: Verdicts cover every rule and explain every fail
    # Gap: the title says "each rule once"; no case gives a rule two verdicts
    Given a voice "v" with rules r1 and r2
    Then a pass for r1 and a noted fail for r2 has no problems
    And a pass for r1 alone reports "r2: no verdict"
    And a fail for r2 with no note reports "r2: a fail verdict needs a note saying why"
    And an extra verdict for "zz" reports "zz: not a skill rule of v"

  @test:scripts/tests/content/skill-voice-review.test.ts::reviews_in_the_attestation_store::an_absent_store_takes_the_prior_sidecar's_reviews_(ruling_2);_a_corrupt_file_is_refused,_not_overwritten
  Scenario: An absent store falls back to the sidecar; a corrupt store is refused and left alone
    Given a skill, no attestation store, and a kg-qa sidecar holding a current review by "v"
    When the reviews are read
    Then the store state is "absent" and the skill evaluates to "pass" with the sidecar's review
    When a new review by "w" is recorded with the sidecar given
    Then the store reads back as "hit" with reviews by "v" then "w"
    Given the store file is replaced by a merge-conflict marker
    Then reading it gives state "corrupt"
    And recording a review throws "corrupt" and the file is unchanged

  @test:scripts/tests/content/skill-voice-review.test.ts::reviews_in_the_attestation_store::recordReview_creates_the_subject's_file,_and_the_review_then_reads_back_current
  Scenario: Recording a review creates the store file, and it reads back current
    Given a skill and an attestation store path in a directory that does not exist
    When a current review is recorded
    Then the store reads as "hit"
    And the skill evaluates to "pass"
