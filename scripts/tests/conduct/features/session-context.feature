# The session-context record's shape, and what it refuses. Nothing writes one
# yet, so these Scenarios are the contract's whole enforcement. Each Scenario
# names the test that executes it.
Feature: A session-context record has a fixed shape and refuses what it cannot represent

  @test:scripts/tests/conduct/session-context.test.ts::session_context::an_IDLE_session_parses_—_empty_`open`_is_the_normal_state
  Scenario: An idle session with nothing open parses
    Given a session-context record with an actor and empty `open` and `claimed`
    When it is parsed
    Then it parses and its `open` is empty

  @test:scripts/tests/conduct/session-context.test.ts::session_context::`actor`_is_required_—_the_one_field_nothing_else_can_supply
  Scenario: A record without an actor is refused
    Given an idle session-context record with its `actor` removed
    When it is validated against the schema
    Then validation fails

  @test:scripts/tests/conduct/session-context.test.ts::session_context::an_undeclared_actor_is_representable,_and_says_so
  Scenario: An undeclared actor is carried, flagged as undeclared
    Given an idle record whose actor is "some-agent" with `declared: false`
    When it is parsed
    Then its actor is exactly id "some-agent" with `declared: false`

  @test:scripts/tests/conduct/session-context.test.ts::session_context::`declared`_cannot_be_omitted_—_absent_is_not_`false`
  Scenario: An actor without `declared` is refused
    Given an idle record whose actor has an id but no `declared`
    When it is validated against the schema
    Then validation fails

  @test:scripts/tests/conduct/session-context.test.ts::session_context::`waitingOn`_carries_`since`_or_does_not_exist
  Scenario: A wait must say since when
    Given an idle record with `waitingOn` naming "a review" and no `since`
    When it is validated against the schema
    Then validation fails
    And the same record with a `since` timestamp validates

  @test:scripts/tests/conduct/session-context.test.ts::session_context::the_`$schema`_tag_is_what_identifies_the_file,_not_its_path
  Scenario: A record carrying another kind's $schema tag is refused
    Given an idle record whose `$schema` is "folio-workflow-instance/v1"
    When it is validated against the session-context schema
    Then validation fails

  @test:scripts/tests/conduct/session-context.test.ts::session_context::`session-state`_is_a_registered_kind,_writable,_and_its_reader_names_it
  Scenario: session-state is a registered, writable state kind that its skill names
    Given the default graph typologies
    Then "session-state" is registered, in the "state" layer, and a process may write it
    And the workflow skill session-context.md lists "session-state" under `graph-typologies:` in its front matter

  @test:scripts/tests/conduct/session-context.test.ts::session_context::a_session_is_NOT_a_process_instance_—_two_kinds,_both_state
  Scenario: A session and a workflow instance are two distinct kinds
    # Gap: the title says both kinds are "state"; the body checks only that both are registered with different IRIs, not workflow-state's layer
    Given the default graph typologies
    Then both "session-state" and "workflow-state" are registered
    And their typology IRIs differ
