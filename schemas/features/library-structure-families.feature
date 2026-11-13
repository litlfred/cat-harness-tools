# Specifies how library structure nodes are routed to their schema family
# (schemas/kg/kind-validator.ts): by $schema, or by _schema when absent.
Feature: Library structure nodes are routed to a runnable schema family

  @test:schemas/library-structure-families.test.ts::library_structure_families::each_format_resolves_to_a_runnable_schema
  Scenario: Each library structure format resolves to a schema
    Given the node schemas of the "library" typology resolved over the harness
    When the families pdf-structure/v1, notebook-structure/v1 and text-structure/v1 are looked up
    Then each is "resolved"

  @test:schemas/library-structure-families.test.ts::library_structure_families::a_node_is_routed_by_`$schema`,_or_by_`_schema`_when_it_has_none
  Scenario: A node's family tag is $schema, else _schema
    Given nodes with both tags, with only _schema, with neither, and an array
    When the family tag of each is read
    Then $schema wins, _schema is used when alone, and the last two have none

  @test:schemas/library-structure-families.test.ts::library_structure_families::the_body_keeps_the_`_schema`_tag_it_was_routed_by,_and_drops_the_annotations
  Scenario: The validated body keeps the routing _schema and drops annotations
    Given a text-structure node routed by _schema with an _comment annotation
    When its family body is taken
    Then it is the stripped node with its _schema kept
    And a node routed by $schema loses its _schema and _note
    And an untagged node loses its _note
