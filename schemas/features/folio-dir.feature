# Specifies folioDir (schemas/kg/cat-harness.ts): a folio says where its
# content is, the platform asks, and the folio/ convention is only a fallback.
Feature: A folio's content directory is read from its declaration

  @test:schemas/folio-dir.test.ts::folioDir::a_folio_DECLARING_content/_resolves_to_content/_—_the_qou_case
  Scenario: A folio declaring content/ resolves to content/
    Given a repository whose declaration places the folio graph at "content/"
    When its folio directory is resolved
    Then it is the repository's content/ directory

  @test:schemas/folio-dir.test.ts::folioDir::a_folio_declaring_some_OTHER_path_resolves_there_too
  Scenario: A folio declaring another path resolves there
    Given a repository whose declaration places the folio graph at "paper/"
    When its folio directory is resolved
    Then it is the repository's paper/ directory

  @test:schemas/folio-dir.test.ts::folioDir::no_declaration_falls_back_to_the_CONVENTION,_which_is_folio/
  Scenario: With no declaration the folio directory is folio/
    Given a repository with no declaration
    When its folio directory is resolved
    Then it ends in "folio"

  @test:schemas/folio-dir.test.ts::folioDir::the_fallback_is_never_`content/`_—_that_root_is_excised
  Scenario: The fallback is never content/
    Given a repository with no declaration
    When its folio directory is resolved
    Then it does not end in "content"

  @test:schemas/folio-dir.test.ts::folioDir::a_declaration_that_does_NOT_name_a_folio_graph_falls_back
  Scenario: A declaration naming no folio graph falls back to folio/
    Given a repository whose declaration declares only a beans directory
    When its folio directory is resolved
    Then it is the repository's folio/ directory

  @test:schemas/folio-dir.test.ts::folioDir::a_MALFORMED_declaration_throws_rather_than_guessing
  Scenario: A malformed declaration throws
    Given a repository whose declaration file is not JSON
    When its folio directory is resolved
    Then resolution throws

  @test:schemas/folio-dir.test.ts::end_to_end_—_a_consumer_finds_a_folio_that_declares_content/::findPapers_reads_a_folio_whose_declaration_names_content/
  Scenario: findPapers finds a paper under a declared content/ directory
    Given a repository declaring its folio at "content/" with a demo-paper module
    When findPapers reads it
    Then it finds exactly "demo-paper"
