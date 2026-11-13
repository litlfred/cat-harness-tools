# Specifies a todo's tags and their resolution against the knowledge graph
# (schemas/sdlc/todo.ts, src/core/feedback.ts), and a todo's declared theme
# (schemas/constraints.ts, scripts/todos.ts).
Feature: A todo's tags resolve against the knowledge graph, and its theme is declared, never guessed

  @test:schemas/todo.test.ts::tag_shapes::a_task_reference_is_a_PAIR,_never_a_bare_id
  Scenario: A task reference names its process
    Given a task reference with only a task id, and one with a process and task
    When each is parsed
    Then the first throws and the second parses

  @test:schemas/todo.test.ts::tag_shapes::an_identity_is_provider-qualified
  Scenario: An identity names its provider
    Given an identity with only an id, and one with provider github
    When each is parsed
    Then the first throws and the second parses

  @test:schemas/todo.test.ts::tag_shapes::the_actor_link_is_optional_—_an_outside_person_is_still_a_person
  Scenario: An identity needs no actor link
    Given a github identity with no actor
    When it is parsed
    Then it parses with no actor

  @test:schemas/todo.test.ts::tag_shapes::every_tag_axis_defaults_to_an_empty_array
  Scenario: Every tag axis defaults to empty
    Given empty tags
    When they are parsed
    Then roles, processes, tasks, identities, references and artefacts are all empty

  @test:schemas/todo.test.ts::tag_shapes::several_people_can_be_tagged_on_ONE_todo
  Scenario: A todo may tag several people
    Given tags naming two github identities
    When they are parsed
    Then both identities are kept

  @test:schemas/todo.test.ts::tag_shapes::references_point_at_a_declared_node_kind,_and_an_undeclared_one_is_refused
  Scenario: References name declared node kinds
    Given references to a skill and to a bean with a note
    When the tags are parsed
    Then both are kept with the note
    And a reference of kind "some-future-kind" is refused

  @test:schemas/todo.test.ts::tag_shapes::a_todo_file_declares_what_it_is
  Scenario: A todo node must carry its $schema
    Given a todo without $schema and one with the todo schema tag
    When each is parsed
    Then the first throws and the second parses with empty roles

  @test:schemas/todo.test.ts::resolution_against_the_knowledge_graph::a_known_role,_process_and_task_all_resolve
  Scenario: Known role, process and task resolve
    Given an index with roles editor and author, process Process_CRDM and its tasks
    When tags naming editor, Process_CRDM and its task A_Implement are resolved
    Then every tag is resolved and none dangles

  @test:schemas/todo.test.ts::resolution_against_the_knowledge_graph::an_unknown_role_dangles
  Scenario: An unknown role dangles
    Given the same index
    When the role "no-such-role" is resolved
    Then it dangles

  @test:schemas/todo.test.ts::resolution_against_the_knowledge_graph::a_task_in_a_process_the_index_does_not_know_DANGLES,_not_not-checked
  Scenario: A task in an unknown process dangles
    Given the same index
    When task A_X of Process_Ghost is resolved
    Then it dangles

  @test:schemas/todo.test.ts::resolution_against_the_knowledge_graph::a_task_that_is_not_an_activity_of_its_named_process_dangles
  Scenario: A task its process does not have dangles
    Given the same index
    When task A_Nope of Process_CRDM is resolved
    Then it dangles

  @test:schemas/todo.test.ts::resolution_against_the_knowledge_graph::the_task_ref_names_its_process,_so_the_finding_is_actionable
  Scenario: A dangling task's finding names its process and task
    Given the dangling task A_Nope of Process_CRDM
    When it is resolved
    Then its reference names both Process_CRDM and A_Nope

  @test:schemas/todo.test.ts::not-checked_is_a_third_state_and_never_collapses::an_unreadable_role_index_reports_not-checked,_NOT_dangling
  Scenario: Roles are not checked when there is no role index
    Given an index with no roles
    When roles editor and ghost are resolved
    Then both are not-checked and none dangles

  @test:schemas/todo.test.ts::not-checked_is_a_third_state_and_never_collapses::an_unreadable_task_index_reports_not-checked
  Scenario: Tasks are not checked when there is no task index
    Given an index with roles but no tasks
    When a task is resolved
    Then it is not-checked

  @test:schemas/todo.test.ts::not-checked_is_a_third_state_and_never_collapses::an_EMPTY_index_is_a_determined_empty,_so_its_tags_dangle
  Scenario: An empty role index makes roles dangle
    Given an index whose role set is empty
    When role editor is resolved
    Then it dangles

  @test:schemas/todo.test.ts::not-checked_is_a_third_state_and_never_collapses::an_UNLINKED_identity_is_not_checked_and_not_dangling
  Scenario: An identity with no actor link yields no resolution
    Given a github identity with no actor
    When the tags are resolved
    Then there are no results

  @test:schemas/todo.test.ts::not-checked_is_a_third_state_and_never_collapses::a_LINKED_identity_naming_an_unknown_actor_dangles
  Scenario: An identity linked to an unknown actor dangles
    Given an identity linked to actor "no-such-actor"
    When the tags are resolved
    Then the actor "no-such-actor" dangles

  @test:schemas/todo.test.ts::not-checked_is_a_third_state_and_never_collapses::buildKgIndex_reads_the_live_harness_roles,_processes,_tasks_and_actors,_and_returns_undefined_for_absent_directories_(bean_c4rz)
  Scenario: The live index reads the harness and an absent checkout reads nothing
    Given the harness root
    When its knowledge-graph index is built
    Then roles, processes, tasks and actors are each non-empty
    And for a nonexistent directory all four are undefined
    And tags resolved against that empty index are all not-checked

  @test:schemas/todo.test.ts::a_todo's_theme_—_declared,_defaulted,_and_never_guessed::the_store_declares_a_default,_and_it_is_a_real_theme
  Scenario: The todo store declares a real default theme
    Given the todo store's default theme
    When it is looked up
    Then it is defined and is a known theme

  @test:schemas/todo.test.ts::a_todo's_theme_—_declared,_defaulted,_and_never_guessed::every_theme_a_todo_names_exists
  Scenario: Every theme a stored todo names exists
    Given the stored todos
    When the themes they name are looked up
    Then none is unknown

  @test:schemas/todo.test.ts::a_todo's_theme_—_declared,_defaulted,_and_never_guessed::every_theme_a_todo_names_can_actually_BACK_a_sticky
  Scenario: Every theme a stored todo names has its backdrop art
    Given the stored todos that name a theme and the harness's declared images
    When each theme's backdrop is resolved
    Then nothing is missing

  @test:schemas/todo.test.ts::a_todo's_theme_—_declared,_defaulted,_and_never_guessed::a_todo's_OWN_theme_is_kept_unresolved_—_the_default_is_applied_later
  Scenario: A todo without a theme is not given the default on parse
    Given a todo node with no theme
    When it is parsed
    Then it has no theme

  @test:schemas/todo.test.ts::a_todo's_theme_—_declared,_defaulted,_and_never_guessed::a_theme_id_that_is_not_kebab-case_is_refused
  Scenario: A theme id that is not kebab-case is refused
    Given a todo node with theme "Grumpy Cat"
    When it is parsed
    Then it is refused

  @test:schemas/todo.test.ts::a_todo_declares_its_theme_rather_than_having_one_inferred_(bean_`5y4b`)::the_field_is_OPTIONAL_—_absent_means_the_instance's_own_theme
  Scenario: A todo item's theme is optional
    Given a todo item with no theme
    When it is parsed
    Then it parses with no theme

  @test:schemas/todo.test.ts::a_todo_declares_its_theme_rather_than_having_one_inferred_(bean_`5y4b`)::a_declared_theme_survives_the_parse
  Scenario: A declared theme is kept
    Given a todo item with theme "library"
    When it is parsed
    Then its theme is "library"

  @test:schemas/todo.test.ts::a_todo_declares_its_theme_rather_than_having_one_inferred_(bean_`5y4b`)::an_unknown_theme_PARSES_—_it_is_a_rendering_finding,_not_a_parse_error
  Scenario: An unknown theme parses
    Given a todo item with theme "no-such-theme"
    When it is parsed
    Then it parses

  @test:schemas/todo.test.ts::a_todo_declares_its_theme_rather_than_having_one_inferred_(bean_`5y4b`)::an_empty_theme_is_refused_—_absent_and_blank_are_different_claims
  Scenario: An empty theme is refused
    Given a todo item with an empty theme
    When it is parsed
    Then it is refused
