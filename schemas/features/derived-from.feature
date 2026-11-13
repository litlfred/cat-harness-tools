# Specifies the shape of `derivedFrom` on a directory declaration
# (schemas/kg/cat-harness.ts): the ids of the graphs a derived graph is
# computed from.
Feature: A directory's derivedFrom is a non-empty list of distinct directory ids

  @test:schemas/derived-from.test.ts::derivedFrom::absent_is_valid:_'not_declared',_which_check:derived-from_reports_separately
  Scenario: A directory without derivedFrom is valid
    Given a docs directory declaration with no derivedFrom
    When it is parsed with the content directory schema
    Then it parses

  @test:schemas/derived-from.test.ts::derivedFrom::a_list_of_directory_ids_is_valid
  Scenario: A list of directory ids is valid and kept
    Given a directory whose derivedFrom is "artifact-index" and "ig-ast"
    When it is parsed
    Then it parses and derivedFrom is kept in order

  @test:schemas/derived-from.test.ts::derivedFrom::an_empty_list_says_nothing_a_reader_can_act_on,_so_it_is_refused
  Scenario: An empty derivedFrom list is refused
    Given a directory whose derivedFrom is an empty list
    When it is parsed
    Then it is refused

  @test:schemas/derived-from.test.ts::derivedFrom::an_empty_id_is_refused
  Scenario: An empty id in derivedFrom is refused
    Given a directory whose derivedFrom holds an empty string
    When it is parsed
    Then it is refused

  @test:schemas/derived-from.test.ts::derivedFrom::an_id_named_twice_is_refused
  Scenario: An id named twice in derivedFrom is refused
    Given a directory whose derivedFrom is "a" and "a"
    When it is parsed
    Then it is refused with an issue saying "derivedFrom names an id twice"
