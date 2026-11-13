# Specifies the instance config (schemas/kg/harness-config.ts): its schema,
# how a layer's dependencies resolve into an ordered graph, the skill and
# translation overlays, and the declared directories a dependent inherits.
Feature: An instance config declares dependencies that resolve deepest first into overlays

  @test:schemas/harness-config.test.ts::FolioAssistantDependencySchema::validates_a_dependency_with_path
  Scenario: A dependency with a path is valid
    Given a dependency named test-dep with a path
    When it is parsed
    Then it parses

  @test:schemas/harness-config.test.ts::FolioAssistantDependencySchema::validates_a_dependency_with_git
  Scenario: A dependency with a git URL is valid
    Given a dependency named test-dep with a git URL
    When it is parsed
    Then it parses

  @test:schemas/harness-config.test.ts::FolioAssistantDependencySchema::rejects_a_dependency_with_neither_path_nor_git
  Scenario: A dependency with neither path nor git is refused
    Given a dependency with only a name
    When it is parsed
    Then it is refused

  @test:schemas/harness-config.test.ts::FolioAssistantDependencySchema::validates_provides_array
  Scenario: A dependency may say what it provides
    Given a dependency with a path providing skills and translations
    When it is parsed
    Then it parses

  @test:schemas/harness-config.test.ts::HarnessConfigSchema::parses_minimal_config
  Scenario: An empty config parses
    Given an empty config
    When it is parsed
    Then it parses

  @test:schemas/harness-config.test.ts::HarnessConfigSchema::parses_full_config
  Scenario: A full config parses
    Given a config with content type, adapter, translation locales and a dependency
    When it is parsed
    Then it parses

  @test:schemas/harness-config.test.ts::readHarnessConfig::reads_a_valid_config
  Scenario: A layer's config is read
    Given a temporary layer whose config has content type document
    When its config is read
    Then it is found with content type document

  @test:schemas/harness-config.test.ts::readHarnessConfig::returns_null_for_missing_directory
  Scenario: A missing directory has no config
    Given the path /nonexistent/path
    When its config is read
    Then the result is null

  @test:schemas/harness-config.test.ts::resolveDependencyPath::resolves_an_absolute_path
  Scenario: An absolute dependency path resolves to itself
    Given dependency dep-a at an absolute path that exists
    When its path is resolved
    Then it is that path

  @test:schemas/harness-config.test.ts::resolveDependencyPath::returns_null_for_nonexistent_path
  Scenario: A dependency path that does not exist resolves to null
    Given dependency ghost at /nonexistent/path
    When its path is resolved
    Then the result is null

  @test:schemas/harness-config.test.ts::resolveInstanceGraph::resolves_direct_and_transitive_dependencies,_deepest_first
  Scenario: Direct and transitive dependencies resolve deepest first
    Given the layer depends on dep-a, which depends on dep-b
    When its instance graph is resolved
    Then there are no problems and the order is dep-b then dep-a
    And dep-a needs dep-b

  @test:schemas/harness-config.test.ts::resolveInstanceGraph::reports_a_cycle,_names_every_instance_in_it,_and_orderedDependencies_throws
  Scenario: A dependency cycle is reported and ordering throws
    Given dep-b is made to depend on the root layer
    When the root's instance graph is resolved
    Then the order is empty and a cycle problem names three roots
    And ordering the dependencies throws "dependency cycle"

  @test:schemas/harness-config.test.ts::multiple_inheritance_of_instances_(bean_a1lq)::a_diamond_resolves_ONCE,_below_both_branches_—_not_dropped_as_a_cycle
  Scenario: A diamond dependency resolves once, below both branches
    Given root depends on a and c, and both depend on d
    When root's instance graph is resolved
    Then there are no problems and the order is d, a, c

  @test:schemas/harness-config.test.ts::multiple_inheritance_of_instances_(bean_a1lq)::a_missing_dependency_is_REPORTED;_the_overlay_warns_and_continues_without_it
  Scenario: A missing dependency is reported and the overlay continues without it
    Given partial depends on d and ghost, and ghost does not exist
    When its instance graph is resolved
    Then there is one missing problem, naming ghost
    And ordering its dependencies gives only d, with a warning naming ghost

  @test:schemas/harness-config.test.ts::multiple_inheritance_of_instances_(bean_a1lq)::skill_directories_list_the_shared_layer_once
  Scenario: The shared layer's skills appear once
    Given the diamond under root
    When root's skill directories are resolved
    Then d's skills appear once and root's skills come last

  @test:schemas/harness-config.test.ts::resolveSkillDirs::returns_directories_in_overlay_order
  Scenario: The layer's own skills come last in the overlay
    Given the temporary layer with dependencies
    When its skill directories are resolved
    Then there are at least two and its own skills come last

  @test:schemas/harness-config.test.ts::resolveTranslationDirs::returns_translation_directories
  Scenario: The layer's own translations come last
    Given the temporary layer with dependencies
    When its translation directories are resolved
    Then there is at least one and its own translations come last

  @test:schemas/harness-config.test.ts::a_dependent_instance_inherits_the_ingestion_directories::materialises_the_ingestion_directories_it_passes_down_in_the_DEPENDENT's_own_root
  Scenario: A dependent of the harness gets the ingestion directories in its own root
    Given a downstream layer depending on the harness
    When its declared directories are materialised as a dry run
    Then uploads, and library unless the harness holds a library subgraph, are among them in the dependent's root, declared by cat-harness

  @test:schemas/harness-config.test.ts::a_dependent_instance_inherits_the_ingestion_directories::they_are_inherited,_not_defaults_—_the_declaring_instance_is_named
  Scenario: The inherited ingestion directories are not defaults
    Given the same downstream layer
    When its declared directories are materialised
    Then none of the ingestion directories is declared by "(default)"

  @test:schemas/harness-config.test.ts::a_dependent_instance_inherits_the_ingestion_directories::uploads/_and_library/_are_DISTINCT_declarations,_not_one_directory_twice
  Scenario: uploads and library are distinct directories under the harness
    Given the same downstream layer, the test being skipped when the harness holds a library subgraph
    When its declared directories are materialised
    Then uploads and library differ in path and absolute path

  @test:schemas/harness-config.test.ts::a_dependent_instance_inherits_the_ingestion_directories::the_work_plan_is_NOT_inherited,_which_is_the_contrast_that_makes_this_mean_something
  Scenario: The work plan is not inherited
    Given the same downstream layer
    When its declared directory ids are listed
    Then neither beans nor todos is among them

  @test:schemas/harness-config.test.ts::a_dependent_instance_materialises_its_own_docs/::materialises_docs/_in_the_DEPENDENT's_own_root,_attributed_to_cat-harness
  Scenario: A dependent gets its own docs directory
    Given a downstream layer depending on the harness
    When its declared directories are materialised
    Then docs is among them, in the dependent's root, declared by cat-harness

  @test:schemas/harness-config.test.ts::a_dependent_instance_materialises_its_own_docs/::...and_NOT_the_platform's_own_directories,_which_is_the_contrast
  Scenario: A dependent does not get the platform's own directories
    Given the same downstream layer
    When its declared directory ids are listed
    Then docs is among them and schemas and tools are not

  @test:schemas/harness-config.test.ts::a_dependent_instance_materialises_its_own_docs/::the_work_plan_is_still_NOT_inherited_—_repository-scoped,_and_unaffected
  Scenario: The work plan is still not inherited alongside docs
    Given the same downstream layer
    When its declared directory ids are listed
    Then neither beans nor todos is among them

  @test:schemas/harness-config.test.ts::a_dependent_of_the_content_core_inherits_library/::materialises_library/_in_the_DEPENDENT's_own_root,_declared_by_core_and_not_a_default
  Scenario: A dependent of the content core gets library from core
    Given a downstream layer depending on folio-assistant-core, the test being skipped when core or the library subgraph is absent
    When its declared directories are materialised
    Then library is among them, in the dependent's root, declared by folio-assistant-core

  @test:schemas/harness-config.test.ts::a_dependent_of_the_content_core_inherits_library/::uploads/_and_library/_are_DISTINCT_declarations,_not_one_directory_twice
  Scenario: uploads and library are distinct under the content core
    Given the same downstream layer of the content core
    When its declared directories are materialised
    Then uploads and library differ in path and absolute path
