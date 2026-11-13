# Sessions waiting on a person (bean rq8s). An unreadable listing is unknown,
# never "nothing waiting"; a row with no usable timestamp is skipped; a session
# that stopped without declaring it needs somebody is named. Each Scenario
# names the test that executes it.
Feature: Stale sessions waiting on a person are reported, and nothing unknown reads as clean

  @test:scripts/tests/conduct/session-staleness.test.ts::a_session_waiting_on_a_person_is_reported_once_it_is_stale::REQUIRES_ACTION_past_the_threshold_is_a_finding,_and_the_question_comes_with_it
  Scenario: A session requiring action past the threshold is reported with its question
    Given a REQUIRES_ACTION session last updated 113 hours ago whose summary is "Which PRs should I merge?"
    When stale sessions are found
    Then there is exactly one finding, with reason "requires-action"
    And its question is "Which PRs should I merge?"

  @test:scripts/tests/conduct/session-staleness.test.ts::a_session_waiting_on_a_person_is_reported_once_it_is_stale::REQUIRES_ACTION_inside_the_threshold_is_NOT_a_finding
  Scenario: A session requiring action inside the threshold is not reported
    Given a REQUIRES_ACTION session updated one hour less than the threshold ago
    When stale sessions are found
    Then there are no findings

  @test:scripts/tests/conduct/session-staleness.test.ts::a_session_waiting_on_a_person_is_reported_once_it_is_stale::a_FAILED_session_with_unread_output_is_a_finding
  Scenario: An old failed session with unread output is reported
    Given a session in the FAILED bucket, unread, last updated 385 hours ago
    When stale sessions are found
    Then the first finding has reason "failed-unread"

  @test:scripts/tests/conduct/session-staleness.test.ts::a_session_waiting_on_a_person_is_reported_once_it_is_stale::a_FAILED_session_somebody_has_READ_is_not_this_check's_business
  Scenario: A failed session somebody has read is not reported
    Given a session in the FAILED bucket, read, last updated 385 hours ago
    When stale sessions are found
    Then there are no findings

  @test:scripts/tests/conduct/session-staleness.test.ts::a_session_waiting_on_a_person_is_reported_once_it_is_stale::a_fresh_FAILED_session_is_not_reported_before_one_working_day
  Scenario: A failed unread session is not reported before its threshold
    Given a FAILED unread session updated one hour less than the failed-unread threshold ago
    When stale sessions are found
    Then there are no findings

  @test:scripts/tests/conduct/session-staleness.test.ts::a_session_waiting_on_a_person_is_reported_once_it_is_stale::findings_are_ordered_by_how_long_they_have_waited
  Scenario: Findings are ordered longest-waiting first
    Given REQUIRES_ACTION sessions "b" updated 100 hours ago and "a" updated 300 hours ago
    When stale sessions are found
    Then the findings are "a" then "b"

  @test:scripts/tests/conduct/session-staleness.test.ts::the_third_state_—_stopped,_but_it_never_said_it_needs_anyone::BLOCKED_bucket_with_a_non-REQUIRES_ACTION_status_is_NAMED,_not_asserted_as_waiting
  Scenario: A blocked session that never declared it needs anyone is named as undeclared
    Given a session in the BLOCKED bucket with status IDLE, updated 113 hours ago
    When stale sessions are found
    Then there is exactly one finding, with reason "blocked-undeclared"
    And the rendered report says it "CANNOT be told"

  @test:scripts/tests/conduct/session-staleness.test.ts::could-not-determine_is_never_rendered_as_clean::input_that_is_not_JSON_is_unknown,_with_a_reason
  Scenario: A listing that is not JSON is unknown, with a reason
    When the rows are read from "{ not json"
    Then the result carries a `because`

  @test:scripts/tests/conduct/session-staleness.test.ts::could-not-determine_is_never_rendered_as_clean::JSON_with_no_session_array_is_unknown_rather_than_an_empty_result
  Scenario: JSON with no session array is unknown, not empty
    When the rows are read from "{}"
    Then the result carries a `because`

  @test:scripts/tests/conduct/session-staleness.test.ts::could-not-determine_is_never_rendered_as_clean::the_unknown_report_says_plainly_that_it_is_NOT_a_pass
  Scenario: The unknown report says it is not a pass
    When an unknown result because of "403" is rendered
    Then the report contains "NOT a pass"

  @test:scripts/tests/conduct/session-staleness.test.ts::could-not-determine_is_never_rendered_as_clean::an_empty_listing_is_examined-nothing,_not_a_pass
  Scenario: An empty checked listing says it examined nothing
    When a checked result that read 0 sessions and found nothing is rendered
    Then the report contains "EXAMINED NOTHING"

  @test:scripts/tests/conduct/session-staleness.test.ts::could-not-determine_is_never_rendered_as_clean::the_shapes_a_listing_actually_arrives_in_all_parse
  Scenario: Every shape a session listing arrives in parses to rows
    Given a bare array, and arrays under "sessions", "data" and "ccr.data"
    When the rows are read from each
    Then each result carries `rows`

  @test:scripts/tests/conduct/session-staleness.test.ts::a_row_this_cannot_date_is_skipped,_never_treated_as_fresh::a_missing_timestamp_is_skipped
  Scenario: A REQUIRES_ACTION session with no timestamp yields no finding
    # Gap: zero findings is also what a row read as fresh would give; the body cannot tell "skipped" from "treated as fresh"
    Given a REQUIRES_ACTION session with no `updated_at`
    When stale sessions are found
    Then there are no findings

  @test:scripts/tests/conduct/session-staleness.test.ts::a_row_this_cannot_date_is_skipped,_never_treated_as_fresh::an_unparseable_timestamp_is_skipped_rather_than_read_as_now
  Scenario: A REQUIRES_ACTION session with an unparseable timestamp yields no finding
    # Gap: zero findings is also what reading the timestamp as now would give; the body cannot tell "skipped" from "read as now"
    Given a REQUIRES_ACTION session whose `updated_at` is "not a date"
    When stale sessions are found
    Then there are no findings

  @test:scripts/tests/conduct/session-staleness.test.ts::repo_attribution_and_filtering::the_repo_comes_from_the_session's_declared_source
  Scenario: A session's repository comes from its declared git source
    Given a session whose source is "https://github.com/litlfred/folio-assistant"
    Then its repository is "litlfred/folio-assistant"

  @test:scripts/tests/conduct/session-staleness.test.ts::repo_attribution_and_filtering::a_session_declaring_no_source_is_`unknown`,_not_blank
  Scenario: A session with no source has repository "unknown"
    Given a session with only an id
    Then its repository is "unknown"

  @test:scripts/tests/conduct/session-staleness.test.ts::repo_attribution_and_filtering::--repo_narrows_to_one_repository
  Scenario: Filtering by repository keeps only that repository's sessions
    Given stale REQUIRES_ACTION sessions "keep" in litlfred/folio-assistant and "drop" in litlfred/qou
    When stale sessions are found for "litlfred/folio-assistant"
    Then only "keep" is reported
