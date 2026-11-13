# Specifies readSchemaGraph (scripts/schema-graph.ts): the graph of a layer's
# schema declarations, their fields, and the edges between them.
Feature: A layer's schemas/ is read into a graph of declarations and edges

  @test:schemas/schema-graph.test.ts::readSchemaGraph::a_missing_schemas_directory_reads_as_null,_not_as_an_empty_graph
  Scenario: A layer with no schemas directory reads as null
    Given an empty directory
    When its schema graph is read
    Then the result is null

  @test:schemas/schema-graph.test.ts::readSchemaGraph::z.object_fields,_optionality_and_arrays
  Scenario: A z.object's fields, optionality and arrays are read
    Given a module exporting a documented z.object with a required id and an optional array of tags
    When its schema graph is read
    Then the declaration is a zod-object with doc "A thing."
    And its fields are id and tags, tags optional and an array, id not optional

  @test:schemas/schema-graph.test.ts::readSchemaGraph::`z`_is_external,_never_an_unresolved_reference
  Scenario: z is external, not unresolved
    Given a module exporting a z.object
    When its schema graph is read
    Then z is among the declaration's external names and not its unresolved ones

  @test:schemas/schema-graph.test.ts::readSchemaGraph::.extend()_is_an_object_with_a_generalisation_edge,_not_undetermined
  Scenario: An .extend() is an object with an extends edge
    Given SubSchema defined as BaseSchema.extend with one optional field, in another module
    When the schema graph is read
    Then SubSchema is a zod-object that extends BaseSchema with only its own field "extra"
    And an extends edge leads from it to base.ts#BaseSchema

  @test:schemas/schema-graph.test.ts::readSchemaGraph::a_cross-module_field_reference_becomes_a_resolved_edge
  Scenario: A cross-module field reference is a resolved edge
    Given RootSchema with a field of LeafSchema and a field of an array of LeafSchema, imported from another module
    When the schema graph is read
    Then RootSchema refers to exactly leaf.ts#LeafSchema
    And the edge via "many" is an array and the edge via "leaf" is not

  @test:schemas/schema-graph.test.ts::readSchemaGraph::a_declared_concern_group_is_read,_and_an_import_through_an_old-path_shim_still_resolves
  Scenario: A concern group is read and an old-path shim resolves
    Given a schemas.json declaring group kg, LeafSchema moved to kg/leaf.ts with a re-exporting shim at the old path, and modules importing through both
    When the schema graph is read
    Then LeafSchema is declared once, in kg/leaf.ts
    And RootSchema and MidSchema resolve every reference, with nothing unresolved

  @test:schemas/schema-graph.test.ts::readSchemaGraph::an_unrecognised_expression_is_undetermined_and_says_what_it_saw
  Scenario: An unrecognised expression is undetermined, with a note
    Given a module exporting a plain object of zod fields
    When the schema graph is read
    Then that declaration is undetermined and carries a note

  @test:schemas/schema-graph.test.ts::readSchemaGraph::an_interface's_base_goes_to_extendsNames,_not_to_values
  Scenario: An interface's base is a generalisation, not a value
    Given interface Sub extends Base with an optional field
    When the schema graph is read
    Then Sub is an interface extending Base, with no values and an optional field
    And an extends edge leaves Sub

  @test:schemas/schema-graph.test.ts::readSchemaGraph::a_self-reference_through_z.lazy_is_a_box,_not_an_edge
  Scenario: A self-reference through z.lazy draws no self edge
    Given a recursive NodeSchema defined with z.lazy
    When the schema graph is read
    Then no edge leads from NodeSchema to itself

  @test:schemas/schema-graph.test.ts::readSchemaGraph::the_module's_@graphNode_declaration_is_carried_through
  Scenario: A module's @graphNode tag is carried through
    Given a module tagged @graphNode schema, an untagged module, and one tagged none with reason "a barrel"
    When the schema graph is read
    Then their graphNode values are schema, undeclared and none, with the reason kept

  @test:schemas/schema-graph.test.ts::readSchemaGraph::the_reading_is_stable_—_two_reads_of_one_directory_agree_exactly
  Scenario: Two reads of one directory agree exactly
    Given two modules, one referring to the other
    When the schema graph is read twice
    Then the serialised readings are identical
    And an edge reaches a.ts#ASchema

  @test:schemas/schema-graph.test.ts::the_real_schema_graph::reads,_and_is_not_empty
  Scenario: This layer's schema graph is substantial
    Given this layer's own schemas
    When its schema graph is read
    Then it has more than 50 modules, 300 declarations and 100 edges

  @test:schemas/schema-graph.test.ts::the_real_schema_graph::the_corpus_is_mostly_classified_—_undetermined_is_a_handful,_not_a_third
  Scenario: Almost every declaration of this layer is classified
    Given this layer's schema graph
    When undetermined declarations are counted
    Then they are fewer than 2% of all declarations

  @test:schemas/schema-graph.test.ts::the_real_schema_graph::every_edge_lands_on_a_declaration_that_exists
  Scenario: Every edge of this layer's graph joins existing declarations
    Given this layer's schema graph
    When edges whose ends are not declarations are listed
    Then there are none

  @test:schemas/schema-graph.test.ts::the_real_schema_graph::`z`_is_external_everywhere,_and_nowhere_unresolved
  Scenario: No declaration of this layer lists z as unresolved
    Given this layer's schema graph
    When declarations with z unresolved are listed
    Then there are none
    # Gap: the title also claims z is external everywhere; only its absence from the unresolved lists is checked.
