# Specifies checkLicenceExpression (schemas/library/spdx-license-expression.ts)
# against an SPDX licence list, the pinned list snapshot
# (scripts/pin-spdx-license-list.ts) and the source-licence verdict
# (scripts/check-source-licence.ts).
Feature: A licence expression is checked against the pinned SPDX licence list

  @test:schemas/spdx-license-expression.test.ts::valid_expressions::a_listed_id,_a_LicenseRef,_and_a_DocumentRef-qualified_LicenseRef
  Scenario: Listed ids and LicenseRefs are valid
    Given a small licence list
    When "MIT", "LicenseRef-W3C-Document-License" and "DocumentRef-spdx-tool-1.2:LicenseRef-MIT-Style-2" are checked
    Then none has a problem

  @test:schemas/spdx-license-expression.test.ts::valid_expressions::AND,_OR,_WITH,_`+`,_parentheses_—_and_lower-case_operators
  Scenario: Compound expressions are valid
    Given the small licence list
    When expressions using AND, OR, WITH, an AdditionRef, a trailing +, parentheses and all-lower-case operators are checked
    Then none has a problem

  @test:schemas/spdx-license-expression.test.ts::valid_expressions::matches_ids_case-insensitively_and_reports_the_canonical_spelling
  Scenario: An id is matched case-insensitively and its canonical spelling reported
    Given the expression "apache-2.0"
    When it is checked
    Then it has no problem and reports recasing to "Apache-2.0"

  @test:schemas/spdx-license-expression.test.ts::valid_expressions::reports_a_deprecated_id_without_refusing_it
  Scenario: A deprecated id is reported but not refused
    Given the expression "GPL-2.0 OR MIT" where GPL-2.0 is deprecated
    When it is checked
    Then it has no problem and reports GPL-2.0 as deprecated

  @test:schemas/spdx-license-expression.test.ts::invalid_expressions::an_id_that_is_not_on_the_list_—_the_typo_this_exists_to_catch
  Scenario: An id not on the list is refused
    Given the expression "CC-BY-3.O"
    When it is checked
    Then the problem says it is not a licence id

  @test:schemas/spdx-license-expression.test.ts::invalid_expressions::an_exception_used_as_a_licence,_and_a_licence_used_as_an_exception
  Scenario: Exceptions and licences may not swap places
    Given "Classpath-exception-2.0" alone and "MIT WITH Apache-2.0"
    When each is checked
    Then the first is not a licence id and the second's exception is not an exception id

  @test:schemas/spdx-license-expression.test.ts::invalid_expressions::mixed-case_operators_(sec-328)
  Scenario: Mixed-case operators are refused
    Given "MIT And Apache-2.0"
    When it is checked
    Then the problem says operators must be all upper or all lower case

  @test:schemas/spdx-license-expression.test.ts::invalid_expressions::two_licences_with_no_operator
  Scenario: Two licences with no operator are refused
    Given "MIT Apache-2.0"
    When it is checked
    Then the problem says licences are joined by AND, OR or WITH

  @test:schemas/spdx-license-expression.test.ts::invalid_expressions::unbalanced_parentheses
  Scenario: Unbalanced parentheses are refused
    Given "(MIT OR Apache-2.0" and "MIT)"
    When each is checked
    Then the first is not closed and the second has no opening

  @test:schemas/spdx-license-expression.test.ts::invalid_expressions::WITH_on_a_parenthesised_expression_(the_grammar_binds_it_to_a_simple-expression)
  Scenario: WITH on a parenthesised expression is refused
    Given "(MIT) WITH Classpath-exception-2.0"
    When it is checked
    Then the problem says WITH applies to a single licence

  @test:schemas/spdx-license-expression.test.ts::invalid_expressions::a_malformed_LicenseRef,_a_dangling_operator,_and_the_empty_string
  Scenario: Malformed refs, dangling operators and blank expressions are refused
    Given "LicenseRef-", "MIT AND", "WITH Classpath-exception-2.0" and a blank string
    When each is checked
    Then each has a problem naming the malformation

  @test:schemas/spdx-license-expression.test.ts::the_pinned_edition::the_committed_snapshot_loads_and_agrees_with_its_pin
  Scenario: The committed licence list loads and accepts real expressions
    Given the SPDX licence list committed in the checkout
    When it is loaded, which answers a problem instead of a list if its edition differs from the pin
    Then it is a list holding more than 500 licences
    And expressions used by the corpus such as "Apache-2.0 AND MIT", "CC-BY-3.0-IGO" and "EUPL-1.2" have no problem

  @test:schemas/spdx-license-expression.test.ts::the_pinned_edition::the_pin_script_refuses_data_from_another_edition
  Scenario: The pin script refuses data from another edition
    Given licence and exception data of edition 3.28.0
    When a snapshot is made for pin 3.29.0
    Then it throws naming the pin 3.29.0
    And for pin 3.28.0 the snapshot holds MIT as an spdx-license concept

  @test:schemas/spdx-license-expression.test.ts::the_pinned_edition::an_unloadable_list_is_could-not-determine,_never_a_pass
  Scenario: An unloadable licence list makes the verdict unknown
    Given a source-licence report whose list problem is "missing"
    When it is judged
    Then the verdict is "unknown"
