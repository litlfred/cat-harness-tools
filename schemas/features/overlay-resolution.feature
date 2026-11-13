# Specifies siblingScopeFor and repoRootFor (schemas/kg/cat-harness.ts) and
# dependenciesFromNeeds, resolveSkillDirs and resolveInstanceGraph
# (schemas/kg/harness-config.ts): where a layer's siblings are found and how
# its needs resolve.
Feature: A layer's siblings are found in the right scope, and its needs resolve or are reported

  @test:schemas/overlay-resolution.test.ts::siblingScopeFor_—_which_directory_a_sibling_is_looked_up_in::an_instance_root_that_CONTAINS_other_instances_is_its_own_scope
  Scenario: An instance root containing other instances is its own scope
    Given a directory declaring "container" that also holds an instance "alpha"
    When its sibling scope is found
    Then it is the directory itself
    And its repo root is not

  @test:schemas/overlay-resolution.test.ts::siblingScopeFor_—_which_directory_a_sibling_is_looked_up_in::the_ROOT_instance_of_a_checkout_never_looks_outside_it_(owner,_2026-10-11,_bean_68k7)
  Scenario: A checkout's root instance never looks outside it
    Given an instance "repo" with its own .git beside a stray instance
    When its sibling scope is found
    Then it is the repo itself
    And once its .git is removed the scope is its parent

  @test:schemas/overlay-resolution.test.ts::siblingScopeFor_—_which_directory_a_sibling_is_looked_up_in::a_declared_SUBMODULE_with_its_own_`.git`_is_still_nested_—_it_looks_in_its_parent
  Scenario: A declared submodule with its own .git looks in its parent
    Given a git repository whose .gitmodules declares submodule "sub", which has its own .git
    When the sibling scope of sub is found
    Then it is the parent repository

  @test:schemas/overlay-resolution.test.ts::siblingScopeFor_—_which_directory_a_sibling_is_looked_up_in::a_LEAF_instance_resolves_siblings_one_level_up,_as_`repoRootFor`_assumes
  Scenario: A leaf instance's siblings are one level up
    Given instances alpha and beta side by side
    When the sibling scope of alpha is found
    Then it is their parent

  @test:schemas/overlay-resolution.test.ts::siblingScopeFor_—_which_directory_a_sibling_is_looked_up_in::the_two_agree_for_every_nested_instance_—_this_does_not_replace_`repoRootFor`
  Scenario: Sibling scope and repo root agree for a nested instance
    Given an instance alpha one level under a root
    When its sibling scope and repo root are found
    Then they are the same directory
    # Gap: the title claims agreement for every nested instance; one leaf is checked.

  @test:schemas/overlay-resolution.test.ts::dependenciesFromNeeds_resolves_siblings_of_a_ROOT-declared_instance::a_`needs`_name_resolves_from_an_instance_declared_at_the_containing_root
  Scenario: A root-declared instance's needs resolve to an instance it contains
    Given a root declaring "top" that needs "base", with base one level down
    When its dependencies are derived from needs
    Then nothing is unresolved and the dependencies are exactly "base"

  @test:schemas/overlay-resolution.test.ts::dependenciesFromNeeds_resolves_siblings_of_a_ROOT-declared_instance::and_the_overlay_it_feeds_reaches_that_dependency's_skills
  Scenario: The skill overlay reaches a dependency's skills
    Given the same root, with base declaring a skills directory
    When the skill directories are resolved
    Then they include base's skills directory

  @test:schemas/overlay-resolution.test.ts::an_unresolvable_`needs`_name_is_REPORTED,_never_dropped::a_name_matching_no_instance_becomes_a_`missing`_problem
  Scenario: A needs name matching no instance is a missing problem
    Given instance top that needs "base" and "nowhere", and only base exists
    When top's instance graph is resolved
    Then there is exactly one missing problem, naming "nowhere"
    And the order holds only base

  @test:schemas/overlay-resolution.test.ts::an_unresolvable_`needs`_name_is_REPORTED,_never_dropped::a_fully_resolvable_tree_raises_nothing_—_falsified_in_both_directions
  Scenario: A fully resolvable tree has no problems
    Given instance top that needs only "base", which exists
    When top's instance graph is resolved
    Then there are no problems

  @test:schemas/overlay-resolution.test.ts::an_unresolvable_`needs`_name_is_REPORTED,_never_dropped::a_name_the_CONFIG_already_authors_is_not_reported_as_missing
  Scenario: A needs name the config already provides is not missing
    Given top needs "elsewhere" and its config authors a dependency "elsewhere" at ../base
    When top's instance graph is resolved
    Then there is no missing problem
