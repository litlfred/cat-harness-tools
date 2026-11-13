# Specifies instanceRepositories (schemas/kg/instance-repositories.ts) and the
# repository / livesAt fields of a declaration (schemas/kg/cat-harness.ts):
# instance references are owner/repo and resolve.
Feature: Instance references are owner/repo and resolve through the derived map

  @test:schemas/instance-repositories.test.ts::instance_references_are_owner/repo_and_resolve_(bean_6rmv,_phase_2)::there_are_references_to_check
  Scenario: A composed checkout has instance references to check
    Given a composed checkout, the test being skipped standing alone
    When every "instance" field of every voice.json and instance declaration is collected
    Then there are more than 100 references

  @test:schemas/instance-repositories.test.ts::instance_references_are_owner/repo_and_resolve_(bean_6rmv,_phase_2)::every_one_resolves_through_the_derived_map,_by_owner/repo,_or_says_where_it_is_held
  Scenario: Every instance reference resolves or names where it is held
    Given the instance references of a composed checkout and its derived instance-repository map
    When the references neither in the map by owner/repo nor carrying a url are listed
    Then the list is empty

  @test:schemas/instance-repositories.test.ts::instance_repositories_—_the_schema_and_the_refusals::repository_must_be_owner/name;_livesAt_path_may_not_climb
  Scenario: A declaration's repository is owner/name and livesAt may not climb
    Given a declaration whose repository is "x"
    When it is parsed
    Then it is refused
    And a livesAt path of "../x" is refused
    And repository "a/x" living at path "x" of "a/b" parses

  @test:schemas/instance-repositories.test.ts::instance_repositories_—_the_schema_and_the_refusals::two_instances_claiming_one_repository_is_refused
  Scenario: Two instances claiming one repository are refused
    Given a checkout with instances "one" and "two" both declaring repository "o/same"
    When the instance-repository map is derived
    Then it throws "o/same is declared by both"
