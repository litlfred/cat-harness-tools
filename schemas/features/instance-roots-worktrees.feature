# Specifies instance discovery and checkout roots in the presence of git
# worktrees and submodules (instanceRootsIn, isForeignCheckout,
# checkoutRootFor, rootForScope in schemas/kg/cat-harness.ts), and the
# repository-level readers that use them.
Feature: Instance discovery and repository-level reads stay inside one checkout

  Background:
    Given a git checkout declaring "root" with a nested "core" instance, a pages workflow and a local skill
    And two agent worktrees, agent-a and agent-b, under .claude/worktrees, agent-b holding an extra instance

  @test:schemas/instance-roots-worktrees.test.ts::instanceRootsIn_with_git_worktrees_present::the_main_checkout_does_not_see_its_nested_worktrees
  Scenario: The main checkout does not see its nested worktrees
    When the instance roots in the checkout are listed
    Then they are the checkout and its core
    And none lies under .claude

  @test:schemas/instance-roots-worktrees.test.ts::instanceRootsIn_with_git_worktrees_present::a_worktree_sees_its_own_instances_and_nothing_of_its_sibling
  Scenario: A worktree sees only its own instances
    When the instance roots in agent-a are listed
    Then they are agent-a and its core

  @test:schemas/instance-roots-worktrees.test.ts::instanceRootsIn_with_git_worktrees_present::the_escape:_scanning_`repoRootFor(<worktree_root>)`_lists_no_sibling_worktree
  Scenario: Scanning a worktree's repo root lists no worktree
    When agent-a's repo root is found and scanned
    Then the repo root is the main checkout
    And the instances are the checkout and its core, none under .claude/worktrees

  @test:schemas/instance-roots-worktrees.test.ts::instanceRootsIn_with_git_worktrees_present::siblingScopeFor_keeps_the_root_instance_inside_its_own_checkout
  Scenario: A worktree's sibling scope is the worktree itself
    When agent-a's sibling scope is found and scanned
    Then the scope is agent-a and nothing of agent-b is listed

  @test:schemas/instance-roots-worktrees.test.ts::instanceRootsIn_with_git_worktrees_present::a_worktree's_`.git`_is_a_FILE_and_marks_it_foreign;_a_declared_submodule_is_not
  Scenario: A worktree is a foreign checkout and a declared submodule is not
    When agent-b and the checkout's core are tested for being foreign
    Then agent-b is foreign and core is not
    And a superproject's declared submodule with a .git file is not foreign and is listed beside the superproject

  @test:schemas/instance-roots-worktrees.test.ts::sibling_clones_in_a_plain_directory_—_the_separated_layout_(ho66)::every_clone_is_an_instance_when_no_checkout_encloses_them
  Scenario: Sibling clones in a plain directory are all instances
    Given a plain directory holding git clones "lower" and "upper", each declared
    When the instance roots in the directory are listed
    Then they are lower and upper
    And upper's sibling scope is upper itself

  @test:schemas/instance-roots-worktrees.test.ts::sibling_clones_in_a_plain_directory_—_the_separated_layout_(ho66)::inside_a_checkout,_a_clone_is_still_foreign
  Scenario: The worktrees directory of a checkout yields no instance
    When the instance roots in .claude/worktrees are listed
    Then there are none

  @test:schemas/instance-roots-worktrees.test.ts::checkoutRootFor_—_repository-level_reads_stay_inside_the_checkout_(g43f)::THIS_checkout_—_the_main_one_or_a_nested_agent_worktree_—_answers_itself
  Scenario: This repository's checkout root is its own checkout
    Given the checkout holding this layer
    When the checkout root of the checkout and of this layer is found
    Then both are that checkout

  @test:schemas/instance-roots-worktrees.test.ts::checkoutRootFor_—_repository-level_reads_stay_inside_the_checkout_(g43f)::the_root_instance_of_a_worktree,_of_the_main_checkout,_and_a_nested_instance
  Scenario: Root and nested instances answer their own checkout
    When the checkout roots of agent-a, the checkout, and each one's core are found
    Then agent-a and its core answer agent-a, and the checkout and its core answer the checkout

  @test:schemas/instance-roots-worktrees.test.ts::checkoutRootFor_—_repository-level_reads_stay_inside_the_checkout_(g43f)::a_declared_submodule's_repository_is_its_superproject;_a_non-git_tree_keeps_`dirname`
  Scenario: A submodule's checkout is its superproject and a plain tree keeps its parent
    Given a superproject with a .git directory and a declared submodule "sub"
    When the checkout root of sub is found
    Then it is the superproject
    And for an instance in a non-git tree it equals the repo root

  @test:schemas/instance-roots-worktrees.test.ts::checkoutRootFor_—_repository-level_reads_stay_inside_the_checkout_(g43f)::a_submodule_whose_superproject_holds_no_`.git`_is_REPORTED,_not_guessed
  Scenario: A submodule whose superproject has no .git is reported
    Given a declared submodule whose superproject has no .git
    When its checkout root is found
    Then it throws "cannot determine the checkout"

  @test:schemas/instance-roots-worktrees.test.ts::checkoutRootFor_—_repository-level_reads_stay_inside_the_checkout_(g43f)::rootForScope:_a_`scope:_\"repository\"`_path_on_the_root_instance_resolves_inside_it
  Scenario: A repository-scoped path of a worktree resolves inside it
    When the repository scope root of agent-a and of its core is found
    Then both are agent-a

  @test:schemas/instance-roots-worktrees.test.ts::checkoutRootFor_—_repository-level_reads_stay_inside_the_checkout_(g43f)::pages-bootstrap_reads_the_worktree's_own_`.github/workflows`
  Scenario: pages-bootstrap reads the worktree's own workflows
    When publish workflows are found for agent-a
    Then they are exactly pages.yml

  @test:schemas/instance-roots-worktrees.test.ts::checkoutRootFor_—_repository-level_reads_stay_inside_the_checkout_(g43f)::known-skills_never_reads_`.claude/skills`_from_outside_the_checkout
  Scenario: known-skills never reads skills from outside the checkout
    Given a "leak" skill planted under .claude/worktrees/.claude/skills
    When the skill directories of agent-a and its core are listed
    Then none mentions leak
    And every one of core's lies inside agent-a

  @test:schemas/instance-roots-worktrees.test.ts::checkoutRootFor_—_repository-level_reads_stay_inside_the_checkout_(g43f)::the_root_instance_reads_its_own_`.claude/skills`,_and_a_loader-stub_group_is_not_a_group_of_skills_(g43f)
  Scenario: The root instance reads its own skills but not a loader stub group
    Given agent-a's .claude/skills holding a real skill group and a group with only SKILL.md
    When agent-a's skill directories are listed
    Then .claude/skills/real is listed and .claude/skills/stub-only is not

  @test:schemas/instance-roots-worktrees.test.ts::checkoutRootFor_—_repository-level_reads_stay_inside_the_checkout_(g43f)::check-retired-front-matter_sweeps_only_inside_the_worktree
  Scenario: The retired front-matter check sweeps only inside the worktree
    When the retired front-matter scan runs on agent-a
    Then its roots include agent-a's .claude/skills and all lie inside agent-a

  @test:schemas/instance-roots-worktrees.test.ts::checkoutRootFor_—_repository-level_reads_stay_inside_the_checkout_(g43f)::check-subgraph-coverage_recognises_the_worktree's_root_instance_AS_the_root
  Scenario: The subgraph coverage check treats a worktree's root instance as the root
    When agent-a is audited for subgraph coverage
    Then it does not throw
    And the result equals auditing it with agent-a named as the root

  @test:schemas/instance-roots-worktrees.test.ts::checkoutRootFor_—_repository-level_reads_stay_inside_the_checkout_(g43f)::schema-graph_relativises_against_the_worktree,_never_`.claude/worktrees/`
  Scenario: The schema graph names modules relative to the worktree
    Given agent-a holds schemas/probe.ts
    When agent-a's schema graph is read
    Then its modules include "schemas/probe.ts"
