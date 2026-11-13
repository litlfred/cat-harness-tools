# Specifies resolveLandingInstance and rootInstanceName
# (schemas/kg/harness-config.ts) and the landing check's verdict
# (scripts/check-landing-instance.ts): which instance a checkout's site lands on.
Feature: A checkout's landing instance is decided from its instantiated harnesses

  @test:schemas/landing-instance.test.ts::resolveLandingInstance::one_instantiated_harness_is_the_landing,_with_no_flag_(the_smart-trust_case)
  Scenario: A sole instantiated harness is the landing
    Given a checkout with only a "smart-base" config and no landing flag
    When its landing is resolved
    Then it is the instance "smart-base", chosen as sole
    And the landing check passes

  @test:schemas/landing-instance.test.ts::resolveLandingInstance::several,_exactly_one_flagged:_the_flagged_one
  Scenario: Among several, the one flagged is the landing
    Given configs bootstrap, cat-harness flagged as landing, and who-iris
    When the landing is resolved
    Then it is the instance "cat-harness", chosen by flag
    And the landing check passes

  @test:schemas/landing-instance.test.ts::resolveLandingInstance::several,_none_flagged:_ambiguous,_and_the_gate_fails
  Scenario: Several with none flagged are ambiguous
    Given configs bootstrap and cat-harness, neither flagged
    When the landing is resolved
    Then it is ambiguous, none flagged, naming both
    And the landing check fails

  @test:schemas/landing-instance.test.ts::resolveLandingInstance::`landing:_false`_is_not_a_flag
  Scenario: landing false is not a flag
    Given configs a with landing false and b with none
    When the landing is resolved
    Then it is ambiguous

  @test:schemas/landing-instance.test.ts::resolveLandingInstance::several,_two_or_more_flagged:_the_neutral_hub,_listing_every_harness
  Scenario: Two or more flagged give the neutral hub
    Given configs a and b flagged and c not
    When the landing is resolved
    Then it is the hub, naming a, b and c, with a and b flagged
    And the landing check passes

  @test:schemas/landing-instance.test.ts::resolveLandingInstance::nothing_instantiated_is_its_own_state,_not_a_default
  Scenario: A checkout with nothing instantiated has no landing
    Given a checkout with no configs
    When the landing is resolved
    Then it is "none" with no names
    And the landing check passes

  @test:schemas/landing-instance.test.ts::resolveLandingInstance::an_unreadable_config_among_several_cannot_be_decided
  Scenario: An unreadable config makes the landing undecidable
    Given config a flagged and config b that is not JSON
    When the landing is resolved
    Then it is ambiguous because "b" is unreadable
    And the landing check fails

  @test:schemas/landing-instance.test.ts::resolveLandingInstance::a_non-boolean_flag_is_unreadable_rather_than_truthy
  Scenario: A non-boolean landing flag is unreadable
    Given config a with landing "yes" and config b
    When the landing is resolved
    Then it is ambiguous because of an unreadable config

  @test:schemas/landing-instance.test.ts::resolveLandingInstance::the_retired_global_`harness.config.json`_is_not_an_instance
  Scenario: The retired harness.config.json is not an instance
    Given configs harness and a
    When the instantiated harness names are listed
    Then they are exactly "a"

  @test:schemas/landing-instance.test.ts::rootInstanceName_—_never_the_clone's_folder_name::an_undeclared_root_with_one_instantiated_harness_is_that_harness
  Scenario: An undeclared root with one harness is named after it
    Given a folder "smart-trust" with only a "smart-base" config
    When its root instance name is read
    Then it is "smart-base"

  @test:schemas/landing-instance.test.ts::rootInstanceName_—_never_the_clone's_folder_name::an_undeclared_root_with_nothing_decided_has_no_name
  Scenario: An undeclared root with nothing decided has no name
    Given a folder "bare-folio" with no configs, and one with two unflagged configs
    When each root instance name is read
    Then neither has a name

  @test:schemas/landing-instance.test.ts::this_repository::lands_on_folio-assistant-core,_named_by_index.config.json
  Scenario: The composed checkout lands on folio-assistant-core by its index
    Given the checkout two levels above this test
    When its landing is resolved
    Then it is "folio-assistant-core", chosen by the index
