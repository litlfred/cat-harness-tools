# Specifies the pages-serving observation (schemas/sdlc/health-report.ts): a
# dated record of what a published site actually served.
Feature: A pages-serving observation is dated, non-empty and strict

  @test:schemas/pages-serving.test.ts::PagesServingObservationSchema::a_dated_observation_of_at_least_one_URL_parses
  Scenario: A dated observation of one URL parses
    Given an observation dated 2026-10-11 of one URL served 200
    When it is parsed
    Then it parses with one URL

  @test:schemas/pages-serving.test.ts::PagesServingObservationSchema::an_observation_of_nothing_is_refused_—_it_would_count_as_an_instrument_over_no_evidence
  Scenario: An observation of no URL is refused
    Given the observation with an empty URL list
    When it is parsed
    Then it is refused

  @test:schemas/pages-serving.test.ts::PagesServingObservationSchema::an_undated_observation_is_refused_—_staleness_is_judged_from_the_date
  Scenario: An undated or badly dated observation is refused
    Given the observation without observedAt, and with observedAt "yesterday"
    When each is parsed
    Then each is refused

  @test:schemas/pages-serving.test.ts::PagesServingObservationSchema::Pages'_own_404_is_expressible_apart_from_the_status
  Scenario: A served page that is not the expected page is expressible
    Given an observation of a URL with status 404 and expectedPage false
    When it is parsed
    Then its expectedPage is false

  @test:schemas/pages-serving.test.ts::PagesServingObservationSchema::an_unknown_field_is_refused,_so_a_writer's_typo_cannot_pass_silently
  Scenario: An unknown field is refused
    Given the observation with an extra observed_at field
    When it is parsed
    Then it is refused
