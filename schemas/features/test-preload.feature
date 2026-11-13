# Specifies schemas/test-preload.ts: the suite's default test timeout reaches
# every test file of a run, not only the first.
Feature: The test preload sets the suite's default timeout for every file

  @test:schemas/test-preload.test.ts::a_second_test_file_gets_the_suite_default_too
  Scenario: A second test file gets the suite default timeout
    Given two test files each with a test that sleeps 5.3 seconds
    When bun test runs both with the test preload
    Then nothing times out
    And 2 tests pass
