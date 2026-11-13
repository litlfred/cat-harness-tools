# The voice axis is three-valued (issue #208): a voice is opt-in, so a
# criterion scoped to a voice does not run on a folio that never adopted it,
# but a configuration that cannot be read never grants that skip. Each
# Scenario names the test that executes it.
Feature: Voice-scoped criteria run unless the folio is known to activate none of their voices

  @test:scripts/tests/content/voice-gate.test.ts::criterionVoices::absent_means_NOT_voice-scoped_—_the_opposite_default_from_profiles
  Scenario: A criterion with no `voices` is not voice-scoped
    When the voices of a criterion with no `voices` field are read
    Then they are undefined
    And a criterion with voices ["milnor"] has voices ["milnor"]

  @test:scripts/tests/content/voice-gate.test.ts::voiceExcludesCriterion::a_criterion_naming_no_voice_always_runs
  Scenario: A criterion naming no voice is never excluded
    Given a criterion with no `voices`
    Then it is not excluded when no voices are active
    And it is not excluded when the active voices are undetermined

  @test:scripts/tests/content/voice-gate.test.ts::voiceExcludesCriterion::a_voice_criterion_is_excluded_when_the_folio_activates_none
  Scenario: A voice criterion is excluded when no voice is active
    Given a criterion scoped to "who-editorial"
    When the active voices are []
    Then it is excluded

  @test:scripts/tests/content/voice-gate.test.ts::voiceExcludesCriterion::...and_runs_when_its_voice_is_active
  Scenario: A voice criterion runs when its voice is active
    Given a criterion scoped to "who-editorial"
    When the active voices are ["who-editorial"]
    Then it is not excluded

  @test:scripts/tests/content/voice-gate.test.ts::voiceExcludesCriterion::one_match_out_of_several_is_enough
  Scenario: One active voice among a criterion's several is enough
    Given a criterion scoped to "milnor" and "who-editorial"
    When the active voices are ["milnor"]
    Then it is not excluded

  @test:scripts/tests/content/voice-gate.test.ts::voiceExcludesCriterion::a_different_active_voice_does_not_satisfy_it
  Scenario: A different active voice does not satisfy a voice criterion
    Given a criterion scoped to "who-editorial"
    When the active voices are ["milnor"]
    Then it is excluded

  @test:scripts/tests/content/voice-gate.test.ts::voiceExcludesCriterion::UNREADABLE_config_runs_the_criterion_—_the_third_state
  Scenario: Undetermined active voices run the voice criterion
    Given a criterion scoped to "who-editorial"
    When the active voices are undefined
    Then it is not excluded

  @test:scripts/tests/content/voice-gate.test.ts::readActiveVoices::no_config_at_all_is_undefined,_not_[]
  Scenario: A directory with no configuration has undetermined voices
    Given an empty temporary directory
    When its active voices are read
    Then they are undefined

  @test:scripts/tests/content/voice-gate.test.ts::readActiveVoices::a_config_with_no_voices_key_activates_none
  Scenario: A configuration without a voices key activates none
    Given an instance configuration of {"contentType":"document"}
    When its active voices are read
    Then they are []

  @test:scripts/tests/content/voice-gate.test.ts::readActiveVoices::a_config_listing_voices_returns_them_in_order
  Scenario: A configuration listing voices returns them in order
    Given an instance configuration activating "who-editorial" then "milnor"
    When its active voices are read
    Then they are ["who-editorial", "milnor"]

  @test:scripts/tests/content/voice-gate.test.ts::readActiveVoices::folio.config.json_is_NOT_read_here_either_—_the_old_name_is_dead
  Scenario: The retired folio.config.json name is not read
    Given a directory holding only folio.config.json activating "who-editorial"
    When its active voices are read
    Then they are undefined

  @test:scripts/tests/content/voice-gate.test.ts::readActiveVoices::UNPARSEABLE_config_is_undefined,_not_[]
  Scenario: An unparseable configuration has undetermined voices
    Given an instance configuration "{ not json"
    When its active voices are read
    Then they are undefined

  @test:scripts/tests/content/voice-gate.test.ts::readActiveVoices::a_voices_key_of_the_wrong_shape_is_undefined,_not_[]
  Scenario: A voices key of the wrong shape has undetermined voices
    Given an instance configuration whose `voices.active` is the string "who-editorial"
    When its active voices are read
    Then they are undefined

  @test:scripts/tests/content/voice-gate.test.ts::readActiveVoices::an_instance_with_NO_config_of_its_own_is_`undefined`,_not_`[]`
  Scenario: A directory that declares nothing has undetermined voices
    # Gap: the body is the same as "no config at all is undefined" (a fresh empty temporary directory); no real instance layer without a config is read
    Given an empty temporary directory
    When its active voices are read
    Then they are undefined

  @test:scripts/tests/content/voice-gate.test.ts::the_voice_scope_is_in_the_freshness_key::re-scoping_a_criterion's_voices_changes_its_def_hash
  Scenario: Adding a voice scope changes a criterion's definition hash
    Given a criterion depending on "md"
    When the same criterion is scoped to "milnor"
    Then its definition hash differs
