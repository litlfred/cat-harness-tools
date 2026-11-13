# `check:voice-skills` (bean n8br): a voice's instruction body says what to do
# with the rules and never restates them. Every signal is asserted in both
# directions, because a check that reports nothing over its corpus is
# indistinguishable from one that cannot fire. Each Scenario names the test
# that executes it.
Feature: A voice's instruction body does not restate its own rules

  @test:scripts/tests/content/voice-skills.test.ts::the_corpus_passes::no_voice_this_repository_ships_restates_its_own_rules
  Scenario: No shipped voice restates its rules
    When the voice-skills check is run over the repository
    Then it reports no findings

  @test:scripts/tests/content/voice-skills.test.ts::the_corpus_passes::...and_there_IS_a_corpus,_so_the_pass_is_not_vacuous
  Scenario: The repository ships voices with rules
    When the voices graph is read from the repository root
    Then it is not null
    And it holds at least one voice and at least one rule

  @test:scripts/tests/content/voice-skills.test.ts::each_of_the_four_restatement_signals_fires::a_body_naming_a_rule_id
  Scenario: A body naming a rule id is one finding
    Given the rule "who-ed-ize-preferred" and a body mentioning `who-ed-ize-preferred`
    When the body is checked for restatements
    Then there is exactly one finding, saying it "names the rule id"

  @test:scripts/tests/content/voice-skills.test.ts::each_of_the_four_restatement_signals_fires::a_body_restating_a_rule_title
  Scenario: A body restating a rule title is a finding
    Given the rule titled "-ize, not -ise" and a body containing that title
    When the body is checked for restatements
    Then some finding says it "restates the rule"

  @test:scripts/tests/content/voice-skills.test.ts::each_of_the_four_restatement_signals_fires::a_body_copying_the_source_passage
  Scenario: A body copying the rule's source quote is a finding
    Given a body quoting the rule's source passage
    When the body is checked for restatements
    Then some finding mentions the "source passage"

  @test:scripts/tests/content/voice-skills.test.ts::each_of_the_four_restatement_signals_fires::a_body_giving_both_sides_of_a_terminology_pair
  Scenario: A body giving both sides of a terminology pair is a finding
    Given the rule's pair organize / organise and a body saying "Write organize, never organise."
    When the body is checked for restatements
    Then some finding mentions the "terminology pair"

  @test:scripts/tests/content/voice-skills.test.ts::and_it_does_not_fire_on_what_a_body_is_FOR::instructions_about_what_to_do_with_the_rules_are_clean
  Scenario: Instructions about how to use the rules are clean
    Given a body about when to read the rules and how a finding is upheld
    When it is checked for restatements
    Then there are no findings

  @test:scripts/tests/content/voice-skills.test.ts::and_it_does_not_fire_on_what_a_body_is_FOR::ONE_side_of_a_terminology_pair_is_not_a_restatement
  Scenario: Using only the preferred term is not a restatement
    Given a body saying "We organize the review in two passes."
    When it is checked for restatements
    Then there are no findings

  @test:scripts/tests/content/voice-skills.test.ts::and_it_does_not_fire_on_what_a_body_is_FOR::the_front_matter's_description_is_not_body
  Scenario: A rule title in the front-matter description is not checked
    Given a file whose front-matter description contains the rule title and whose body does not
    When it is checked for restatements
    Then there are no findings

  @test:scripts/tests/content/voice-skills.test.ts::and_it_does_not_fire_on_what_a_body_is_FOR::a_short_title_is_not_matched,_because_a_short_title_can_be_ordinary_prose
  Scenario: A short rule title appearing in prose is not matched
    Given a rule titled "Be brief" and a body saying "Be brief when you summarise a finding."
    When it is checked for restatements
    Then there are no findings

  @test:scripts/tests/content/voice-skills.test.ts::the_structural_half_—_what_Zod_cannot_check::every_shipped_voice's_declared_instruction_body_resolves
  Scenario: Every folio-voice-skill/v1 voice's instruction file exists
    # Gap: no assertion that any shipped voice is folio-voice-skill/v1, so the loop may check nothing
    Given every voice in the repository's voices graph
    When its voice.json declares "folio-voice-skill/v1"
    Then it names an instructions file
    And that file exists beside the voice.json

  @test:scripts/tests/content/voice-skills.test.ts::the_structural_half_—_what_Zod_cannot_check::a_voice_that_promises_NO_body_is_not_reported_as_missing_one
  Scenario: A bare voice with no instruction body is not reported
    Given the voices that are not folio-voice-skill/v1 and declare no instructions file
    Then there is at least one such voice
    And none of them has a SKILL.md
    And the voice-skills check reports no finding for any of them

  @test:scripts/tests/content/voice-skills.test.ts::the_structural_half_—_what_Zod_cannot_check::the_reader_is_told_the_repository_root_rather_than_deriving_it_wrongly
  Scenario: The repository root is passed to the reader, not derived
    Given the repository root
    Then deriving a repository root from it gives its parent directory
    And reading the voices graph with the root given explicitly is not null
