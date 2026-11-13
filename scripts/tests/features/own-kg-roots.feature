# scripts/known-skills.ts ownKgRoots gives the knowledge-graph roots an audit may write sidecars for: the layer's
# declared graph directories, inside the layer, never the layer root itself and never another instance's.
# Each Scenario names the test that executes it.
Feature: An audit walks only its own declared knowledge-graph roots

  @test:scripts/tests/own-kg-roots.test.ts::the_walk_follows_the_DECLARATION,_not_the_literal_`skills/`::a_declared_topical_directory_is_reachable
  Scenario: A declared topical directory is reachable
    Given a layer declaring "skills/" and "methodologies/crdm/" as cat-harness graphs
    When its own knowledge-graph roots are listed
    Then they include "methodologies/crdm"

  @test:scripts/tests/own-kg-roots.test.ts::the_walk_follows_the_DECLARATION,_not_the_literal_`skills/`::THE_OTHER_DIRECTION:_undeclaring_it_removes_it,_though_it_is_still_on_disk
  Scenario: An undeclared directory is not a root, though it is on disk
    Given a layer declaring only "skills/", with "methodologies/crdm/" on disk but undeclared
    When its own knowledge-graph roots are listed
    Then they do not include "methodologies/crdm"

  @test:scripts/tests/own-kg-roots.test.ts::the_walk_follows_the_DECLARATION,_not_the_literal_`skills/`::`skills/`_is_a_DEFAULT,_so_it_survives_being_undeclared
  Scenario: skills/ is a default root even when undeclared
    Given a layer declaring only "methodologies/raci/", with "skills/" on disk
    When its own knowledge-graph roots are listed
    Then they are exactly "methodologies/raci" and "skills"

  @test:scripts/tests/own-kg-roots.test.ts::the_walk_follows_the_DECLARATION,_not_the_literal_`skills/`::and_a_root_is_never_listed_twice,_however_many_ways_it_arrives
  Scenario: A root declared and also supplied as a default is listed once
    Given a layer declaring "skills/", which the defaults also supply
    When its own knowledge-graph roots are listed
    Then they are exactly "skills"

  @test:scripts/tests/own-kg-roots.test.ts::another_instance's_roots_are_excluded_—_not_this_audit's_to_write::a_repository-scoped_sibling_directory_is_dropped
  Scenario: A repository-scoped sibling directory is dropped
    Given a layer declaring "skills/" and a repository-scoped "other/skills/" outside it
    When its own knowledge-graph roots are listed
    Then they are exactly "skills"
    And none of them lies outside the layer

  @test:scripts/tests/own-kg-roots.test.ts::another_instance's_roots_are_excluded_—_not_this_audit's_to_write::THE_REASON_IT_MATTERS:_every_kept_root_mirrors_INSIDE_the_results_tree
  Scenario: Every kept root mirrors inside the results tree
    Given a layer declaring "skills/" and "src/skills/" and a repository-scoped "other/skills/" outside it
    When each of its own knowledge-graph roots is mirrored under "test/results/kg-qa"
    Then every mirrored path stays inside that results tree

  @test:scripts/tests/own-kg-roots.test.ts::another_instance's_roots_are_excluded_—_not_this_audit's_to_write::the_instance_root_itself_is_not_a_root_of_its_own_graph
  Scenario: The layer root itself is not a root of its own graph, even when declared
    Given a layer declaring "skills/" and its own root "./" as cat-harness graphs
    And the declared roots include the layer root itself
    When its own knowledge-graph roots are listed
    Then the layer root is not among them
    And they are exactly "skills"
