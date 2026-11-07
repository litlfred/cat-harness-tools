# Specifies schemas/content/document-structure.ts's notebook variant
# (NotebookStructureSchema, structureOf, pagesOf) and that structureOf answers
# anything else with a reason. The checkout-reading tests are specified with
# test/document-structure-checkout.test.ts.
Feature: A notebook structure reads by cell, and anything unrecognised is a reason

  @test:schemas/content/document-structure.test.ts::the_notebook_variant::reads_with_cell_locators,_and_pagesOf_gives_nothing_rather_than_a_cell_index
  Scenario: A notebook reads with cell locators and has no pages
    Given a notebook structure "notebook-structure/v1" with two heading sections, cells 0–1 and 2–3
    When its structure is read
    Then the variant is "notebook"
    And the first section's locator is cells 0 to 1
    And pagesOf that section is undefined

  @test:schemas/content/document-structure.test.ts::the_notebook_variant::a_notebook_with_no_headings_must_say_so
  Scenario: A notebook with no headings must carry a structure note
    Given the two-section notebook structure with toc_source "none"
    When it is parsed with the notebook schema without a structure note, and with one
    Then without it is refused
    And with it is accepted

  @test:schemas/content/document-structure.test.ts::the_notebook_variant::a_section_cannot_end_before_it_starts
  Scenario: A section ending before it starts gives a reason
    Given the two-section notebook structure with its first section, starting at cell 0, ending at cell -1
    When its structure is read
    Then the answer is a reason
    # A negative cell_end is also out of range on its own; the body does not
    # separate "ends before it starts" from "negative".

  @test:schemas/content/document-structure.test.ts::anything_else_is_a_reason,_never_an_empty_section_list::an_unknown_tag_is_named
  Scenario: An unknown tag is named in the reason
    Given a structure tagged "html-structure/v1" with no sections
    When its structure is read
    Then the answer is a reason containing "html-structure/v1"

  @test:schemas/content/document-structure.test.ts::anything_else_is_a_reason,_never_an_empty_section_list::no_tag_at_all
  Scenario: A structure with no tag gives a reason
    Given a structure with no "_schema" and no sections
    When its structure is read
    Then the answer is a reason
