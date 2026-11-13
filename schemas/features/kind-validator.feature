# Specifies kind validators (schemas/kg/kind-validator.ts): the module#Export
# reference a graph typology names, how it resolves, per-family node schemas,
# instance-qualified references, and kg-validate's routing
# (scripts/kg-validate.ts).
Feature: A node kind's validator is a reference that resolves, is undeclared, or is reported unresolvable

  @test:schemas/kind-validator.test.ts::parseValidatorRef::`module#Export`_splits
  Scenario: A module#Export reference splits into module and export
    Given the reference "schemas/x.ts#XSchema"
    When it is parsed
    Then the module is schemas/x.ts and the export XSchema

  @test:schemas/kind-validator.test.ts::parseValidatorRef::a_bare_module_is_REFUSED_—_the_export_is_not_optional
  Scenario: A reference without an export is refused
    Given the reference "schemas/x.ts"
    When it is parsed
    Then a validator-reference error mentioning #Export is thrown

  @test:schemas/kind-validator.test.ts::parseValidatorRef::an_absolute_or_escaping_module_is_refused
  Scenario: An absolute or climbing module is refused
    Given "/etc/x.ts#S" and "../other/x.ts#S"
    When each is parsed
    Then each throws, saying the module must be instance-relative

  @test:schemas/kind-validator.test.ts::parseValidatorRef::an_empty_half_is_refused
  Scenario: An empty module or export is refused
    Given "#S" and "schemas/x.ts#"
    When each is parsed
    Then each throws a validator-reference error

  @test:schemas/kind-validator.test.ts::isZodSchema::an_interface-shaped_object_is_not_one
  Scenario: Only something with safeParse counts as a schema
    Given an empty object, undefined, and an object with a safeParse function
    When each is tested as a Zod schema
    Then only the last is one

  @test:schemas/kind-validator.test.ts::resolveKindValidator_—_three_states::undeclared_is_its_OWN_state,_not_a_pass_and_not_a_failure
  Scenario: A kind that declares no validator is undeclared
    Given a test kind registered without a validator
    When its validator is resolved
    Then the state is undeclared, because it declares no validator

  @test:schemas/kind-validator.test.ts::resolveKindValidator_—_three_states::a_declared_validator_that_loads_resolves_to_something_runnable
  Scenario: A loadable validator resolves to a runnable schema
    Given a test kind whose validator is the health report schema
    When its validator is resolved
    Then the state is resolved and the schema has a safeParse function

  @test:schemas/kind-validator.test.ts::resolveKindValidator_—_three_states::a_missing_module_is_unresolvable,_and_says_which_path
  Scenario: A missing validator module is unresolvable and named
    Given a test kind whose validator module is schemas/nope.ts
    When its validator is resolved
    Then the state is unresolvable and the reason names nope.ts

  @test:schemas/kind-validator.test.ts::resolveKindValidator_—_three_states::a_missing_export_is_unresolvable
  Scenario: A missing export is unresolvable
    Given a test kind whose validator names NotAThing in the health report module
    When its validator is resolved
    Then the state is unresolvable, saying the module exports no NotAThing

  @test:schemas/kind-validator.test.ts::resolveKindValidator_—_three_states::an_export_that_is_not_a_Zod_schema_is_unresolvable,_not_silently_accepted
  Scenario: An export that is not a schema is unresolvable
    Given a test kind whose validator names HEALTH_CHECKS in the health report module
    When its validator is resolved
    Then the state is unresolvable, saying it is not a Zod schema or is not exported

  @test:schemas/kind-validator.test.ts::resolveKindValidator_—_three_states::an_unknown_kind_is_unresolvable_rather_than_undeclared
  Scenario: An unknown kind is unresolvable
    Given a registry without the kind "ghost"
    When ghost's validator is resolved
    Then the state is unresolvable

  @test:schemas/kind-validator.test.ts::this_instance's_own_kinds::every_declared_validator_resolves,_and_the_count_is_not_asserted
  Scenario: Every validator the harness declares resolves
    Given the kind-validator sweep over the harness
    When it runs
    Then nothing is unresolvable and at least one kind is resolved or undeclared
    And qa is not undeclared but resolved per $schema family

  @test:schemas/kind-validator.test.ts::kindForPath::the_LONGEST_matching_directory_wins,_because_declarations_nest
  Scenario: The most specific directory decides a path's kind
    Given directories beans/ of kind beans and beans/defs/ of kind bean-defs
    When the kind of beans/defs/a.md is found
    Then it is bean-defs

  @test:schemas/kind-validator.test.ts::kindForPath::a_directory_declaring_SEVERAL_graphs_yields_nothing,_rather_than_guessing
  Scenario: A directory of several kinds gives no kind
    Given a schemas/ directory typed both schemas and cat-harness
    When the kind of a file in it is found
    Then there is none

  @test:schemas/kind-validator.test.ts::kindForPath::a_path_outside_the_root_belongs_to_no_kind
  Scenario: A path outside the root has no kind
    Given /etc/passwd and a root of /tmp/x
    When its kind is found
    Then there is none

  @test:schemas/kind-validator.test.ts::per-family_node_schemas_(bean_rdkm)::qa_names_every_family,_and_each_resolves_to_a_schema,_a_shape,_or_a_recorded_absence
  Scenario: The qa kind names its families, none unresolvable
    Given the node schemas of the qa kind over the harness
    When their tags are listed
    Then they are the fourteen qa families from block-qa/v1 to viewer-nav-qa/v1
    And none is unresolvable
    And kg-qa/v1, kg-qa-manifest/v1 and folio-qa-index/v1 are resolved and qa-witness/v1 is a shape

  @test:schemas/kind-validator.test.ts::per-family_node_schemas_(bean_rdkm)::a_shape_is_read_from_source,_fields_and_optionality_included
  Scenario: A shape is read from an interface's source
    Given a module declaring interface Thing with id and optional note
    When the shape of m.ts#Thing is read
    Then it lists id as a required string and note as an optional number
    And reading m.ts#Missing returns a message string

  @test:schemas/kind-validator.test.ts::per-family_node_schemas_(bean_rdkm)::kg-validate_routes_a_qa_node_by_its_$schema_tag
  Scenario: kg-validate routes a qa node by its $schema
    Given a kg-qa node and a qa-witness node written under the harness's test results
    When each path is validated
    Then the kg-qa node is valid and the witness is undetermined

  @test:schemas/kind-validator.test.ts::instance-qualified_references_(bean_quda)::`name:module#Export`_resolves_through_the_instance_that_declares_the_name
  Scenario: An instance-qualified reference resolves through the named instance
    Given the reference "folio-assistant-core:schemas/catalogue.ts#CatalogueSchema"
    When it is parsed
    Then it names instance folio-assistant-core, its module and export
    And folio-assistant-core's root is the harness's sibling
    And an unknown instance has no root, and no instance means the harness itself

  @test:schemas/kind-validator.test.ts::instance-qualified_references_(bean_quda)::the_running_layer's_own_name_resolves_where_no_sibling_search_reaches_it_(bean_w1gy)
  Scenario: The running layer's own name resolves from a lone checkout
    Given a lone git checkout declaring "alone"
    When roots are looked up from it
    Then cat-harness-tools and litlfred/cat-harness-tools resolve to this layer
    And alone resolves to itself, and folio-assistant-core does not resolve

  @test:schemas/kind-validator.test.ts::instance-qualified_references_(bean_quda)::the_harness's_slice_validators,_which_name_this_layer,_resolve_(bean_w1gy)
  Scenario: The slice validators naming this layer resolve
    Given validators naming SliceIndexKind and SliceManifestKind in cat-harness-tools
    When each is resolved
    Then each is resolved

  @test:schemas/kind-validator.test.ts::instance-qualified_references_(bean_quda)::an_escaping_path_is_still_refused_—_the_name_is_the_only_way_out
  Scenario: A climbing path is refused even toward a real layer
    Given "../folio-assistant-core/schemas/catalogue.ts#CatalogueSchema"
    When it is parsed
    Then it throws

  @test:schemas/kind-validator.test.ts::instance-qualified_references_(bean_quda)::top-level_`_`_annotations_are_dropped_before_a_node_is_checked
  Scenario: Top-level underscore annotations are stripped
    Given a node with a top-level _comment and a nested _keep
    When annotations are stripped
    Then only the top-level _comment is removed
    And an array is unchanged
