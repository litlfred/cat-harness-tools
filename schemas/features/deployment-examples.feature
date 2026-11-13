# Specifies the example deployment descriptions in scenarios/deployments/
# (schemas/process/deployment-description.ts): each parses, places only
# declared actors, and keeps its stated properties.
Feature: The example deployment descriptions are well formed against the declared actors

  @test:schemas/deployment-examples.test.ts::the_example_deployment_descriptions::the_six_#363_scenarios_are_all_there
  Scenario: The six example deployments are present
    Given the deployment descriptions read from scenarios/deployments/
    When their ids are sorted
    Then they are developer, private-github, self-sovereign, sovereign-cloud, test-swarm and today

  @test:schemas/deployment-examples.test.ts::the_example_deployment_descriptions::every_one_is_well_formed_against_the_declared_actors
  Scenario: Every example deployment is well formed against the declared actors
    Given the deployments and the actors read from scenarios/actors
    When deployment problems are computed
    Then there are none

  @test:schemas/deployment-examples.test.ts::the_example_deployment_descriptions::today_places_one_actor_twice:_cloud_sessions_and_the_owner's_workstation
  Scenario: Today's deployment places the claude actor on two hosts
    Given the "today" deployment
    When the hosts of its "claude" placements are listed
    Then they are "claude-code" and "antigravity" in that order

  @test:schemas/deployment-examples.test.ts::the_example_deployment_descriptions::only_self-sovereign_may_hold_credentials
  Scenario: Only the self-sovereign deployment may hold credentials
    Given the deployments
    When those whose live data "may-hold-credentials" are listed
    Then the list is exactly "self-sovereign"

  @test:schemas/deployment-examples.test.ts::the_example_deployment_descriptions::the_API_signer_cannot_be_placed_in_the_air-gapped_example
  Scenario: The attestation service cannot be placed in the self-sovereign deployment
    Given the self-sovereign deployment with an extra "attestation-service" placement
    When deployment problems are computed
    Then the only problem is of kind "exceeds-deployment"

  @test:schemas/deployment-examples.test.ts::the_example_deployment_descriptions::the_swarm's_undeclared_reach_stays_unknown
  Scenario: The test swarm's placements have unknown reach
    Given the "test-swarm" deployment
    When the reach of each placement is computed
    Then every one is "unknown"
