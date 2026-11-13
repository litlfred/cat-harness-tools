# .github/workflows/standing-repin.yml's PR step, run against stub gh and git:
# only a run the merge manager dispatched asks for auto-merge (owner, 2026-11-13,
# card "Standing re-pin workflows: MM dispatches, auto-merge OK").
# Each Scenario names the test that executes it.
Feature: Standing repin leaves the merge to the merge manager

  @test:scripts/tests/sdlc/standing-repin-merge.test.ts::standing_repin:_only_the_merge_manager's_dispatch_asks_for_auto-merge::the_step_reads_the_caller's_event_and_labels_with_needs-repin
  Scenario: The PR step reads the caller's event and the needs-repin label
    Given the "Open or update the one repin PR" step of standing-repin.yml
    When its environment is read
    Then EVENT is the caller's github.event_name
    And REPIN_LABEL is "needs-repin"

  @test:scripts/tests/sdlc/standing-repin-merge.test.ts::standing_repin:_only_the_merge_manager's_dispatch_asks_for_auto-merge::workflow_dispatch_(the_merge_manager_started_it):_auto-merge,_no_label
  Scenario: A workflow_dispatch run, which the merge manager starts, asks for auto-merge
    Given no open repin PR
    When the step runs for a workflow_dispatch event
    Then it opens the repin PR
    And its only merge or edit call is "gh pr merge 42 --auto --squash"

  @test:scripts/tests/sdlc/standing-repin-merge.test.ts::standing_repin:_only_the_merge_manager's_dispatch_asks_for_auto-merge::%s:_the_PR_is_labelled_needs-repin,_and_auto-merge_is_never_asked_for
  Scenario Outline: A scheduled or repository_dispatch run labels the PR needs-repin and never asks for auto-merge
    Given no open repin PR
    When the step runs for a <event> event
    Then it labels the PR "needs-repin" and turns auto-merge off
    And no call asks for "--auto"
    And the step summary says no auto-merge on a <event> run

    Examples:
      | event               |
      | schedule            |
      | repository_dispatch |

  @test:scripts/tests/sdlc/standing-repin-merge.test.ts::standing_repin:_only_the_merge_manager's_dispatch_asks_for_auto-merge::a_scheduled_run_updating_the_open_repin_PR_labels_that_PR_and_turns_its_auto-merge_off
  Scenario: A scheduled run updating the open repin PR labels it and turns its auto-merge off
    Given an open repin PR #7
    When the step runs for a schedule event
    Then no PR is created
    And #7 is retitled, labelled "needs-repin" and has auto-merge disabled

  @test:scripts/tests/sdlc/standing-repin-merge.test.ts::standing_repin:_only_the_merge_manager's_dispatch_asks_for_auto-merge::a_label_that_cannot_be_added_fails_the_run,_so_the_merge_manager_is_not_left_unaware
  Scenario: A label that cannot be added fails the run
    Given gh refuses to add the label
    When the step runs for a schedule event
    Then the step fails
    And no call asks for "--auto"
