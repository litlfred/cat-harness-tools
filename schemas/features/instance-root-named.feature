# Specifies instanceRootNamed (schemas/kg/instance-roots.ts): the directory
# whose declaration declares a given instance name.
Feature: The root of a named instance is the directory whose declaration says so

  @test:schemas/instance-root-named.test.ts::instanceRootNamed::monorepo:_the_instance_one_level_down_that_declares_the_name
  Scenario: In a monorepo the instance one level down is found
    Given a repository declaring "folio-assistant" with subdirectories declaring "cat-harness" and "folio-assistant-core"
    When the root named "cat-harness" is looked up
    Then it is the cat-harness subdirectory

  @test:schemas/instance-root-named.test.ts::instanceRootNamed::standalone:_the_repository_root_itself,_when_it_declares_the_name
  Scenario: A standalone repository declaring the name is its own root
    Given a repository whose root declares "cat-harness"
    When the root named "cat-harness" is looked up
    Then it is the repository root

  @test:schemas/instance-root-named.test.ts::instanceRootNamed::a_directory_merely_NAMED_like_the_instance_is_not_it_—_the_declaration_decides
  Scenario: A directory only named like the instance is not it
    Given a repository declaring "folio-assistant" with an empty cat-harness subdirectory
    When the root named "cat-harness" is looked up
    Then there is none

  @test:schemas/instance-root-named.test.ts::instanceRootNamed::absent_is_undefined,_never_a_guessed_path
  Scenario: An absent instance has no root
    Given a repository declaring only "folio-assistant"
    When the root named "cat-harness" is looked up
    Then there is none
