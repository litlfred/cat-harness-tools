# Specifies the instance declaration (schemas/kg/cat-harness.ts): reading a
# declaration, how directories are inherited and overridden, the graph
# typology registry and its layers, materialising directories, default
# directories, and how instances and their directories are discovered.
Feature: A layer's declaration names its directories, which resolve, inherit and materialise predictably

  @test:schemas/cat-harness.test.ts::reading_a_declaration::reads_directories_and_their_graph_typologies
  Scenario: A declaration's directories and typologies are read
    Given the agentic-harness fixture declaring tools, kg and schemas
    When its declaration is read
    Then its name is agentic-harness and its directory ids are kg, schemas and tools

  @test:schemas/cat-harness.test.ts::reading_a_declaration::an_absent_declaration_is_undefined,_not_an_error
  Scenario: An absent declaration reads as undefined
    Given a directory with no declaration
    When it is read
    Then the result is undefined

  @test:schemas/cat-harness.test.ts::reading_a_declaration::a_present_but_unreadable_declaration_throws
  Scenario: An unreadable declaration throws
    Given a declaration file that is not JSON
    When it is read
    Then it throws "not valid JSON"

  @test:schemas/cat-harness.test.ts::reading_a_declaration::a_legacy_`dependents`_field_is_accepted_and_ignored_(retired_2026-09-30,_option_A)
  Scenario: A legacy dependents field is accepted and dropped
    Given a declaration whose uploads directory carries dependents "reproduce"
    When it is read
    Then the directory is read and has no dependents field

  @test:schemas/cat-harness.test.ts::reading_a_declaration::rejects_an_unknown_graph_typology_rather_than_accepting_it
  Scenario: An unknown graph typology is refused with the known kinds
    Given a declaration typing a directory "wishful"
    When it is read
    Then the error names the unknown typology "wishful" and lists the known kinds, tools among them

  @test:schemas/cat-harness.test.ts::reading_a_declaration::accepts_the_JSON-LD_projection_as_input,_not_just_the_authored_form
  Scenario: The JSON-LD projection of a declaration reads back
    Given the agentic-harness declaration written as its JSON-LD projection
    When it is read
    Then its directory ids are kg, schemas and tools
    And kg's typology reads back as cat-harness

  @test:schemas/cat-harness.test.ts::inheritance_—_the_Phase_0.3_gate::core_scans_its_own_folio/_AND_the_three_it_inherits_from_the_harness
  Scenario: A layer scans its own directories and those it inherits
    Given core declaring folio, after agentic-harness declaring tools, kg and schemas
    When their directories are resolved with core as own
    Then the ids are folio, kg, schemas and tools
    And folio is core's own, while tools is inherited from agentic-harness at its path

  @test:schemas/cat-harness.test.ts::inheritance_—_the_Phase_0.3_gate::an_instance_with_no_folio/_is_ordinary_—_agentic-harness_is_exactly_that
  Scenario: A layer with no folio has no renderable directory
    Given agentic-harness alone as own
    When its directories are resolved
    Then none is renderable and there are three

  @test:schemas/cat-harness.test.ts::inheritance_—_the_Phase_0.3_gate::overriding_matches_on_id,_not_path_—_a_relocation_replaces,_never_duplicates
  Scenario: An override by id replaces the inherited directory
    Given relocated declaring kg at graph/knowledge/ after agentic-harness
    When their directories are resolved
    Then there is one kg, at graph/knowledge/, declared by relocated

  @test:schemas/cat-harness.test.ts::inheritance_—_the_Phase_0.3_gate::a_renamed_id_still_overrides_the_entry_it_meant_(cat-harness_→_skills,_bean_iwtn)
  Scenario: The retired cat-harness id resolves as skills
    Given a declaration whose skills-typed directory has the old id cat-harness
    When its directories are resolved
    Then no directory has id cat-harness and the skills directory is old-skills/

  @test:schemas/cat-harness.test.ts::inheritance_—_the_Phase_0.3_gate::an_override_keeps_the_inherited_position_rather_than_reshuffling_the_scan_order
  Scenario: An override keeps the inherited position
    Given relocated overriding agentic-harness's kg
    When their directories are resolved
    Then the order is tools, kg, schemas

  @test:schemas/cat-harness.test.ts::inheritance_—_the_Phase_0.3_gate::a_chain_of_instances_with_no_declarations_resolves_to_nothing,_not_an_error
  Scenario: A layer with no declaration resolves to nothing
    Given a nonexistent root as own
    When its directories are resolved
    Then there are none

  @test:schemas/cat-harness.test.ts::layering::does_not_import_the_content_vocabulary
  Scenario: The declaration module does not import the content vocabulary
    Given the source of schemas/kg/cat-harness.ts
    When its imports are read
    Then it imports neither jsonld nor block-kinds, and imports namespaces, which exists

  @test:schemas/cat-harness.test.ts::graph_typologies_—_the_harness_declares_its_own,_core_adds_folio::the_harness_owns_exactly_one_renderable_kind_—_the_one_it_can_serve
  Scenario: The harness's only renderable typology is docs
    Given the base graph typologies
    When the renderable ones are listed
    Then they are exactly docs, and folio is not a base typology

  @test:schemas/cat-harness.test.ts::graph_typologies_—_the_harness_declares_its_own,_core_adds_folio::a_bare_harness_registry_does_not_know_`folio`_at_all
  Scenario: A bare registry does not know folio
    Given a new graph typology registry
    When folio is looked up
    Then it is not known, and the registry holds exactly the base typologies

  @test:schemas/cat-harness.test.ts::graph_typologies_—_the_harness_declares_its_own,_core_adds_folio::core's_registration_adds_it,_and_it_is_the_renderable_one
  Scenario: Core's registration adds folio as the renderable typology
    Given a new registry with core's folio typology registered
    When it is read
    Then folio is known and renderable
    And tools, cat-harness, schemas, beans, bean-defs and workflow-state are not renderable

  @test:schemas/cat-harness.test.ts::graph_typologies_—_the_harness_declares_its_own,_core_adds_folio::importing_core_registers_folio_into_the_shared_registry
  Scenario: The shared registry knows folio
    Given the default graph typologies, with core loaded by the test preload
    When folio is looked up
    Then it is known

  @test:schemas/cat-harness.test.ts::graph_typologies_—_the_harness_declares_its_own,_core_adds_folio::registering_the_same_kind_twice_is_a_no-op_—_a_diamond_is_not_a_conflict
  Scenario: Registering the same typology twice is harmless
    Given a registry with folio registered
    When folio is registered again
    Then nothing throws

  @test:schemas/cat-harness.test.ts::graph_typologies_—_the_harness_declares_its_own,_core_adds_folio::registering_a_DIFFERENT_definition_under_one_name_throws
  Scenario: Registering a different definition under one name throws
    Given a registry with folio registered
    When a different folio definition is registered
    Then a typology conflict is thrown

  @test:schemas/cat-harness.test.ts::graph_typologies_—_the_harness_declares_its_own,_core_adds_folio::every_registered_kind_says_what_a_process_does_with_it
  Scenario: Every registered typology has a layer
    Given every registered typology
    When its layer is read
    Then it is content, context, state or derived

  @test:schemas/cat-harness.test.ts::graph_typologies_—_the_harness_declares_its_own,_core_adds_folio::the_predicates_are_not_each_other's_negations
  Scenario: An unknown typology answers no to every predicate
    Given the unknown typology "not-a-kind"
    When its layer and predicates are read
    Then it has no layer and is not content, context or state, nor writable
    And memory is context and not state

  @test:schemas/cat-harness.test.ts::graph_typologies_—_the_harness_declares_its_own,_core_adds_folio::the_four_layers_partition_the_registry_and_none_is_empty
  Scenario: The four layers partition the registry
    Given the typologies of each of the four layers
    When they are combined
    Then together they are exactly the registry, with no typology twice, and none is empty

  @test:schemas/cat-harness.test.ts::graph_typologies_—_the_harness_declares_its_own,_core_adds_folio::only_`state`_is_writable_by_a_running_step
  Scenario: Only state typologies are writable by a step
    Given every registered typology
    When it is asked whether a process may write it
    Then it may exactly when its layer is state

  @test:schemas/cat-harness.test.ts::graph_typologies_—_the_harness_declares_its_own,_core_adds_folio::the_classification_of_the_kinds_a_reader_would_guess_wrong_is_pinned
  Scenario: The layers of easily misjudged typologies are pinned
    Given memory, todos, fsh-guts, qa, health, uploads and library
    When their layers are read
    Then they are context, state, context, state, state, state and derived

  @test:schemas/cat-harness.test.ts::graph_typologies_—_the_harness_declares_its_own,_core_adds_folio::a_diamond_differing_only_in_`holds`_is_a_CONFLICT,_not_a_no-op
  Scenario: Re-registering with a different holds conflicts, but a different summary does not
    Given a probe typology registered
    When it is registered again unchanged, with holds state, and with another summary
    Then the unchanged and the reworded registrations are accepted and the holds change throws

  @test:schemas/cat-harness.test.ts::graph_typologies_—_the_harness_declares_its_own,_core_adds_folio::every_registered_kind_is_a_distinct_GraphTypology_individual
  Scenario: Every registered typology has a distinct IRI
    Given every registered typology
    When its IRI is computed
    Then all IRIs are distinct

  @test:schemas/cat-harness.test.ts::materialiseDirectories::creates_a_declared_directory_that_does_not_exist
  Scenario: A declared directory that does not exist is created
    Given an own library directory and an empty root
    When directories are materialised
    Then library exists and is reported created

  @test:schemas/cat-harness.test.ts::materialiseDirectories::an_inherited_WORKING_STORE_is_reproduced;_inherited_content_is_not_(option_A)::an_inherited_state_store_(uploads)_is_created_in_the_dependent
  Scenario: An inherited state store is created in the dependent
    Given an inherited uploads directory
    When directories are materialised
    Then uploads exists and is reported created

  @test:schemas/cat-harness.test.ts::materialiseDirectories::an_inherited_WORKING_STORE_is_reproduced;_inherited_content_is_not_(option_A)::an_inherited_content_subgraph_(schemas)_is_not_created
  Scenario: An inherited content subgraph is not created
    Given an inherited schemas directory
    When directories are materialised
    Then schemas does not exist and nothing is reported

  @test:schemas/cat-harness.test.ts::materialiseDirectories::an_inherited_WORKING_STORE_is_reproduced;_inherited_content_is_not_(option_A)::an_inherited_repository-scoped_entry_is_not_created_—_it_has_one_location
  Scenario: An inherited repository-scoped directory is not created
    Given an inherited beans directory of scope repository
    When directories are materialised
    Then nothing is reported

  @test:schemas/cat-harness.test.ts::materialiseDirectories::an_inherited_WORKING_STORE_is_reproduced;_inherited_content_is_not_(option_A)::an_instance's_OWN_entry_is_created_—_it_declared_it
  Scenario: A layer's own directory is created
    Given an own schemas directory
    When directories are materialised
    Then schemas exists and is reported created

  @test:schemas/cat-harness.test.ts::materialiseDirectories::is_a_no-op_on_the_second_run
  Scenario: A second run creates nothing
    Given library materialised once
    When directories are materialised again
    Then nothing is created and no marker is written

  @test:schemas/cat-harness.test.ts::materialiseDirectories::never_overwrites_an_existing_keep-marker_—_a_folio_may_have_added_rules
  Scenario: An existing keep-marker is not overwritten
    Given uploads materialised and its .gitignore rewritten with a rule
    When directories are materialised again
    Then the .gitignore keeps the rule

  @test:schemas/cat-harness.test.ts::materialiseDirectories::writes_no_marker_into_a_directory_that_already_holds_files
  Scenario: No marker is written into a directory that holds files
    Given a skills directory already holding a skill file
    When it is materialised
    Then no marker is written and there is no .gitignore

  @test:schemas/cat-harness.test.ts::materialiseDirectories::the_keep-marker_ignores_nothing_—_only_comments
  Scenario: The keep-marker holds only comments
    Given the keep-marker for uploads described as the incoming queue
    When its non-blank, non-comment lines are listed
    Then there are none
    And it says "do not delete me" and gives the description

  @test:schemas/cat-harness.test.ts::materialiseDirectories::RESOLVES_AGAINST_THE_INSTANCE,_not_the_declaring_dependency
  Scenario: Directories are created in the layer, not in the declaring dependency
    Given an inherited library whose resolved path is in the dependency's checkout
    When directories are materialised in the layer's root
    Then library is created in the layer's root, not in the dependency's checkout

  @test:schemas/cat-harness.test.ts::materialiseDirectories::refuses_a_path_that_escapes_the_instance_root
  Scenario: A path escaping the layer root is refused
    Given a directory at ../elsewhere/
    When directories are materialised
    Then it throws "outside the instance"

  @test:schemas/cat-harness.test.ts::materialiseDirectories::--dry-run_reports_without_creating
  Scenario: A dry run reports without creating
    Given an own library directory
    When directories are materialised as a dry run
    Then library is reported created and does not exist

  @test:schemas/cat-harness.test.ts::materialiseDirectories::this_instance_declares_uploads,_and_reaches_a_library
  Scenario: The harness declares uploads and reaches one library
    Given the harness's own directories
    When they are resolved
    Then uploads is among them and exactly one library-typed directory, id library, exists on disk
    And the corpus has more than one library directory

  @test:schemas/cat-harness.test.ts::the_`kg`_→_`cat-harness`_rename_keeps_old_declarations_working::a_registry_resolves_the_deprecated_spelling_to_the_new_kind
  Scenario: A registry resolves kg to cat-harness
    Given a new registry
    When kg is looked up
    Then it is known and is the cat-harness definition
    And the names include cat-harness and not kg

  @test:schemas/cat-harness.test.ts::the_`kg`_→_`cat-harness`_rename_keeps_old_declarations_working::resolveGraphTypology_says_WHICH_spelling_was_used,_so_a_caller_can_warn
  Scenario: resolveGraphTypology names the deprecated spelling
    Given the typologies kg, cat-harness and tools
    When each is resolved
    Then kg resolves to cat-harness with deprecated kg, and the others resolve to themselves

  @test:schemas/cat-harness.test.ts::the_`kg`_→_`cat-harness`_rename_keeps_old_declarations_working::a_declaration_written_against_the_OLD_vocabulary_still_loads
  Scenario: A declaration typed kg still loads
    Given a declaration whose skills directory is typed kg
    When it is read
    Then it loads with typology kg

  @test:schemas/cat-harness.test.ts::default_directories_—_inherit_the_convention,_declare_only_the_deviation::an_instance_declaring_nothing_inherits_the_directories_it_actually_has
  Scenario: A layer declaring no directories inherits the conventional ones on disk
    Given a declaration with only a name, and skills, beans and tools on disk
    When its directories are resolved
    Then they are beans, skills and tools, all by "(default)", with skills at skills/

  @test:schemas/cat-harness.test.ts::default_directories_—_inherit_the_convention,_declare_only_the_deviation::a_default_whose_directory_is_ABSENT_is_not_seeded
  Scenario: A conventional directory not on disk is not seeded
    Given the same layer
    When its directories are resolved
    Then voices, library, uploads, todos and schemas are neither resolved nor created

  @test:schemas/cat-harness.test.ts::default_directories_—_inherit_the_convention,_declare_only_the_deviation::an_explicit_entry_overrides_the_default_of_the_same_id
  Scenario: A declared entry overrides the conventional one of the same id
    Given a layer declaring skills at graph/knowledge/, with tools on disk
    When its directories are resolved
    Then skills is at graph/knowledge/ declared by the layer, and tools by "(default)"

  @test:schemas/cat-harness.test.ts::default_directories_—_inherit_the_convention,_declare_only_the_deviation::an_instance_that_declares_everything_is_unaffected
  Scenario: The harness, which declares everything, gets no defaults
    Given the harness root as own
    When its directories are resolved
    Then there are some and every one is declared by cat-harness

  @test:schemas/cat-harness.test.ts::default_directories_—_inherit_the_convention,_declare_only_the_deviation::no_default_claims_a_kind_the_harness_registry_does_not_know
  Scenario: Every conventional directory names a known typology
    Given a bare registry and the default directories
    When each default's typologies are looked up
    Then each is known

  @test:schemas/cat-harness.test.ts::the_scope_trap::refuses_to_materialise_an_empty_twin_beside_a_directory_that_has_content
  Scenario: An empty twin of a populated repository directory is refused
    Given a repository whose shared/ holds a file and a layer below it
    When the layer materialises its own shared/
    Then it throws about scope and the twin is not created

  @test:schemas/cat-harness.test.ts::the_scope_trap::materialises_normally_when_there_is_no_twin_to_be_confused_with
  Scenario: A directory with no twin is materialised
    Given a layer with no matching repository directory
    When it materialises own/
    Then own/ is created

  @test:schemas/cat-harness.test.ts::directoryForGraph_refuses_an_ambiguous_kind_rather_than_picking_one::two_homes_→_it_throws,_and_the_message_names_both
  Scenario: Two homes for one typology throw, naming both
    Given a declaration with two directories typed cat-harness, first at a/ and second at b/
    When the directory for cat-harness is asked
    Then it throws "declared by 2 directories", naming first (a/) and second (b/)

  @test:schemas/cat-harness.test.ts::directoryForGraph_refuses_an_ambiguous_kind_rather_than_picking_one::...and_it_does_NOT_silently_return_the_first,_which_is_the_whole_defect
  Scenario: The first of two homes is not returned
    Given the same declaration
    When the directory for cat-harness is asked
    Then the answer is not a/

  @test:schemas/cat-harness.test.ts::directoryForGraph_refuses_an_ambiguous_kind_rather_than_picking_one::a_single-homed_kind_in_the_SAME_declaration_still_resolves
  Scenario: A typology with one home in the same declaration resolves
    Given the same declaration, where schemas has the single home a/
    When the directory for schemas is asked
    Then it is a/

  @test:schemas/cat-harness.test.ts::directoryForGraph_refuses_an_ambiguous_kind_rather_than_picking_one::directoriesForGraph_returns_every_home,_in_declaration_order
  Scenario: Every home of a typology is listed in declaration order
    Given the declaration with two cat-harness homes
    When the directories for cat-harness are listed
    Then they are a/ then b/

  @test:schemas/cat-harness.test.ts::directoryForGraph_refuses_an_ambiguous_kind_rather_than_picking_one::a_kind_the_instance_declares_nowhere_is_empty,_not_a_throw
  Scenario: A typology declared nowhere has no home
    Given the same declaration
    When voices is asked for
    Then the list is empty and the single directory is undefined

  @test:schemas/cat-harness.test.ts::a_nested_declaration_is_named_by_its_KIND,_not_by_its_directory::at_the_conventional_path,_the_nested_kinds_are_found
  Scenario: Nested kinds are found at the conventional path
    Given beans declared at beans/ holding beans.json that declares bean-defs
    When the declared kinds are listed
    Then they are bean-defs and beans

  @test:schemas/cat-harness.test.ts::a_nested_declaration_is_named_by_its_KIND,_not_by_its_directory::RELOCATED_to_`work/`,_the_file_keeps_its_name_and_the_kinds_are_STILL_found
  Scenario: Nested kinds are found when the directory is relocated
    Given beans declared at work/ holding beans.json that declares bean-defs
    When the declared kinds are listed
    Then they are bean-defs and beans

  @test:schemas/cat-harness.test.ts::a_nested_declaration_is_named_by_its_KIND,_not_by_its_directory::the_directory-name_convention_still_works_for_a_kind_declaring_no_filename
  Scenario: A kind with no declaration file name uses its directory's name
    Given qa declared at qa/ holding qa.json that declares health
    When the declared kinds are listed
    Then they are health and qa

  @test:schemas/cat-harness.test.ts::a_nested_declaration_is_named_by_its_KIND,_not_by_its_directory::the_two_modules'_constants_agree_with_the_kinds,_because_they_are_derived
  Scenario: The bean and todo graph file constants match their typologies
    Given the beans and todos typologies' declaration files and the two modules' constants
    When they are compared
    Then they agree, as beans.json and todos.json

  @test:schemas/cat-harness.test.ts::instanceRootsIn_—_discovered,_never_listed::finds_the_root_itself_and_every_declaring_subdirectory,_root_first
  Scenario: The root and every declaring subdirectory are instance roots, root first
    Given a declaring root with declaring subdirectories beta and alpha and a plain one
    When the instance roots are listed
    Then they are the root, alpha and beta

  @test:schemas/cat-harness.test.ts::instanceRootsIn_—_discovered,_never_listed::omits_the_root_when_the_root_does_not_declare
  Scenario: A root that does not declare is not an instance root
    Given a non-declaring root with one declaring subdirectory
    When the instance roots are listed
    Then only the subdirectory is listed

  @test:schemas/cat-harness.test.ts::instanceRootsIn_—_discovered,_never_listed::skips_dot-prefixed_directories,_like_every_other_path_guard_here
  Scenario: A dot-prefixed directory is not an instance root
    Given a declaring .hidden subdirectory
    When the instance roots are listed
    Then there are none

  @test:schemas/cat-harness.test.ts::instanceRootsIn_—_discovered,_never_listed::does_not_descend_—_a_declaration_two_levels_down_is_not_an_instance_here
  Scenario: Instance discovery does not descend two levels
    Given a declaration at outer/inner
    When the instance roots are listed
    Then there are none

  @test:schemas/cat-harness.test.ts::instanceRootsIn_—_discovered,_never_listed::finds_EVERY_instance_of_THIS_repository,_which_is_the_defect_it_fixes
  Scenario: Every layer of the composed checkout is found
    Given the checkout two levels above this test
    When its instance roots are listed
    Then they are the twelve layers from bootstrap to who-iris, and the checkout root itself is not among them

  @test:schemas/cat-harness.test.ts::`graphTypologies`_was_`graphs`_until_2026-09-21,_and_the_old_key_still_reads::still_refuses_an_entry_carrying_NEITHER_key
  Scenario: An entry with neither graphTypologies nor graphs is refused
    Given a directory entry with only an id and a path
    When it is parsed as a graph node directory
    Then it is refused

  @test:schemas/cat-harness.test.ts::a_directory_declares_the_theme_it_renders_on_(owner,_2026-09-20)::is_optional_—_absent_means_the_instance's_own_theme
  Scenario: A directory's theme is optional
    Given a directory with no theme
    When it is parsed
    Then it parses with no theme

  @test:schemas/cat-harness.test.ts::a_directory_declares_the_theme_it_renders_on_(owner,_2026-09-20)::refuses_an_empty_theme_—_absent_and_blank_are_different_claims
  Scenario: An empty theme is refused
    Given a directory with an empty theme
    When it is parsed
    Then it is refused

  @test:schemas/cat-harness.test.ts::a_directory_declares_the_theme_it_renders_on_(owner,_2026-09-20)::THE_METHODOLOGIES_TAKE_`analyst`,_and_the_theme_id_is_real
  Scenario: The methodology directories take the analyst theme
    Given the composed checkout's directories that declare a theme of their own
    When they are listed
    Then they are core-methodologies, methodologies and sci-methodologies, each themed analyst, a known theme

  @test:schemas/cat-harness.test.ts::a_directory_declares_the_theme_it_renders_on_(owner,_2026-09-20)::and_NOTHING_else_is_themed_—_a_field_that_fires_on_every_subject_means_nothing
  Scenario: Not every cat-harness directory is themed
    Given cat-harness's declared directories
    When the themed ones are counted
    Then they are fewer than all
    # Gap: the title says nothing else is themed; the test only shows that at least one directory is not.

  @test:schemas/cat-harness.test.ts::ownDirectoryById_—_two_entries,_one_path,_different_scopes::picks_the_instance-scoped_entry_over_a_repository-scoped_one_at_the_same_path
  Scenario: The instance-scoped entry wins over a repository-scoped one at the same path
    Given a repository-scoped root-docs and an instance-scoped docs, both at docs/
    When the own directory with id docs and fallback NOPE is asked
    Then it is the layer's docs/, not the fallback

  @test:schemas/cat-harness.test.ts::ownDirectoryById_—_two_entries,_one_path,_different_scopes::a_repository-scoped_entry_is_NOT_returned_even_when_its_id_matches
  Scenario: A repository-scoped entry is not the layer's own
    Given only a repository-scoped docs entry
    When the own directory with id docs and convention fallback is asked
    Then it is the fallback

  @test:schemas/cat-harness.test.ts::ownDirectoryById_—_two_entries,_one_path,_different_scopes::falls_back_to_the_convention_path_when_nothing_is_declared
  Scenario: With nothing declared the convention path is used
    Given no declared directories
    When the own directory docs is asked
    Then it is the convention path docs

  @test:schemas/cat-harness.test.ts::resolveDirectories_—_from-within_declarations::promotes_the_nested_entry,_under_its_parent's_path
  Scenario: A nested entry is promoted under its parent's path
    Given a layer declaring skills, whose skills.json declares voices as a subgraph
    When its directories are resolved
    Then voices is within skills, at skills/voices, declared by the layer and its own

  @test:schemas/cat-harness.test.ts::resolveDirectories_—_from-within_declarations::a_nested_entry_under_a_DEFAULT_parent_belongs_to_the_root_instance
  Scenario: A nested entry under a conventional parent belongs to the layer
    Given a layer declaring nothing, whose skills.json declares voices
    When its directories are resolved
    Then skills is declared by "(default)" and voices by the layer, as its own
