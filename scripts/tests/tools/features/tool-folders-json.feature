# A Tool declared as data (`<id>/<id>.json`, bean y9r6) is discovered like a
# `.ts` one: type references resolve to the same IRIs and `$comment` is
# ignored. Each Scenario names the test that executes it.
Feature: A Tool declared as JSON in its folder is read like a TypeScript one

  @test:scripts/tests/tools/tool-folders-json.test.ts::toolsFromFolders_reads_<id>/<id>.json::type_references_resolve_against_the_base;_$comment_is_dropped
  Scenario: A JSON Tool's type references resolve and its $comment is dropped
    Given a folder alpha/alpha.json declaring Tool "alpha" with an input of $type "Flag" and a $comment
    When the Tools are read from the folders against a base IRI
    Then the Tool's id is "alpha"
    And its input's schema is the Flag type IRI under that base
    And the Tool carries no "$comment"

  @test:scripts/tests/tools/tool-folders-json.test.ts::toolsFromFolders_reads_<id>/<id>.json::a_folder_holding_both_forms_is_refused
  Scenario: A folder holding both a .json and a .ts Tool is refused
    Given a folder beta holding both beta.json and beta.ts
    When the Tools are read from the folders
    Then reading throws an error saying "twice"

  @test:scripts/tests/tools/tool-folders-json.test.ts::toolsFromFolders_reads_<id>/<id>.json::an_unknown_type,_or_a_missing_$schema,_is_refused
  Scenario: An unknown type or a missing $schema is refused
    Given a JSON Tool whose input has $type "NoSuchType"
    When the Tools are read
    Then reading throws "unknown Tool type"
    And when the file has no $schema, reading throws naming "tool-definition/v1"
