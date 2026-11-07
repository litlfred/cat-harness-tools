# Specifies scripts/audit-coverage.ts against the checkout: coverage() is a
# fixpoint, and gateCoverage() reads the browser jobs and lists itself.
Feature: The audit-coverage report is a fixpoint and covers every gate, itself included

  @test:test/coordinator/audit-coverage-workflows.test.ts::the_report_is_a_fixpoint::running_it_once_is_enough_to_satisfy_the_gate
  Scenario: Two consecutive coverage runs report the same rows
    Given the checkout root
    When coverage is computed twice
    Then both runs give the same rows
    And there is a "qa" row
    And if that row is "unknown" or "stored" it counts no files
    And otherwise it counts more than one sidecar

  @test:test/coordinator/audit-coverage-workflows.test.ts::gateCoverage::it_reads_the_browser_jobs_too
  Scenario: Gate coverage includes the browser jobs
    Given the instance and the checkout root
    When gate coverage is computed
    Then some gate's command includes "render:bpmn"

  @test:test/coordinator/audit-coverage-workflows.test.ts::gateCoverage::it_declares_its_own_coverage,_so_the_report_is_not_exempt_from_its_own_rule
  Scenario: The coverage report's own gate is listed
    Given the instance and the checkout root
    When gate coverage is computed
    Then the gate whose command includes "audit:coverage" has the state "none"
