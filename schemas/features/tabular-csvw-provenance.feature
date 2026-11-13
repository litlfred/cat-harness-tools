# Specifies the source and narrative provenance of a tabular CSVW record
# (schemas/library/tabular-csvw.ts), kept out of the standard CSVW document.
Feature: A CSVW record carries provenance that never reaches the standard document

  @test:schemas/tabular-csvw-provenance.test.ts::provenance_on_a_CSVW_record::is_required:_a_record_without_it_is_refused_(urat_step_5)
  Scenario: A CSVW record without its provenance is refused
    Given a tabular CSVW record with one table
    When it is parsed with no source and no narrative, and with a source but no narrative
    Then both are refused

  @test:schemas/tabular-csvw-provenance.test.ts::provenance_on_a_CSVW_record::carries_the_same_source_and_narrative_blocks_v1_does
  Scenario: A CSVW record carries a source and a narrative
    Given the record with a source naming file, sha256 and sniffed mimetype, and a not-authored narrative
    When it is parsed
    Then its source file is "p.csv"
    And its narrative state is "not-authored"

  @test:schemas/tabular-csvw-provenance.test.ts::provenance_on_a_CSVW_record::rejects_a_narrative_that_breaks_its_own_state_machine
  Scenario: A narrative confirmed with no text is refused
    Given the record with a narrative of no text in state "confirmed"
    When it is parsed
    Then it is refused

  @test:schemas/tabular-csvw-provenance.test.ts::provenance_on_a_CSVW_record::never_reaches_the_CSVW_document_a_standard_reader_is_handed
  Scenario: The CSVW document handed to a standard reader holds only CSVW keys
    Given a parsed record with a source and a narrative
    When it is converted to a CSVW document
    Then every top-level key is a CSVW key
    And the document does not mention "sha256"

  @test:schemas/tabular-csvw-provenance.test.ts::provenance_on_a_CSVW_record::is_not_part_of_what_an_extractor_returns
  Scenario: The extractor's tables schema carries no provenance
    Given a record with a source and a narrative
    When it is parsed with the tables-only schema
    Then the result has no source and no narrative
    And the record without provenance parses with the tables-only schema
