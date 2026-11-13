# Specifies resolveSkillDirs (schemas/kg/harness-config.ts) and
# ownDirectories / resolveDirectories (schemas/kg/cat-harness.ts): the
# knowledge-graph overlay read from declarations rather than a literal path.
Feature: The skill overlay is read from declarations, deepest dependency first

  @test:schemas/skill-overlay.test.ts::the_overlay_is_read_from_declarations,_not_from_a_literal::a_knowledge_graph_NOT_at_skills/_is_still_found
  Scenario: A knowledge graph declared at kg/ is found
    Given an instance declaring its cat-harness graph at "kg"
    When its skill directories are resolved
    Then they are exactly its kg directory

  @test:schemas/skill-overlay.test.ts::the_overlay_is_read_from_declarations,_not_from_a_literal::a_dependency's_graph_AND_the_root's_both_survive_—_deepest_first
  Scenario: A dependency's graph and the root's both appear, dependency first
    Given a root instance depending on a dep instance, each with a skills graph
    When the root's skill directories are resolved
    Then they are dep's skills then root's skills

  @test:schemas/skill-overlay.test.ts::the_overlay_is_read_from_declarations,_not_from_a_literal::resolveDirectories_keeps_both_as_MEMBERS,_but_not_in_overlay_order_—_why_it_is_not_used
  Scenario: resolveDirectories lists both graphs but in a different order
    Given a dep and a root instance each with a skills graph
    When resolveDirectories is asked for both and filtered to KG-only directories
    Then it lists root's skills then dep's skills
    And that differs from the root's resolved skill directories
    # Gap: the root does not depend on dep in this fixture, so the overlay result compared against is root's skills alone, not the reversed pair.

  @test:schemas/skill-overlay.test.ts::the_overlay_is_read_from_declarations,_not_from_a_literal::`provides`_without_'skills'_opts_a_dependency_out
  Scenario: A dependency that provides only content contributes no skills
    Given a root depending on dep with provides ["content"]
    When the root's skill directories are resolved
    Then they are only the root's skills

  @test:schemas/skill-overlay.test.ts::the_overlay_is_read_from_declarations,_not_from_a_literal::a_directory_declared_but_absent_is_not_returned
  Scenario: A declared graph directory that is absent is not returned
    Given an instance declaring its graph at "nope", which does not exist
    When its skill directories are resolved
    Then there are none

  @test:schemas/skill-overlay.test.ts::the_overlay_is_read_from_declarations,_not_from_a_literal::an_UNDECLARED_instance_still_falls_back_to_the_conventions
  Scenario: An undeclared instance falls back to the skills convention
    Given an instance with no declaration and a skills directory
    When its skill directories are resolved
    Then they are exactly its skills directory
    And its own directories include ones declared by "(default)"

  @test:schemas/skill-overlay.test.ts::the_overlay_is_read_from_declarations,_not_from_a_literal::an_undeclared_instance_with_NO_conventional_directory_yields_nothing
  Scenario: An undeclared instance with no conventional directory has no skills
    Given an empty instance with no declaration
    When its skill directories are resolved
    Then there are none

  @test:schemas/skill-overlay.test.ts::the_overlay_is_read_from_declarations,_not_from_a_literal::a_directory_holding_more_than_the_kg_is_excluded
  Scenario: A directory typed as more than the knowledge graph is excluded
    Given an instance whose schemas directory is typed both schemas and cat-harness
    When its skill directories are resolved
    Then there are none

  @test:schemas/skill-overlay.test.ts::a_REPOSITORY-scoped_directory_resolves_against_the_repository::ownDirectories_resolves_`scope:_repository`_one_level_out
  Scenario: A repository-scoped directory resolves one level out
    Given an instance inside a repository declaring its graph at "sibling" with scope repository
    When its own directories and skill directories are resolved
    Then both are the repository's sibling directory

  @test:schemas/skill-overlay.test.ts::a_REPOSITORY-scoped_directory_resolves_against_the_repository::...and_WITHOUT_the_scope_the_same_declaration_resolves_inside
  Scenario: Without the scope the same path resolves inside the instance
    Given the same declaration without a scope
    When its own directories are resolved
    Then the graph is the instance's own sibling directory
    And there are no skill directories, since that directory does not exist

  @test:schemas/skill-overlay.test.ts::a_REPOSITORY-scoped_directory_resolves_against_the_repository::a_DEPENDENCY's_repository-scoped_entry_is_not_inherited
  Scenario: A dependency's repository-scoped graph is not inherited
    Given a root instance depending on an instance whose graph is repository-scoped
    When the root's skill directories are resolved
    Then they are only the root's skills, and not the dependency's repository sibling

  @test:schemas/skill-overlay.test.ts::the_two_resolvers_agree_about_what_a_declaration_means::an_instance_that_declares_NOTHING_keeps_its_conventional_directories
  Scenario: Conventional directories on disk are kept beside a declared graph
    Given an instance declaring only its skills graph, with beans and uploads directories on disk
    When its own directories are listed
    Then their ids include beans and uploads
    # Gap: the title says the instance declares nothing, but the fixture declares its graph directory; what is shown is that conventional directories survive alongside one declared entry.

  @test:schemas/skill-overlay.test.ts::the_two_resolvers_agree_about_what_a_declaration_means::a_default_that_is_NOT_on_disk_is_not_resolved_—_dh4f,_not_generosity
  Scenario: A conventional directory that is not on disk is not resolved
    Given an instance declaring its graph at kg, with no other directories on disk
    When its own directories are listed
    Then none of beans, todos, uploads, library or voices is among them

  @test:schemas/skill-overlay.test.ts::the_two_resolvers_agree_about_what_a_declaration_means::a_declared_entry_OVERRIDES_the_default_of_the_same_id
  Scenario: A declared graph overrides the default skills entry
    Given an instance declaring its graph at kg
    When its own directories with id "skills" are listed
    Then there is exactly one, at kg, not declared by "(default)"

  @test:schemas/skill-overlay.test.ts::the_two_resolvers_agree_about_what_a_declaration_means::and_the_two_functions_return_the_same_ids_for_the_same_root
  Scenario: ownDirectories and resolveDirectories return the same ids
    Given an instance with a skills graph and beans and uploads on disk
    When both resolvers list its directory ids
    Then the sorted ids are equal and number more than two
